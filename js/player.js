/* ==========================================================================
   MUSIC OS - Audio Player Engine
   HTML5 Audio + Web Audio Synth Fallback + Seek Dragging + Event System
   ========================================================================== */

import { dataStore } from './data.js';

class MusicOSPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.isPlaying = false;
    this.isShuffle = false;
    this.repeatMode = 'all'; // 'all', 'one', 'off'
    this.volume = 0.75;
    this.audio.volume = this.volume;
    this.listeners = new Map();
    this.isDragging = false;
    this.listeningTimer = null;

    // Web Audio Fallback Synthesizer for guaranteed audible sound
    this.audioCtx = null;
    this.synthOsc = null;
    this.synthGain = null;
    this.isUsingSynth = false;

    // Equalizer Nodes
    this.mediaSourceNode = null;
    this.eqFilters = [];
    this.activeEqPreset = localStorage.getItem('music_os_eq_preset') || 'flat';

    this.initAudioEvents();
  }

  initAudioEvents() {
    this.audio.addEventListener('timeupdate', () => {
      if (!this.isDragging) {
        this.emit('timeupdate', {
          currentTime: this.audio.currentTime,
          duration: this.audio.duration || this.getCurrentTrackDuration(),
          progress: this.audio.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0
        });
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.repeatMode === 'one') {
        this.seek(0);
        this.play();
      } else {
        this.next();
      }
    });

    this.audio.addEventListener('error', (e) => {
      console.warn("Audio source load error, falling back to Web Audio Synth", e);
      this.startSynthFallback();
    });
  }

  // Web Audio Context initialization
  ensureAudioCtx() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
        this.initEqualizer();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  initEqualizer() {
    if (!this.audioCtx || this.mediaSourceNode) return;
    try {
      this.mediaSourceNode = this.audioCtx.createMediaElementSource(this.audio);
      const frequencies = [60, 230, 910, 3600, 14000];

      this.eqFilters = frequencies.map((freq, i) => {
        const filter = this.audioCtx.createBiquadFilter();
        if (i === 0) filter.type = 'lowshelf';
        else if (i === frequencies.length - 1) filter.type = 'highshelf';
        else filter.type = 'peaking';
        filter.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        filter.gain.setValueAtTime(0, this.audioCtx.currentTime);
        return filter;
      });

      // Chain filters
      this.mediaSourceNode.connect(this.eqFilters[0]);
      for (let i = 0; i < this.eqFilters.length - 1; i++) {
        this.eqFilters[i].connect(this.eqFilters[i + 1]);
      }
      this.eqFilters[this.eqFilters.length - 1].connect(this.audioCtx.destination);

      this.applyEqualizerPreset(this.activeEqPreset);
    } catch (e) {
      console.warn("Equalizer setup notice:", e);
    }
  }

  applyEqualizerPreset(presetName) {
    this.activeEqPreset = presetName;
    localStorage.setItem('music_os_eq_preset', presetName);

    const presets = {
      flat: [0, 0, 0, 0, 0],
      bass: [6, 4, 0, -2, -3],
      vocal: [-2, 2, 5, 3, -1],
      lofi: [3, 2, -2, -4, -6],
      edm: [5, 3, -1, 3, 5],
      treble: [-3, -1, 1, 4, 6]
    };

    const gains = presets[presetName] || presets.flat;
    if (this.eqFilters.length && this.audioCtx) {
      this.eqFilters.forEach((filter, idx) => {
        filter.gain.setValueAtTime(gains[idx], this.audioCtx.currentTime);
      });
    }
    this.emit('eqchange', { preset: presetName, gains });
  }

  setEqualizerBand(bandIndex, gainVal) {
    const val = Math.max(-12, Math.min(12, parseFloat(gainVal)));
    if (this.eqFilters[bandIndex] && this.audioCtx) {
      this.eqFilters[bandIndex].gain.setValueAtTime(val, this.audioCtx.currentTime);
    }
    this.activeEqPreset = 'custom';
    this.emit('eqbandchange', { band: bandIndex, gain: val });
  }

  getEqualizerGains() {
    if (!this.eqFilters.length) {
      const presets = {
        flat: [0, 0, 0, 0, 0],
        bass: [6, 4, 0, -2, -3],
        vocal: [-2, 2, 5, 3, -1],
        lofi: [3, 2, -2, -4, -6],
        edm: [5, 3, -1, 3, 5],
        treble: [-3, -1, 1, 4, 6]
      };
      return presets[this.activeEqPreset] || [0, 0, 0, 0, 0];
    }
    return this.eqFilters.map(f => f.gain.value);
  }

  startSynthFallback() {
    this.ensureAudioCtx();
    if (!this.audioCtx) return;

    this.stopSynthFallback();
    this.isUsingSynth = true;

    try {
      this.synthOsc = this.audioCtx.createOscillator();
      this.synthGain = this.audioCtx.createGain();

      const track = dataStore.getCurrentTrack();
      const noteFreqs = { 'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88 };
      const freq = noteFreqs[track.synthNote || 'C4'] || 329.63;

      this.synthOsc.type = 'triangle';
      this.synthOsc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      this.synthGain.gain.setValueAtTime(0.01, this.audioCtx.currentTime);
      this.synthGain.gain.exponentialRampToValueAtTime(0.15 * this.volume, this.audioCtx.currentTime + 0.3);

      this.synthOsc.connect(this.synthGain);
      this.synthGain.connect(this.audioCtx.destination);
      this.synthOsc.start();
    } catch (err) {
      console.warn("Synth start error", err);
    }
  }

  stopSynthFallback() {
    if (this.synthOsc) {
      try {
        this.synthOsc.stop();
        this.synthOsc.disconnect();
      } catch {}
      this.synthOsc = null;
    }
    this.isUsingSynth = false;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => cb(data));
    }
  }

  loadTrack(index = 0, autoPlay = true) {
    const queue = dataStore.getQueue();
    if (!queue.length) return;

    dataStore.currentTrackIndex = Math.max(0, Math.min(index, queue.length - 1));
    const track = dataStore.getCurrentTrack();

    this.stopSynthFallback();
    if (track.url) {
      this.audio.src = track.url;
      this.audio.load();
    }

    this.emit('trackchange', track);

    if (autoPlay) {
      this.play();
    } else {
      this.pause();
    }
  }

  play() {
    this.ensureAudioCtx();
    const track = dataStore.getCurrentTrack();

    if (!this.audio.src && track.url) {
      this.audio.src = track.url;
    }

    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.isPlaying = true;
          this.emit('playstate', true);
          this.startListeningTracker();
        })
        .catch(() => {
          // If browser audio blocked or remote URL blocked, start synth backup
          this.startSynthFallback();
          this.isPlaying = true;
          this.emit('playstate', true);
          this.startListeningTracker();
        });
    }
  }

  pause() {
    this.audio.pause();
    this.stopSynthFallback();
    this.isPlaying = false;
    this.emit('playstate', false);
    this.stopListeningTracker();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  next() {
    const queue = dataStore.getQueue();
    if (!queue.length) return;

    let nextIndex;
    if (this.isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = (dataStore.currentTrackIndex + 1) % queue.length;
    }

    this.loadTrack(nextIndex, true);
  }

  prev() {
    const queue = dataStore.getQueue();
    if (!queue.length) return;

    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }

    let prevIndex = (dataStore.currentTrackIndex - 1 + queue.length) % queue.length;
    this.loadTrack(prevIndex, true);
  }

  seek(seconds) {
    if (this.audio.duration && !isNaN(this.audio.duration)) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
    }
    this.syntheticCurrentTime = seconds;
    const duration = this.getCurrentTrackDuration();
    this.emit('timeupdate', {
      currentTime: seconds,
      duration: duration,
      progress: (seconds / duration) * 100
    });
  }

  getCurrentTime() {
    if (this.audio.currentTime && !isNaN(this.audio.currentTime) && this.audio.currentTime > 0) {
      return this.audio.currentTime;
    }
    return this.syntheticCurrentTime || 0;
  }

  seekByPercentage(percent) {
    const duration = this.getCurrentTrackDuration();
    const targetTime = (percent / 100) * duration;
    this.seek(targetTime);
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    this.audio.volume = this.volume;
    if (this.synthGain && this.audioCtx) {
      this.synthGain.gain.setValueAtTime(0.15 * this.volume, this.audioCtx.currentTime);
    }
    this.emit('volumechange', this.volume);
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    this.emit('shufflechange', this.isShuffle);
  }

  toggleRepeat() {
    const modes = ['all', 'one', 'off'];
    const nextIdx = (modes.indexOf(this.repeatMode) + 1) % modes.length;
    this.repeatMode = modes[nextIdx];
    this.emit('repeatchange', this.repeatMode);
  }

  getCurrentTrackDuration() {
    const track = dataStore.getCurrentTrack();
    return (this.audio.duration && !isNaN(this.audio.duration)) ? this.audio.duration : (track ? track.duration : 180);
  }

  startListeningTracker() {
    this.stopListeningTracker();
    let tickCount = 0;
    this.listeningTimer = setInterval(() => {
      if (this.isPlaying) {
        tickCount++;
        // Track stats every 1 second
        if (tickCount % 4 === 0) {
          dataStore.incrementListeningTime(1);
          this.emit('listeningtimeupdate', dataStore.getStats());
        }

        // High precision live time update for synchronized lyrics
        const curTime = this.getCurrentTime();
        if (this.isUsingSynth || !this.audio.duration || isNaN(this.audio.currentTime)) {
          this.syntheticCurrentTime = (this.syntheticCurrentTime || 0) + 0.25;
          const duration = this.getCurrentTrackDuration();
          if (this.syntheticCurrentTime >= duration) {
            this.syntheticCurrentTime = 0;
            this.next();
          } else {
            this.emit('timeupdate', {
              currentTime: this.syntheticCurrentTime,
              duration: duration,
              progress: (this.syntheticCurrentTime / duration) * 100
            });
          }
        } else {
          this.emit('timeupdate', {
            currentTime: this.audio.currentTime,
            duration: this.audio.duration,
            progress: (this.audio.currentTime / this.audio.duration) * 100
          });
        }
      }
    }, 250);
  }

  stopListeningTracker() {
    if (this.listeningTimer) {
      clearInterval(this.listeningTimer);
      this.listeningTimer = null;
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}

export const player = new MusicOSPlayer();
