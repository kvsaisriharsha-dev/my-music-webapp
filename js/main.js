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

document.addEventListener('DOMContentLoaded', async () => {
  console.log("🌌 Initializing MUSIC OS – Your Personal Music Lounge...");

  // 0. Load Environment Configurations (.env / .env.local / localStorage)
  await envConfig.init();

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
