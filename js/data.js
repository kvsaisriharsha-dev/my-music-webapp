import { envConfig } from './config.js';

export const getYouTubeApiKey = () => envConfig.get('YOUTUBE_API_KEY', '');

// Default Themes
export const THEMES = [
  { id: "aurora", name: "Aurora", swatch: "swatch-aurora", desc: "Mystic Purple & Emerald Glow" },
  { id: "ocean", name: "Ocean", swatch: "swatch-ocean", desc: "Deep Abyssal Aqua & Bioluminescence" },
  { id: "sunset", name: "Sunset", swatch: "swatch-sunset", desc: "Warm Coral & Dusky Violet" },
  { id: "cyberpunk", name: "Cyberpunk", swatch: "swatch-cyberpunk", desc: "High Voltage Neon Pink & Cyan" },
  { id: "forest", name: "Forest", swatch: "swatch-forest", desc: "Emerald Mist & Pine Canopy" },
  { id: "space", name: "Space", swatch: "swatch-space", desc: "Deep Cosmic Void & Nebula" },
  { id: "amoled", name: "AMOLED", swatch: "swatch-amoled", desc: "True Deep Black" },
  { id: "minimal", name: "Minimal", swatch: "swatch-minimal", desc: "Sleek Titanium Glass" }
];

// Rich Curated Songs Library with Direct Working Audio & Rich Lyrics
export const INITIAL_SONGS = [
  {
    id: "song-1",
    title: "Starlight Symphony",
    artist: "Astral Echoes",
    album: "Celestial Horizons",
    duration: 198, // 3:18
    cover: "assets/covers/starlight.svg",
    genre: "Chill",
    source: "local",
    url: "https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3",
    synthNote: "C4",
    liked: true,
    lyrics: [
      { time: 0, text: "✦ [Instrumental Aurora Intro] ✦" },
      { time: 12, text: "Drifting through the cosmic night" },
      { time: 24, text: "Violet rays and dancing lights" },
      { time: 38, text: "In the silence of the sky" },
      { time: 54, text: "We watch the neon stars ignite" },
      { time: 70, text: "Starlight symphony, carry me away" },
      { time: 88, text: "Through the glowing clouds till the break of day" },
      { time: 110, text: "Waves of emerald, rivers of gold" },
      { time: 130, text: "Stories of the universe unfolding untold" },
      { time: 160, text: "✦ [Ethereal Synth Solo] ✦" },
      { time: 180, text: "Fading into quiet starlight..." }
    ]
  },
  {
    id: "song-2",
    title: "Midnight City",
    artist: "Neon Skyline",
    album: "Cyber Dreams",
    duration: 214, // 3:34
    cover: "assets/covers/midnight.svg",
    genre: "Focus",
    source: "spotify",
    url: "https://cdn.freesound.org/previews/580/580310_11861866-lq.mp3",
    synthNote: "E4",
    liked: true,
    lyrics: [
      { time: 0, text: "✦ [Synthwave Beat Starts] ✦" },
      { time: 15, text: "High rise towers reflecting rain" },
      { time: 30, text: "Electric pulse inside our veins" },
      { time: 50, text: "Midnight city, sleepless streets" },
      { time: 75, text: "Accelerate to the rhythm of the beat" },
      { time: 100, text: "Neon shadows everywhere" },
      { time: 125, text: "Feel the static in the air" },
      { time: 160, text: "We never sleep, we never fade" },
      { time: 190, text: "In this digital arcade" }
    ]
  },
  {
    id: "song-3",
    title: "Ocean Eyes",
    artist: "Deep Tide",
    album: "Abyssal Whispers",
    duration: 185, // 3:05
    cover: "assets/covers/ocean.svg",
    genre: "Chill",
    source: "youtube",
    url: "https://cdn.freesound.org/previews/556/556708_11861866-lq.mp3",
    synthNote: "G4",
    liked: true,
    lyrics: [
      { time: 0, text: "✦ [Submerged Ambient Flow] ✦" },
      { time: 14, text: "Diving beneath the turquoise blue" },
      { time: 32, text: "Finding pieces of me and you" },
      { time: 52, text: "Bioluminescent coral blooms" },
      { time: 74, text: "Lighting up the deep ocean rooms" },
      { time: 98, text: "Ocean eyes, wash away the strain" },
      { time: 124, text: "Calm the storm and soothe the rain" },
      { time: 150, text: "Floating weights adrift at sea" },
      { time: 170, text: "Just the waters and me" }
    ]
  },
  {
    id: "song-4",
    title: "Lost in Tokyo",
    artist: "Komorebi Sound",
    album: "Neon Alleyways",
    duration: 172, // 2:52
    cover: "assets/covers/tokyo.svg",
    genre: "Focus",
    source: "local",
    url: "https://cdn.freesound.org/previews/518/518888_11861866-lq.mp3",
    synthNote: "A4",
    liked: false,
    lyrics: [
      { time: 0, text: "✦ [Lofi Rain & Melodic Rhodes] ✦" },
      { time: 10, text: "Shibuya crossing in the mist" },
      { time: 26, text: "A memory that still exists" },
      { time: 45, text: "Ramen steam and umbrella lights" },
      { time: 70, text: "Wandering through velvet nights" },
      { time: 95, text: "Lost in Tokyo, finding home" },
      { time: 120, text: "In alleys where the lantern shone" },
      { time: 150, text: "Sweet nostalgia, soft and slow" }
    ]
  },
  {
    id: "song-5",
    title: "Samaja Varagamana",
    artist: "Sid Sriram",
    album: "Ala Vaikunthapurramuloo",
    duration: 220, // 3:40
    cover: "assets/covers/telugu.svg",
    genre: "Telugu",
    source: "spotify",
    url: "https://cdn.freesound.org/previews/476/476672_1015240-lq.mp3",
    synthNote: "F4",
    liked: true,
    lyrics: [
      { time: 0, text: "✦ [Acoustic Strings Intro] ✦" },
      { time: 16, text: "Samaja Varagamana..." },
      { time: 35, text: "Ninu choosi aagipoye naalona spandana" },
      { time: 58, text: "Kallaloki choodagane gundello kotha chithram" },
      { time: 82, text: "Nee premalo munigithe anandam amrutham" },
      { time: 110, text: "✦ [Melodic Violin Interlude] ✦" },
      { time: 140, text: "Vennela dharullo nee jatha nadavali" },
      { time: 170, text: "Prathi janmalo ninnu cherukovaali" }
    ]
  },
  {
    id: "song-6",
    title: "Dreamer",
    artist: "Solaris Project",
    album: "Infinite Mind",
    duration: 245,
    cover: "assets/covers/dreamer.svg",
    genre: "Chill",
    source: "amazon",
    url: "https://cdn.freesound.org/previews/522/522248_11861866-lq.mp3",
    synthNote: "D4",
    liked: false,
    lyrics: [
      { time: 0, text: "✦ [Atmospheric Pads] ✦" },
      { time: 20, text: "Close your eyes, ignite the spark" },
      { time: 50, text: "Build a universe out of the dark" },
      { time: 85, text: "Every dream is a planet born" },
      { time: 120, text: "Shining bright into the morn" }
    ]
  },
  {
    id: "song-7",
    title: "Cybernetic Pulse",
    artist: "Voltage Shift",
    album: "Overdrive 2099",
    duration: 195,
    cover: "assets/covers/cyber.svg",
    genre: "Workout",
    source: "youtube",
    url: "https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3",
    synthNote: "B4",
    liked: true,
    lyrics: [
      { time: 0, text: "✦ [High BPM Electro Drop] ✦" },
      { time: 18, text: "Pulse on fire, circuit complete" },
      { time: 40, text: "Unstoppable momentum on the street" },
      { time: 70, text: "Pushing limits beyond the line" },
      { time: 100, text: "Energy infinite and sublime" }
    ]
  }
];

