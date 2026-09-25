/* ==========================================================================
   MUSIC OS - Unified Global Search & YouTube API Query Engine
   Fast local filtering, debounced YouTube queries, & stale request cancellation
   ========================================================================== */

import { dataStore, getYouTubeApiKey } from './data.js';

class MusicOSSearch {
  constructor() {
    this.debounceTimer = null;
    this.activeSource = 'all'; // 'all', 'youtube', 'local', 'spotify', 'amazon'
    this.currentQuery = '';
    this.onResultsCallback = null;
    this.latestRequestId = 0;
    this.abortController = null;
  }

  init(onResultsCallback) {
    this.onResultsCallback = onResultsCallback;
    this.bindSearchInputs();
    this.bindSourcePills();
  }

  rebind() {
    this.bindSearchInputs();
    this.bindSourcePills();
  }

  bindSearchInputs() {
    const searchInput = document.getElementById('main-search-input');
    const clearBtn = document.getElementById('search-clear-btn');

    if (!searchInput) return;

    // Maintain current query text if applicable
    if (this.currentQuery && searchInput.value !== this.currentQuery) {
      searchInput.value = this.currentQuery;
    }

    if (clearBtn) {
      clearBtn.classList.toggle('visible', searchInput.value.trim().length > 0);
    }

    searchInput.oninput = (e) => {
      const query = e.target.value;
      this.currentQuery = query;
      const trimmed = query.trim();

      if (clearBtn) {
        clearBtn.classList.toggle('visible', trimmed.length > 0);
      }

      const activePage = window.musicOSUI?.currentView || 'Home';
      const isLocalPage = activePage === 'Playlists' || activePage === 'Albums' || activePage === 'Library' || activePage === 'Artists';
      const isLocalSearch = this.activeSource === 'local' || (isLocalPage && this.activeSource !== 'youtube');

      if (isLocalSearch || trimmed.length === 0) {
        // Immediate local filtering without delay
        clearTimeout(this.debounceTimer);
        this.performSearch(trimmed, activePage, false);
      } else {
        // Debounce YouTube API queries (~320ms)
        clearTimeout(this.debounceTimer);
        // Show immediate local results first
        this.performSearch(trimmed, activePage, false, true);
        this.debounceTimer = setTimeout(() => {
          this.performSearch(trimmed, activePage, true);
        }, 320);
      }
    };

    if (clearBtn) {
      clearBtn.onclick = () => {
        searchInput.value = '';
        this.currentQuery = '';
        clearBtn.classList.remove('visible');
        clearTimeout(this.debounceTimer);
        if (this.abortController) {
          this.abortController.abort();
        }
        this.performSearch('', window.musicOSUI?.currentView || 'Home', false);
        searchInput.focus();
      };
    }
  }

