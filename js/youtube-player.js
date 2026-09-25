/* ==========================================================================
   MUSIC OS - Official YouTube IFrame Player Adapter
   Encapsulates YouTube IFrame Player API for seamless audio playback
   ========================================================================== */

class YouTubePlayerAdapter {
  constructor() {
    this.player = null;
    this.isReady = false;
    this.currentVideoId = null;
    this.pendingVideoId = null;
    this.pendingAutoPlay = false;
    this.listeners = new Map();
    this.volume = 75; // 0-100
    this.isMuted = false;
    this.state = -1; // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: cued
  }

  /**
   * Initializes YouTube IFrame Player API
   */
  init() {
    if (typeof window === 'undefined') return;

    // If container element is missing, create it unobtrusively
    if (!document.getElementById('youtube-player-host')) {
      const container = document.createElement('div');
      container.id = 'youtube-player-host';
      container.style.cssText = 'position: fixed; bottom: 0; left: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; z-index: -1;';
      document.body.appendChild(container);
    }

    // Define global API ready callback
    const prevOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevOnReady) prevOnReady();
      this.createPlayer();
    };

    // Load API script if not already present
    if (!window.YT || !window.YT.Player) {
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    } else {
      this.createPlayer();
    }
  }

  createPlayer() {
    if (this.player || !window.YT || !window.YT.Player) return;

    try {
      this.player = new window.YT.Player('youtube-player-host', {
        height: '200',
        width: '200',
        playerVars: {
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1
        },
        events: {
          onReady: (event) => this.handlePlayerReady(event),
          onStateChange: (event) => this.handleStateChange(event),
          onError: (event) => this.handlePlayerError(event)
        }
      });
    } catch (err) {
      console.warn("YouTube Player initialization error:", err);
    }
  }

  handlePlayerReady(event) {
    this.isReady = true;
    if (this.player && typeof this.player.setVolume === 'function') {
      this.player.setVolume(this.volume);
    }

    this.emit('ready');

    if (this.pendingVideoId) {
      const vid = this.pendingVideoId;
      const play = this.pendingAutoPlay;
      this.pendingVideoId = null;
      this.pendingAutoPlay = false;
      this.loadVideo(vid, play);
    }
  }

  handleStateChange(event) {
    this.state = event.data;
    // YT.PlayerState: ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5
    this.emit('statechange', event.data);

    if (event.data === 1) { // PLAYING
      this.emit('play');
    } else if (event.data === 2) { // PAUSED
      this.emit('pause');
    } else if (event.data === 0) { // ENDED
      this.emit('ended');
    } else if (event.data === 3) { // BUFFERING
      this.emit('buffering');
    }
  }

  handlePlayerError(event) {
    console.warn("YouTube Player error code:", event.data);
    this.emit('error', event.data);
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

  loadVideo(videoId, autoPlay = true) {
    if (!videoId) return;

    this.currentVideoId = videoId;

    if (!this.isReady || !this.player) {
      this.pendingVideoId = videoId;
      this.pendingAutoPlay = autoPlay;
      return;
    }

    try {
      if (autoPlay) {
        this.player.loadVideoById({
          videoId: videoId,
          suggestedQuality: 'small'
        });
      } else {
        this.player.cueVideoById({
          videoId: videoId,
          suggestedQuality: 'small'
        });
      }
    } catch (err) {
      console.warn("Error loading YouTube video ID:", videoId, err);
      this.emit('error', err);
    }
  }

  play() {
    if (this.isReady && this.player && typeof this.player.playVideo === 'function') {
      try {
        this.player.playVideo();
      } catch (e) {
        console.warn("YouTube play error", e);
      }
    }
  }

  pause() {
    if (this.isReady && this.player && typeof this.player.pauseVideo === 'function') {
      try {
        this.player.pauseVideo();
      } catch (e) {
        console.warn("YouTube pause error", e);
      }
    }
  }

  stop() {
    if (this.isReady && this.player && typeof this.player.stopVideo === 'function') {
      try {
        this.player.stopVideo();
      } catch (e) {}
    }
  }

  seekTo(seconds) {
    if (this.isReady && this.player && typeof this.player.seekTo === 'function') {
      try {
        this.player.seekTo(seconds, true);
      } catch (e) {
        console.warn("YouTube seek error", e);
      }
    }
  }

  setVolume(volFraction) {
    // volFraction is 0.0 to 1.0; YouTube expects 0 to 100
    this.volume = Math.round(Math.max(0, Math.min(1, volFraction)) * 100);
    if (this.isReady && this.player && typeof this.player.setVolume === 'function') {
      try {
        this.player.setVolume(this.volume);
      } catch (e) {}
    }
  }

  mute() {
    this.isMuted = true;
    if (this.isReady && this.player && typeof this.player.mute === 'function') {
      try {
        this.player.mute();
      } catch (e) {}
    }
  }

  unMute() {
    this.isMuted = false;
    if (this.isReady && this.player && typeof this.player.unMute === 'function') {
      try {
        this.player.unMute();
      } catch (e) {}
    }
  }

  getCurrentTime() {
    if (this.isReady && this.player && typeof this.player.getCurrentTime === 'function') {
      try {
        const t = this.player.getCurrentTime();
        return isNaN(t) ? 0 : t;
      } catch (e) {
        return 0;
      }
    }
    return 0;
  }

  getDuration() {
    if (this.isReady && this.player && typeof this.player.getDuration === 'function') {
      try {
        const d = this.player.getDuration();
        return (isNaN(d) || d <= 0) ? 0 : d;
      } catch (e) {
        return 0;
      }
    }
    return 0;
  }

  getPlayerState() {
    if (this.isReady && this.player && typeof this.player.getPlayerState === 'function') {
      try {
        return this.player.getPlayerState();
      } catch (e) {
        return -1;
      }
    }
    return this.state;
  }
}

export const youtubePlayer = new YouTubePlayerAdapter();
