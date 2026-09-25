/* ==========================================================================
   MUSIC OS - Live Search & YouTube API Query Engine
   ========================================================================== */

import { dataStore, getYouTubeApiKey } from './data.js';

class MusicOSSearch {
  constructor() {
    this.debounceTimer = null;
    this.activeSource = 'all';
    this.currentQuery = '';
    this.searchResults = null;
    this.isSearchingYouTube = false;
  }

  init(onResultsCallback) {
    this.onResultsCallback = onResultsCallback;
    this.bindSearchInputs();
    this.bindSourcePills();
  }

  bindSearchInputs() {
    const searchInput = document.getElementById('main-search-input');
    const clearBtn = document.getElementById('search-clear-btn');

    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      this.currentQuery = query;

      if (clearBtn) {
        if (query.length > 0) {
          clearBtn.classList.add('visible');
        } else {
          clearBtn.classList.remove('visible');
        }
      }

      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.performSearch(query);
      }, 250);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.currentQuery = '';
        clearBtn.classList.remove('visible');
        this.performSearch('');
        searchInput.focus();
      });
    }
  }

  bindSourcePills() {
    const pills = document.querySelectorAll('.source-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeSource = pill.getAttribute('data-source') || 'all';
        this.performSearch(this.currentQuery);
      });
    });
  }

  async performSearch(query) {
    const songs = dataStore.getSongs();
    const playlists = dataStore.getPlaylists();

    if (!query) {
      // Return normal filtered library by source
      let filteredSongs = songs;
      if (this.activeSource !== 'all') {
        filteredSongs = songs.filter(s => s.source === this.activeSource);
      }
      this.onResultsCallback({ isQuery: false, songs: filteredSongs, playlists });
      return;
    }

    const q = query.toLowerCase();

    // 1. Local / Cached match
    let matchedSongs = songs.filter(s => {
      const matchText = `${s.title} ${s.artist} ${s.album} ${s.genre}`.toLowerCase();
      const matchSource = this.activeSource === 'all' || s.source === this.activeSource;
      return matchText.includes(q) && matchSource;
    });

    let matchedPlaylists = playlists.filter(p => {
      return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    });

    // 2. If user selects YouTube or queries YouTube music, query YouTube Data API v3
    if (this.activeSource === 'youtube' || q.includes('yt') || matchedSongs.length === 0) {
      try {
        const ytResults = await this.searchYouTubeAPI(query);
        if (ytResults && ytResults.length > 0) {
          matchedSongs = [...matchedSongs, ...ytResults];
        }
      } catch (err) {
        console.warn("YouTube API query bypassed or failed:", err);
      }
    }

    this.onResultsCallback({
      isQuery: true,
      query,
      songs: matchedSongs,
      playlists: matchedPlaylists
    });
  }

  async searchYouTubeAPI(query) {
    const apiKey = getYouTubeApiKey();
    if (!apiKey || !query || query.length < 2) return [];

    try {
      const endpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=4&q=${encodeURIComponent(query + " official audio")}&type=video&key=${apiKey}`;
      const response = await fetch(endpoint);
      if (!response.ok) return [];

      const data = await response.json();
      if (!data.items) return [];

      return data.items.map(item => ({
        id: `yt-${item.id.videoId}`,
        title: item.snippet.title.replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
        artist: item.snippet.channelTitle,
        album: "YouTube Music",
        duration: 210,
        cover: item.snippet.thumbnails?.medium?.url || "assets/covers/starlight.svg",
        genre: "YouTube",
        source: "youtube",
        url: "https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3", // preview fallback audio
        synthNote: "A4",
        liked: false,
        lyrics: [
          { time: 0, text: `✦ [YouTube Stream: ${item.snippet.title}] ✦` },
          { time: 10, text: "Streaming high fidelity audio stream..." }
        ]
      }));
    } catch (e) {
      console.warn("YouTube search error", e);
      return [];
    }
  }
}

export const searchEngine = new MusicOSSearch();
