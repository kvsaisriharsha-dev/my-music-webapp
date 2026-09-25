/* ==========================================================================
   MUSIC OS - Audio Player Engine
   HTML5 Audio + Official YouTube IFrame Player + Web Audio Synth Fallback
   ========================================================================== */

import { dataStore } from './data.js';
import { youtubePlayer } from './youtube-player.js';

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
    this.syntheticCurrentTime = 0;

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
    this.initYouTubeEvents();
  }

  initAudioEvents() {
    this.audio.addEventListener('timeupdate', () => {
      if (!this.isDragging && !this.isCurrentTrackYouTube()) {
        this.emit('timeupdate', {
          currentTime: this.audio.currentTime,
          duration: this.audio.duration || this.getCurrentTrackDuration(),
          progress: this.audio.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0
        });
      }
    });

    this.audio.addEventListener('ended', () => {
      if (!this.isCurrentTrackYouTube()) {
        if (this.repeatMode === 'one') {
          this.seek(0);
          this.play();
        } else {
          this.next();
        }
      }
    });

    this.audio.addEventListener('error', (e) => {
      if (!this.isCurrentTrackYouTube()) {
        const track = dataStore.getCurrentTrack();
        console.warn("[Player] HTML5 audio load error for track:", track?.title, track?.url, e);
        this.isPlaying = false;
        this.emit('playstate', false);
        this.stopListeningTracker();
        if (track && track.isSynthTrack) {
          this.startSynthFallback();
          this.isPlaying = true;
          this.emit('playstate', true);
          this.startListeningTracker();
        } else {
          this.emit('error', { source: 'local', track, message: `Audio unavailable for "${track?.title || 'this track'}".` });
        }
      }
    });
  }

  initYouTubeEvents() {
    // Initialize YouTube Player Adapter
    youtubePlayer.init();

    youtubePlayer.on('play', () => {
      if (this.isCurrentTrackYouTube()) {
        this.isPlaying = true;
        this.emit('playstate', true);
        this.startListeningTracker();
      }
    });

    youtubePlayer.on('pause', () => {
      if (this.isCurrentTrackYouTube()) {
        this.isPlaying = false;
        this.emit('playstate', false);
        this.stopListeningTracker();
      }
    });

    youtubePlayer.on('ended', () => {
      if (this.isCurrentTrackYouTube()) {
        if (this.repeatMode === 'one') {
          this.seek(0);
          this.play();
        } else {
          this.next();
        }
      }
    });

    youtubePlayer.on('error', (errCode) => {
      const track = dataStore.getCurrentTrack();
      console.warn(`[Player] YouTube playback error code ${errCode} for track: "${track?.title}" (videoId: ${track?.videoId || track?.youtubeId || track?.id})`);
      this.isPlaying = false;
      this.emit('playstate', false);
      this.stopListeningTracker();

      let msg = `YouTube track "${track?.title || 'selected'}" is currently unavailable.`;
      if (errCode === 100) msg = `YouTube video for "${track?.title || 'track'}" was not found or removed.`;
      else if (errCode === 101 || errCode === 150) msg = `Embedding disabled by creator for "${track?.title || 'track'}".`;
      else if (errCode === 2) msg = `Invalid YouTube video ID for "${track?.title || 'track'}".`;

      this.emit('error', { source: 'youtube', errorCode: errCode, track, message: msg });
    });
  }

  getYouTubeVideoId(track) {
    if (!track) return null;
    if (track.videoId) return track.videoId;
    if (track.youtubeId) return track.youtubeId;
    if (typeof track.id === 'string' && track.id.startsWith('yt-')) {
      return track.id.replace('yt-', '');
    }
    if (track.url) {
      const match = track.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (match) return match[1];
    }
    return null;
  }

  isCurrentTrackYouTube() {
    const track = dataStore.getCurrentTrack();
    if (!track) return false;
    return track.source === 'youtube' || Boolean(this.getYouTubeVideoId(track));
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
      const freq = noteFreqs[track?.synthNote || 'C4'] || 329.63;

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
    if (!track) return;

    this.stopSynthFallback();
    this.syntheticCurrentTime = 0;

    const ytVideoId = this.getYouTubeVideoId(track);
    const isYT = track.source === 'youtube' || Boolean(ytVideoId);

    if (isYT) {
      if (!ytVideoId) {
        console.warn("[Player] YouTube video ID is missing for track:", track);
        this.emit('trackchange', track);
        this.isPlaying = false;
        this.emit('playstate', false);
        this.stopListeningTracker();
        this.emit('error', { source: 'youtube', track, message: `YouTube track "${track.title}" is unavailable.` });
        return;
      }

      // Pause and clear HTML5 audio source
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();

      // Load official YouTube audio
      youtubePlayer.setVolume(this.volume);
      youtubePlayer.loadVideo(ytVideoId, autoPlay);

      this.emit('trackchange', track);

      if (autoPlay) {
        this.isPlaying = true;
        this.emit('playstate', true);
        this.startListeningTracker();
      } else {
        this.isPlaying = false;
        this.emit('playstate', false);
        this.stopListeningTracker();
      }
    } else {
      // Non-YouTube Track: stop YouTube stream
      youtubePlayer.stop();

      if (track.url) {
        this.audio.src = track.url;
        this.audio.load();
      } else if (!track.isSynthTrack) {
        console.warn("[Player] Local track missing audio URL:", track);
        this.emit('trackchange', track);
        this.isPlaying = false;
        this.emit('playstate', false);
        this.stopListeningTracker();
        this.emit('error', { source: 'local', track, message: `Audio source unavailable for "${track.title}".` });
        return;
      }

      this.emit('trackchange', track);

      if (autoPlay) {
        this.play();
      } else {
        this.pause();
      }
    }
  }

  play() {
    this.ensureAudioCtx();
    const track = dataStore.getCurrentTrack();
    if (!track) return;

    const ytVideoId = this.getYouTubeVideoId(track);
    const isYT = track && (track.source === 'youtube' || Boolean(ytVideoId));

    if (isYT) {
      if (!ytVideoId) {
        console.warn("[Player] Track marked as YouTube but has no videoId:", track);
        this.isPlaying = false;
        this.emit('playstate', false);
        this.emit('error', { source: 'youtube', track, message: `YouTube track "${track.title}" is unavailable.` });
        return;
      }

      this.audio.pause();
      this.stopSynthFallback();
      youtubePlayer.setVolume(this.volume);
      youtubePlayer.play();
      this.isPlaying = true;
      this.emit('playstate', true);
      this.startListeningTracker();
      return;
    }

    // HTML5 Audio playback
    youtubePlayer.pause();
    if (!this.audio.src && track && track.url) {
      this.audio.src = track.url;
    } else if (!track.url && !track.isSynthTrack) {
      console.warn("[Player] Track has no playable URL:", track);
      this.isPlaying = false;
      this.emit('playstate', false);
      this.emit('error', { source: 'local', track, message: `Audio unavailable for "${track.title}".` });
      return;
    }

    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.isPlaying = true;
          this.emit('playstate', true);
          this.startListeningTracker();
        })
        .catch((err) => {
          console.warn("[Player] Audio playback error:", err);
          this.isPlaying = false;
          this.emit('playstate', false);
          this.stopListeningTracker();
          if (track.isSynthTrack) {
            this.startSynthFallback();
            this.isPlaying = true;
            this.emit('playstate', true);
            this.startListeningTracker();
          } else {
            this.emit('error', { source: 'local', track, error: err, message: `Playback failed for "${track.title}".` });
          }
        });
    }
  }

  pause() {
    if (this.isCurrentTrackYouTube()) {
      youtubePlayer.pause();
    }
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

    const curTime = this.getCurrentTime();
    if (curTime > 3) {
      this.seek(0);
      return;
    }

    let prevIndex = (dataStore.currentTrackIndex - 1 + queue.length) % queue.length;
    this.loadTrack(prevIndex, true);
  }

  seek(seconds) {
    if (this.isCurrentTrackYouTube()) {
      youtubePlayer.seekTo(seconds);
    } else {
      if (this.audio.duration && !isNaN(this.audio.duration)) {
        this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
      }
    }

    this.syntheticCurrentTime = seconds;
    const duration = this.getCurrentTrackDuration();
    this.emit('timeupdate', {
      currentTime: seconds,
      duration: duration,
      progress: duration > 0 ? (seconds / duration) * 100 : 0
    });
  }

  getCurrentTime() {
    if (this.isCurrentTrackYouTube()) {
      const ytTime = youtubePlayer.getCurrentTime();
      if (ytTime > 0) return ytTime;
    }
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
    youtubePlayer.setVolume(this.volume);
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
    if (this.isCurrentTrackYouTube()) {
      const ytDur = youtubePlayer.getDuration();
      if (ytDur > 0) return ytDur;
    }
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

        const isYT = this.isCurrentTrackYouTube();
        const duration = this.getCurrentTrackDuration();

        if (isYT) {
          const ytTime = youtubePlayer.getCurrentTime();
          const ytDur = youtubePlayer.getDuration() || duration;
          this.syntheticCurrentTime = ytTime;
          this.emit('timeupdate', {
            currentTime: ytTime,
            duration: ytDur,
            progress: ytDur > 0 ? (ytTime / ytDur) * 100 : 0
          });
        } else if (this.isUsingSynth || !this.audio.duration || isNaN(this.audio.currentTime)) {
          this.syntheticCurrentTime = (this.syntheticCurrentTime || 0) + 0.25;
          if (this.syntheticCurrentTime >= duration) {
            this.syntheticCurrentTime = 0;
            if (this.repeatMode === 'one') {
              this.seek(0);
              this.play();
            } else {
              this.next();
            }
          } else {
            this.emit('timeupdate', {
              currentTime: this.syntheticCurrentTime,
              duration: duration,
              progress: duration > 0 ? (this.syntheticCurrentTime / duration) * 100 : 0
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
