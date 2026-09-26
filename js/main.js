/* ==========================================================================
   MUSIC OS - Application Master Orchestrator
   Wires modules, search results, keyboard shortcuts & initial setup
   ========================================================================== */

import { envConfig } from './config.js';
import { dataStore } from './data.js';
import { player } from './player.js';
import { ui } from './ui.js';
import { themeManager } from './themes.js';
import { searchEngine } from './search.js';
import { sidebarController } from './sidebar.js';
import { getSupabase, testSupabaseConnection } from './supabase.js';
import { authManager } from './auth.js';
import { authUI } from './auth-ui.js';
import { preferencesManager } from './preferences.js';
import { libraryCloud } from './library-cloud.js';
import { playlistsCloud } from './playlists-cloud.js';
import { historyCloud } from './history-cloud.js';
import { statsCloud } from './stats-cloud.js';
import { lyricsCloud } from './lyrics-cloud.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log("🌌 Initializing MUSIC OS – Your Personal Music Lounge...");

  // 0. Load Environment Configurations (.env / .env.local / localStorage)
  await envConfig.init();

  // 0b. Initialize Supabase Connection (Background / Non-blocking)
  getSupabase();
  testSupabaseConnection().catch((err) => console.debug("[Supabase] Connection notice:", err));

  // 0c. Initialize Supabase Authentication & Auth UI
  await authManager.init();
  authUI.init();

  // 0d. Synchronize Cloud Preferences, User Library, Playlists, Stats & Lyrics when authenticated
  authManager.onAuthStateChange(async (state) => {
    if (state.isAuthenticated) {
      preferencesManager.syncPreferences().catch(err => console.debug('[Preferences Sync]', err));
      libraryCloud.syncUserLibrary().catch(err => console.debug('[Library Sync]', err));
      playlistsCloud.syncPlaylists().catch(err => console.debug('[Playlists Sync]', err));
      statsCloud.reconcileStats().catch(err => console.debug('[Stats Reconcile]', err));
      lyricsCloud.syncLyrics().catch(err => console.debug('[Lyrics Sync]', err));
    }
  });

  // Listen to playback and listening time events for cloud history & statistics & lyrics lazy load
  player.on('trackchange', (track) => {
    if (authManager.isAuthenticated() && track && track.id) {
      historyCloud.recordPlay(track.id).catch(err => console.debug('[History Sync]', err));
      statsCloud.flush().catch(err => console.debug('[Stats Flush]', err));
      lyricsCloud.loadLyricsForTrack(track);
    }
  });

  player.on('playstate', (isPlaying) => {
    if (!isPlaying) {
      statsCloud.flush().catch(err => console.debug('[Stats Flush]', err));
    }
  });

  player.on('listeningtimeupdate', () => {
    statsCloud.onListeningTick();
  });

  // Listen to song liked changes to synchronize with Supabase user_library in real time
  window.addEventListener('songlikedchanged', (e) => {
    if (authManager.isAuthenticated() && e.detail) {
      libraryCloud.setLiked(e.detail.songId, e.detail.liked).catch(err => console.debug('[Like Sync]', err));
    }
  });

  // Listen to playlist changes to synchronize with Supabase playlists & playlist_songs
  window.addEventListener('playlistschange', (e) => {
    if (authManager.isAuthenticated() && e.detail?.action) {
      const act = e.detail.action;
      if (act.type === 'create' || act.type === 'update') {
        playlistsCloud.upsertPlaylist(act.playlist).catch(err => console.debug('[Playlist Upsert Sync]', err));
      } else if (act.type === 'delete') {
        playlistsCloud.deletePlaylist(act.playlistId).catch(err => console.debug('[Playlist Delete Sync]', err));
      } else if (act.type === 'favorite') {
        playlistsCloud.setPlaylistFavorite(act.playlistId, act.isFavorite).catch(err => console.debug('[Playlist Fav Sync]', err));
      }
    }
  });

  // 1. Initialize Theme Engine & Sliders
  themeManager.init();

  // 2. Initialize UI & Core Components
  ui.init();

  // 2. Initialize Sidebar & Routing
  sidebarController.init(
    (navId) => handleNavigation(navId),
    (createdPlaylist) => {
      ui.renderPlaylists();
      ui.renderSidebarPlaylists();
      ui.renderStats();
      ui.showToast(`Playlist "${createdPlaylist.name}" created!`);
    }
  );

  // 3. Initialize Live Search & YouTube Integration
  searchEngine.init((results) => {
    ui.handleSearchResults(results);
  });

  // 4. Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Avoid triggering if typing in search input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        player.togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        player.next();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        player.prev();
        break;
      case 'ArrowUp':
        e.preventDefault();
        player.setVolume(player.volume + 0.05);
        break;
      case 'ArrowDown':
        e.preventDefault();
        player.setVolume(player.volume - 0.05);
        break;
      case 'KeyL':
        const cur = dataStore.getCurrentTrack();
        if (cur) {
          dataStore.toggleLike(cur.id);
          ui.updatePlayerBar(cur);
          ui.renderStats();
          ui.renderRecentlyPlayed();
        }
        break;
      case 'KeyM':
        player.setVolume(player.volume > 0 ? 0 : 0.75);
        break;
    }
  });

  // 5. Handle Global Navigation Route Changes
  function handleNavigation(navId) {
    console.log(`Navigated to: ${navId}`);
    if (navId === 'Theme Studio') {
      themeManager.openRightPanel();
      const themeTile = document.querySelector('.themes-panel-card');
      if (themeTile) themeTile.scrollIntoView({ behavior: 'smooth' });
    } else {
      ui.renderView(navId);
    }
  }

  // Preload initial track into player without autoplaying until clicked
  player.loadTrack(0, false);
  console.log("✨ MUSIC OS ready. Enjoy your listening session!");
});