// Playlists Definition with Matching Artwork Types
export const INITIAL_PLAYLISTS = [
  {
    id: "pl-liked",
    name: "Liked Songs",
    count: 128,
    icon: "heart",
    gradient: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
    category: "Personal"
  },
  {
    id: "pl-coding",
    name: "Coding",
    count: 42,
    icon: "code",
    gradient: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
    category: "Focus"
  },
  {
    id: "pl-nightdrive",
    name: "Night Drive",
    count: 36,
    icon: "car",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #1e1b4b 100%)",
    category: "Vibes"
  },
  {
    id: "pl-workout",
    name: "Workout",
    count: 54,
    icon: "flame",
    gradient: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
    category: "Energy"
  },
  {
    id: "pl-telugu",
    name: "Telugu Hits",
    count: 87,
    icon: "disc",
    gradient: "linear-gradient(135deg, #f59e0b 0%, #ec4899 100%)",
    category: "Regional"
  },
  {
    id: "pl-chill",
    name: "Chill Vibes",
    count: 61,
    icon: "coffee",
    gradient: "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
    category: "Relax"
  },
  {
    id: "pl-english",
    name: "English Favs",
    count: 120,
    icon: "music",
    gradient: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
    category: "Favorites"
  }
];

// App State Store Class
class MusicOSDataStore {
  constructor() {
    this.songs = this.loadState("music_os_songs", INITIAL_SONGS);
    this.playlists = this.loadState("music_os_playlists", INITIAL_PLAYLISTS);
    this.queue = this.loadState("music_os_queue", [...this.songs]);
    this.activeTheme = localStorage.getItem("music_os_theme") || "aurora";
    this.currentTrackIndex = 0;
    this.listeningSeconds = parseInt(localStorage.getItem("music_os_listening_seconds") || "28920", 10); // ~482 mins base
    this.currentFilter = "Recently Played";
    this.activeSource = "All";
    this.searchQuery = "";
  }