  bindSourcePills() {
    const pills = document.querySelectorAll('.source-pill[data-source]');
    pills.forEach(pill => {
      const src = (pill.getAttribute('data-source') || 'all').toLowerCase();
      pill.classList.toggle('active', src === this.activeSource.toLowerCase());

      pill.onclick = () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeSource = src;
        dataStore.activeSource = src;
        this.performSearch(this.currentQuery, window.musicOSUI?.currentView || 'Home', true);
      };
    });
  }

  setSource(source) {
    this.activeSource = (source || 'all').toLowerCase();
    dataStore.activeSource = this.activeSource;
    this.bindSourcePills();
    this.performSearch(this.currentQuery, window.musicOSUI?.currentView || 'Home', true);
  }

  clearSearch() {
    this.currentQuery = '';
    const searchInput = document.getElementById('main-search-input');
    const clearBtn = document.getElementById('search-clear-btn');
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.classList.remove('visible');
    clearTimeout(this.debounceTimer);
    if (this.abortController) {
      this.abortController.abort();
    }
    this.performSearch('', window.musicOSUI?.currentView || 'Home', false);
  }

  async performSearch(query = this.currentQuery, pageContext = null, allowRemote = true, localOnlyPrepass = false) {
    const activePage = pageContext || window.musicOSUI?.currentView || 'Home';
    const requestId = ++this.latestRequestId;

    const songs = dataStore.getSongs();
    const playlists = dataStore.getPlaylists();
    const albums = dataStore.getAlbums();

    const q = (query || '').toLowerCase().trim();
    const isQuery = q.length > 0;
    const source = this.activeSource;

    let providerStatus = null;
    if (source === 'spotify') {
      providerStatus = {
        provider: 'Spotify',
        connected: false,
        message: 'Spotify integration is not connected. Add Spotify API credentials in Settings to search external catalog.'
      };
    } else if (source === 'amazon') {
      providerStatus = {
        provider: 'Amazon Music',
        connected: false,
        message: 'Amazon Music integration is not connected. Add Amazon Music credentials in Settings to search external catalog.'
      };
    }

    // 1. Filter local songs
    let matchedSongs = songs.filter(s => {
      const matchSource = source === 'all' || (s.source && s.source.toLowerCase() === source);
      if (!isQuery) return matchSource;
      const matchText = `${s.title} ${s.artist} ${s.album || ''} ${s.genre || ''}`.toLowerCase();
      return matchText.includes(q) && matchSource;
    });

    // 2. Filter local playlists
    let matchedPlaylists = playlists.filter(p => {
      if (!isQuery) return true;
      const playlistSongs = dataStore.getSongsByPlaylist(p.id);
      const hasMatchingSong = playlistSongs.some(s =>
        `${s.title} ${s.artist} ${s.album || ''}`.toLowerCase().includes(q)
      );
      return p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)) || hasMatchingSong;
    });

    // 3. Filter local albums
    let matchedAlbums = albums.filter(al => {
      if (!isQuery) return true;
      const albumSongs = dataStore.getSongsByAlbum(al.name);
      const hasMatchingSong = albumSongs.some(s => `${s.title} ${s.artist}`.toLowerCase().includes(q));
      return al.name.toLowerCase().includes(q) || (al.artist && al.artist.toLowerCase().includes(q)) || hasMatchingSong;
    });

    // Emit local results immediately
    if (this.onResultsCallback) {
      this.onResultsCallback({
        isQuery,
        query: q,
        source,
        pageContext: activePage,
        songs: matchedSongs,
        playlists: matchedPlaylists,
        albums: matchedAlbums,
        providerStatus,
        isSearchingYouTube: false
      });
    }

    if (localOnlyPrepass || !allowRemote) {
      return;
    }

    // 4. YouTube API Query Policy:
    // Only query YouTube API when query has at least 2 characters and:
    // - Source is explicitly 'youtube', OR
    // - (activePage === 'Home' || activePage === 'Search') and (source === 'all' && (q.includes('yt') || matchedSongs.length === 0))
    // Never query YouTube API from Playlists or Albums page unless source === 'youtube'.
    const shouldSearchYouTube = isQuery && q.length >= 2 && (
      source === 'youtube' ||
      ((activePage === 'Home' || activePage === 'Search') && (source === 'all' && (q.includes('yt') || matchedSongs.length === 0)))
    );

    if (shouldSearchYouTube && !providerStatus) {
      try {
        if (this.abortController) {
          this.abortController.abort();
        }
        this.abortController = new AbortController();

        const ytResults = await this.searchYouTubeAPI(query, this.abortController.signal);

        // Stale check: If a newer request has been triggered, discard this result
        if (requestId !== this.latestRequestId) {
          return;
        }

        if (ytResults && ytResults.length > 0) {
          if (source === 'youtube') {
            matchedSongs = ytResults;
          } else {
            const existingIds = new Set(matchedSongs.map(s => s.videoId || s.id));
            const newYt = ytResults.filter(y => !existingIds.has(y.videoId) && !existingIds.has(y.id));
            matchedSongs = [...matchedSongs, ...newYt];
          }

          if (this.onResultsCallback && requestId === this.latestRequestId) {
            this.onResultsCallback({
              isQuery,
              query: q,
              source,
              pageContext: activePage,
              songs: matchedSongs,
              playlists: matchedPlaylists,
              albums: matchedAlbums,
              providerStatus,
              isSearchingYouTube: false
            });
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn("YouTube API query notice:", err);
        }
      }
    }
  }

  async searchYouTubeAPI(query, signal = null) {
    const apiKey = getYouTubeApiKey();
    if (!apiKey || !query || query.length < 2) return [];

    try {
      const endpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=6&q=${encodeURIComponent(query + " official audio")}&type=video&key=${apiKey}`;
      const response = await fetch(endpoint, { signal });
      if (!response.ok) return [];

      const data = await response.json();
      if (!data.items) return [];

      return data.items.map(item => ({
        id: `yt-${item.id.videoId}`,
        videoId: item.id.videoId,
        youtubeId: item.id.videoId,
        title: item.snippet.title.replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
        artist: item.snippet.channelTitle,
        album: "YouTube Music",
        duration: 210,
        cover: item.snippet.thumbnails?.medium?.url || "assets/covers/starlight.svg",
        genre: "YouTube",
        source: "youtube",
        url: "",
        synthNote: "A4",
        liked: false,
        lyrics: null
      }));
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn("YouTube search API error", e);
      }
      return [];
    }
  }
}

export const searchEngine = new MusicOSSearch();