  loadState(key, fallback) {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : fallback;
    } catch {
      return fallback;
    }
  }

  saveState(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("Storage error", e);
    }
  }

  getSongs() {
    return this.songs;
  }

  getPlaylists() {
    return this.playlists;
  }

  getQueue() {
    return this.queue;
  }

  getCurrentTrack() {
    if (!this.queue.length) return this.songs[0];
    return this.queue[this.currentTrackIndex] || this.queue[0];
  }

  toggleLike(songId) {
    const song = this.songs.find(s => s.id === songId);
    if (song) {
      song.liked = !song.liked;
      this.saveState("music_os_songs", this.songs);
      // Sync in queue
      this.queue.forEach(q => {
        if (q.id === songId) q.liked = song.liked;
      });
      this.saveState("music_os_queue", this.queue);
    }
    return song ? song.liked : false;
  }

  addTrackToQueue(song) {
    if (!this.queue.find(s => s.id === song.id)) {
      this.queue.push(song);
      this.saveState("music_os_queue", this.queue);
    }
  }

  removeTrackFromQueue(index) {
    if (this.queue.length > 1) {
      this.queue.splice(index, 1);
      if (this.currentTrackIndex >= this.queue.length) {
        this.currentTrackIndex = this.queue.length - 1;
      }
      this.saveState("music_os_queue", this.queue);
    }
  }

  clearQueue() {
    const current = this.getCurrentTrack();
    this.queue = [current];
    this.currentTrackIndex = 0;
    this.saveState("music_os_queue", this.queue);
  }

  createPlaylist(name, category = "Custom") {
    const newPlaylist = {
      id: `pl-${Date.now()}`,
      name: name.trim() || "Untitled Playlist",
      count: 0,
      icon: "music",
      gradient: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
      category,
      songIds: []
    };
    this.playlists.unshift(newPlaylist);
    this.saveState("music_os_playlists", this.playlists);
    return newPlaylist;
  }

  addSongsToPlaylist(playlistId, songIdsArray) {
    const playlist = this.playlists.find(p => p.id === playlistId);
    if (!playlist) return false;
    if (!playlist.songIds) playlist.songIds = [];
    songIdsArray.forEach(id => {
      if (!playlist.songIds.includes(id)) {
        playlist.songIds.push(id);
      }
    });
    playlist.count = playlist.songIds.length;
    this.saveState("music_os_playlists", this.playlists);
    return true;
  }

  removeSongFromPlaylist(playlistId, songId) {
    const playlist = this.playlists.find(p => p.id === playlistId);
    if (!playlist || !playlist.songIds) return false;
    playlist.songIds = playlist.songIds.filter(id => id !== songId);
    playlist.count = playlist.songIds.length;
    this.saveState("music_os_playlists", this.playlists);
    return true;
  }

  incrementListeningTime(seconds = 1) {
    this.listeningSeconds += seconds;
    localStorage.setItem("music_os_listening_seconds", this.listeningSeconds.toString());
  }

  addSong(song) {
    const newSong = {
      id: song.id || `song-${Date.now()}`,
      title: song.title || "Untitled Track",
      artist: song.artist || "Unknown Artist",
      album: song.album || "Imported Music",
      duration: song.duration || 180,
      cover: song.cover || "assets/covers/starlight.svg",
      genre: song.genre || "Chill",
      source: song.source || "local",
      url: song.url || "",
      synthNote: song.synthNote || "C4",
      liked: !!song.liked,
      lyrics: song.lyrics || [
        { time: 0, text: `✦ [Imported: ${song.title}] ✦` },
        { time: 10, text: "Enjoy your music lounge session." }
      ]
    };
    this.songs.unshift(newSong);
    this.saveState("music_os_songs", this.songs);
    this.addTrackToQueue(newSong);
    return newSong;
  }

  deleteSong(songId) {
    this.songs = this.songs.filter(s => s.id !== songId);
    this.queue = this.queue.filter(q => q.id !== songId);
    if (!this.queue.length && this.songs.length) {
      this.queue = [this.songs[0]];
    }
    this.saveState("music_os_songs", this.songs);
    this.saveState("music_os_queue", this.queue);
  }

  getArtists() {
    const artistMap = new Map();
    this.songs.forEach(song => {
      const artist = song.artist || "Unknown Artist";
      if (!artistMap.has(artist)) {
        artistMap.set(artist, {
          name: artist,
          count: 0,
          genre: song.genre,
          sampleSong: song
        });
      }
      artistMap.get(artist).count += 1;
    });
    return Array.from(artistMap.values());
  }

  getAlbums() {
    const albumMap = new Map();
    this.songs.forEach(song => {
      const album = song.album || "Single";
      if (!albumMap.has(album)) {
        albumMap.set(album, {
          name: album,
          artist: song.artist,
          genre: song.genre,
          count: 0,
          sampleSong: song
        });
      }
      albumMap.get(album).count += 1;
    });
    return Array.from(albumMap.values());
  }

  getSongsByArtist(artistName) {
    return this.songs.filter(s => s.artist.toLowerCase() === artistName.toLowerCase());
  }

  getSongsByAlbum(albumName) {
    return this.songs.filter(s => s.album.toLowerCase() === albumName.toLowerCase());
  }

  getSongsByPlaylist(playlistId) {
    if (playlistId === 'pl-liked') {
      return this.songs.filter(s => s.liked);
    }
    const playlist = this.playlists.find(p => p.id === playlistId);
    if (!playlist) return this.songs;
    if (playlist.songIds && playlist.songIds.length > 0) {
      return this.songs.filter(s => playlist.songIds.includes(s.id));
    }
    if (playlist.name === 'Coding') return this.songs.filter(s => s.genre === 'Focus');
    if (playlist.name === 'Night Drive') return this.songs.filter(s => s.genre === 'Chill');
    if (playlist.name === 'Workout') return this.songs.filter(s => s.genre === 'Workout');
    if (playlist.name === 'Telugu Hits') return this.songs.filter(s => s.genre === 'Telugu');
    if (playlist.name === 'Chill Vibes') return this.songs.filter(s => s.genre === 'Chill');
    return this.songs;
  }

  deletePlaylist(playlistId) {
    if (playlistId === 'pl-liked') return false; // Protected default playlist
    this.playlists = this.playlists.filter(p => p.id !== playlistId);
    this.saveState("music_os_playlists", this.playlists);
    return true;
  }

  exportLibraryJSON() {
    const backup = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      songs: this.songs,
      playlists: this.playlists,
      listeningSeconds: this.listeningSeconds,
      activeTheme: this.activeTheme
    };
    return JSON.stringify(backup, null, 2);
  }

  importLibraryJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data.songs)) {
        this.songs = data.songs;
        this.saveState("music_os_songs", this.songs);
      }
      if (Array.isArray(data.playlists)) {
        this.playlists = data.playlists;
        this.saveState("music_os_playlists", this.playlists);
      }
      if (data.listeningSeconds) {
        this.listeningSeconds = data.listeningSeconds;
        localStorage.setItem("music_os_listening_seconds", this.listeningSeconds.toString());
      }
      this.queue = [...this.songs];
      this.saveState("music_os_queue", this.queue);
      return true;
    } catch (e) {
      console.error("JSON Import Error:", e);
      return false;
    }
  }

  resetToDefaults() {
    this.songs = [...INITIAL_SONGS];
    this.playlists = [...INITIAL_PLAYLISTS];
    this.queue = [...this.songs];
    this.listeningSeconds = 0;
    this.saveState("music_os_songs", this.songs);
    this.saveState("music_os_playlists", this.playlists);
    this.saveState("music_os_queue", this.queue);
    localStorage.setItem("music_os_listening_seconds", "0");
  }

  getStats() {
    const totalMinutes = Math.floor(this.listeningSeconds / 60);
    const songsCount = this.songs.length;
    const playlistsCount = this.playlists.length;
    const likedCount = this.songs.filter(s => s.liked).length;

    // Compute real genre breakdown from existing library
    const genreCounts = {};
    this.songs.forEach(s => {
      const g = s.genre || 'Ambient';
      genreCounts[g] = (genreCounts[g] || 0) + 1;
    });

    const topGenres = Object.entries(genreCounts).map(([genre, count]) => ({
      genre,
      count,
      pct: Math.round((count / (this.songs.length || 1)) * 100)
    })).sort((a, b) => b.count - a.count);

    return {
      totalMinutes,
      totalHours: (totalMinutes / 60).toFixed(1),
      songsCount,
      playlistsCount,
      likedCount,
      topGenres,
      trendPercent: 18
    };
  }
}

export const dataStore = new MusicOSDataStore();
