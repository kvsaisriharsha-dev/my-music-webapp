/* ==========================================================================
   MUSIC OS - UI Renderer & DOM Synchronization Module
   Realtime IST Greetings, Dynamic Stats, Glass Views & Lyrics Sync
   ========================================================================== */

import { dataStore, THEMES } from './data.js';
import { player } from './player.js';
import { themeManager } from './themes.js';
import { envConfig } from './config.js';

class MusicOSUI {
  constructor() {
    this.activeTab = 'queue'; // 'queue' or 'lyrics'
    this.activeFilter = 'Recently Played';
    this.currentView = 'Home';
    this.currentDetailId = null;
  }

  init() {
    this.updateGreetingIST();
    this.renderStats();
    this.renderPlaylists();
    this.renderSidebarPlaylists();
    this.renderRecentlyPlayed();
    this.renderThemesGrid();
    this.initEqualizerControls();
    this.renderQueue();
    this.renderLyrics();
    this.renderFloatingLyrics();
    this.initFloatingWindow();
    this.initFloatingQueueWindow();
    this.updatePlayerBar(dataStore.getCurrentTrack());
    this.bindPlayerInteractions();
    this.bindTabControls();
    this.bindFilterChips();
    this.bindContinueListening();
    this.rebindTopbar();

    // Listen to player events
    player.on('playstate', (isPlaying) => this.handlePlayStateChange(isPlaying));
    player.on('trackchange', (track) => this.handleTrackChange(track));
    player.on('timeupdate', (data) => this.handleTimeUpdate(data));
    player.on('volumechange', (vol) => this.handleVolumeChange(vol));
    player.on('shufflechange', (isShuffle) => this.handleShuffleChange(isShuffle));
    player.on('repeatchange', (mode) => this.handleRepeatChange(mode));
    player.on('listeningtimeupdate', () => this.renderStats());

    // Listen to playlist data changes to synchronize sidebar and views automatically
    window.addEventListener('playlistschange', () => {
      this.renderSidebarPlaylists();
      if (this.currentView === 'Home') {
        this.renderPlaylists();
      }
      this.renderStats();
    });

    // Update greeting every minute
    setInterval(() => this.updateGreetingIST(), 60000);
  }

  // ==========================================================================
  // 1. REALTIME INDIA BASED GREETING (IST)
  // ==========================================================================
  updateGreetingIST() {
    const greetingEl = document.getElementById('hero-greeting-text');
    if (!greetingEl) return;

    try {
      const options = { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false };
      const formatter = new Intl.DateTimeFormat([], options);
      const istHour = parseInt(formatter.format(new Date()), 10);

      let greeting = "Good Evening";
      if (istHour >= 4 && istHour < 12) {
        greeting = "Good Morning";
      } else if (istHour >= 12 && istHour < 17) {
        greeting = "Good Afternoon";
      } else if (istHour >= 17 && istHour < 21) {
        greeting = "Good Evening";
      } else {
        greeting = "Good Night";
      }

      greetingEl.textContent = `${greeting}, Sri Harsha`;
    } catch {
      greetingEl.textContent = "Good Evening, Sri Harsha";
    }
  }

  // ==========================================================================
  // 2. DYNAMIC REAL STATS (Not Hardcoded)
  // ==========================================================================
  renderStats() {
    const stats = dataStore.getStats();

    const minsEl = document.getElementById('stat-listening-mins');
    const songsEl = document.getElementById('stat-songs-count');
    const playlistsEl = document.getElementById('stat-playlists-count');
    const favsEl = document.getElementById('stat-favs-count');

    if (minsEl) minsEl.textContent = `${stats.totalMinutes} mins`;
    if (songsEl) songsEl.textContent = stats.songsCount.toString();
    if (playlistsEl) playlistsEl.textContent = stats.playlistsCount.toString();
    if (favsEl) favsEl.textContent = stats.likedCount.toString();
  }

  // ==========================================================================
  // 3. PLAYLISTS RENDERING
  // ==========================================================================
  renderPlaylists(playlists = dataStore.getPlaylists()) {
    const grid = document.getElementById('playlists-grid');
    if (!grid) return;

    grid.innerHTML = playlists.map(pl => `
      <div class="playlist-card glass-card" data-playlist-id="${pl.id}">
        <div class="playlist-art-wrapper" style="background: ${pl.gradient};">
          <svg viewBox="0 0 100 100" class="playlist-svg">
            <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="6"/>
            <circle cx="50" cy="50" r="14" fill="rgba(255,255,255,0.25)"/>
            <path d="M46 40 L60 50 L46 60 Z" fill="#ffffff" opacity="0.9"/>
          </svg>
          <button class="playlist-quick-play" title="Play ${pl.name}">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>
        </div>
        <div class="playlist-info">
          <div class="playlist-header-row">
            <div class="playlist-name">${pl.name}</div>
            <button class="playlist-more-btn" data-playlist-id="${pl.id}" title="Playlist Options">⋮</button>
          </div>
          <div class="playlist-count">${pl.count} tracks • ${pl.category}</div>
        </div>
      </div>
    `).join('');

    // Close any dropdown menu when clicking outside
    if (!this._playlistMenuListenerAttached) {
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.playlist-more-btn') && !e.target.closest('.playlist-dropdown-menu')) {
          document.querySelectorAll('.playlist-dropdown-menu').forEach(m => m.remove());
        }
      });
      this._playlistMenuListenerAttached = true;
    }

    // Bind card click & play
    grid.querySelectorAll('.playlist-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const plId = card.getAttribute('data-playlist-id');

        // Handle More Options button click
        const moreBtn = e.target.closest('.playlist-more-btn');
        if (moreBtn) {
          e.stopPropagation();
          this.togglePlaylistMenu(moreBtn, plId);
          return;
        }

        if (e.target.closest('.playlist-quick-play')) {
          const plSongs = dataStore.getSongsByPlaylist(plId);
          if (plSongs.length) {
            dataStore.queue = [...plSongs];
            dataStore.saveState('music_os_queue', dataStore.queue);
            player.loadTrack(0, true);
            this.renderQueue();
            this.showToast(`Playing playlist: ${card.querySelector('.playlist-name').textContent}`);
          }
        } else {
          this.renderPlaylistDetailView(plId);
        }
      });
    });
  }

  togglePlaylistMenu(btn, plId) {
    const existing = document.querySelector(`.playlist-dropdown-menu[data-for="${plId}"]`);
    if (existing) {
      existing.remove();
      return;
    }
    document.querySelectorAll('.playlist-dropdown-menu').forEach(m => m.remove());

    const playlist = dataStore.getPlaylists().find(p => p.id === plId);
    if (!playlist) return;

    const menu = document.createElement('div');
    menu.className = 'playlist-dropdown-menu';
    menu.setAttribute('data-for', plId);

    menu.innerHTML = `
      <button class="playlist-dropdown-item add-songs-item">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Add Songs in Playlist
      </button>
      ${plId !== 'pl-liked' ? `
        <button class="playlist-dropdown-item danger remove-playlist-item">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Remove Playlist
        </button>
      ` : ''}
    `;

    btn.parentElement.appendChild(menu);

    menu.querySelector('.add-songs-item').addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      this.showAddSongsModal(plId);
    });

    const removeBtn = menu.querySelector('.remove-playlist-item');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.remove();
        this.deletePlaylistConfirm(plId);
      });
    }
  }

  showAddSongsModal(plId) {
    const playlist = dataStore.getPlaylists().find(p => p.id === plId);
    if (!playlist) return;

    const modal = document.createElement('div');
    modal.className = 'add-songs-modal-overlay';

    const currentSongs = dataStore.getSongsByPlaylist(plId);
    const selectedIds = new Set(currentSongs.map(s => s.id));

    modal.innerHTML = `
      <div class="add-songs-modal-card glass-card">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <h3 style="font-size: 16px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
            <span>➕ Add Songs to "${playlist.name}"</span>
          </h3>
          <button id="close-add-songs-modal" style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.08); color: #fff; cursor: pointer;">✕</button>
        </div>

        <p style="font-size: 13px; color: var(--text-muted); line-height: 1.4;">
          Select songs from your library to include in this playlist.
        </p>

        <div class="add-songs-list">
          ${dataStore.getSongs().map(song => {
            const isSelected = selectedIds.has(song.id);
            return `
              <div class="add-song-row ${isSelected ? 'selected' : ''}" data-song-id="${song.id}">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <input type="checkbox" class="song-checkbox" ${isSelected ? 'checked' : ''} style="accent-color: var(--accent-primary); pointer-events: none;">
                  <div>
                    <div style="font-size: 13px; font-weight: 600; color: #fff;">${song.title}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${song.artist} • ${song.genre}</div>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 8px;">
          <button id="cancel-add-songs" class="source-pill" style="cursor: pointer;">Cancel</button>
          <button id="save-add-songs" style="background: var(--accent-gradient); color: #fff; padding: 8px 20px; border-radius: 9999px; font-weight: 700; font-size: 13px; box-shadow: var(--accent-glow); cursor: pointer;">Save Playlist Tracks</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('.add-song-row').forEach(row => {
      row.addEventListener('click', () => {
        const songId = row.getAttribute('data-song-id');
        const checkbox = row.querySelector('.song-checkbox');
        if (selectedIds.has(songId)) {
          selectedIds.delete(songId);
          checkbox.checked = false;
          row.classList.remove('selected');
        } else {
          selectedIds.add(songId);
          checkbox.checked = true;
          row.classList.add('selected');
        }
      });
    });

    const closeModal = () => modal.remove();
    modal.querySelector('#close-add-songs-modal').addEventListener('click', closeModal);
    modal.querySelector('#cancel-add-songs').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    modal.querySelector('#save-add-songs').addEventListener('click', () => {
      const selectedArray = Array.from(selectedIds);
      playlist.songIds = selectedArray;
      playlist.count = selectedArray.length;
      dataStore.saveState("music_os_playlists", dataStore.getPlaylists());
      this.renderPlaylists();
      this.renderSidebarPlaylists();
      this.renderStats();
      this.showToast(`Updated playlist "${playlist.name}" (${selectedArray.length} tracks)`);
      closeModal();
    });
  }

  deletePlaylistConfirm(plId) {
    const playlist = dataStore.getPlaylists().find(p => p.id === plId);
    if (!playlist) return;

    if (plId === 'pl-liked') {
      this.showToast("Liked Songs is a default playlist and cannot be removed.");
      return;
    }

    if (confirm(`Are you sure you want to remove the playlist "${playlist.name}"?`)) {
      dataStore.deletePlaylist(plId);
      this.renderPlaylists();
      this.renderSidebarPlaylists();
      this.renderStats();
      this.showToast(`Playlist "${playlist.name}" removed.`);
    }
  }

  renderSidebarPlaylists() {
    const container = document.getElementById('sidebar-playlists-list');
    if (!container) return;

    const playlists = dataStore.getPlaylists();
    container.innerHTML = playlists.map(pl => `
      <li class="sidebar-item">
        <a class="sidebar-link" href="#" data-playlist-id="${pl.id}">
          <svg class="playlist-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${pl.name}</span>
        </a>
      </li>
    `).join('');

    container.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const plId = link.getAttribute('data-playlist-id');
        this.renderPlaylistDetailView(plId);
      });
    });
  }

  // ==========================================================================
  // 4. RECENTLY PLAYED TRACKS RENDERING
  // ==========================================================================
  renderRecentlyPlayed(songs = dataStore.getSongs().slice(0, 4)) {
    const grid = document.getElementById('recently-played-grid');
    if (!grid) return;

    const currentTrack = dataStore.getCurrentTrack();

    grid.innerHTML = songs.map(song => {
      const isCurrent = currentTrack && currentTrack.id === song.id;
      return `
        <div class="track-card glass-card ${isCurrent ? 'active-playing' : ''}" data-song-id="${song.id}">
          <div class="track-thumb-box">
            ${this.getCoverSVG(song.title, song.genre)}
            <div class="track-play-badge">
              <div class="track-play-badge-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <polygon points="6 4 18 12 6 20 6 4"/>
                </svg>
              </div>
            </div>
            ${isCurrent && player.isPlaying ? `
              <div class="mini-equalizer">
                <div class="eq-bar"></div>
                <div class="eq-bar"></div>
                <div class="eq-bar"></div>
                <div class="eq-bar"></div>
              </div>
            ` : ''}
          </div>
          <div class="track-meta">
            <div class="track-text">
              <div class="track-title">${song.title}</div>
              <div class="track-artist">${song.artist}</div>
            </div>
            <div class="track-actions">
              <button class="btn-icon-sm btn-like ${song.liked ? 'liked' : ''}" data-song-id="${song.id}" title="Like">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="${song.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind click to play
    grid.querySelectorAll('.track-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-like')) return;
        const songId = card.getAttribute('data-song-id');
        const queue = dataStore.getQueue();
        const index = queue.findIndex(s => s.id === songId);
        if (index !== -1) {
          player.loadTrack(index, true);
        } else {
          const song = dataStore.getSongs().find(s => s.id === songId);
          if (song) {
            dataStore.addTrackToQueue(song);
            player.loadTrack(dataStore.getQueue().length - 1, true);
          }
        }
      });
    });

    // Bind heart like toggles
    grid.querySelectorAll('.btn-like').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const songId = btn.getAttribute('data-song-id');
        const isLiked = dataStore.toggleLike(songId);
        btn.classList.toggle('liked', isLiked);
        btn.querySelector('svg').setAttribute('fill', isLiked ? 'currentColor' : 'none');
        this.renderStats();
        this.renderQueue();
        this.updatePlayerBar(dataStore.getCurrentTrack());
        this.showToast(isLiked ? "Added to Liked Songs" : "Removed from Liked Songs");
      });
    });
  }

  // ==========================================================================
  // 5. THEMES GRID RENDERING (8 Themes + "+" Custom Background Button)
  // ==========================================================================
  renderThemesGrid() {
    const grid = document.getElementById('themes-grid');
    if (!grid) return;

    const themeTilesHTML = THEMES.map(theme => `
      <button class="theme-tile-btn ${theme.id === themeManager.currentTheme ? 'active' : ''}" data-theme-id="${theme.id}" title="${theme.name} - ${theme.desc}">
        <div class="theme-preview-circle ${theme.swatch}"></div>
        <span class="theme-tile-name">${theme.name}</span>
      </button>
    `).join('');

    const addBtnHTML = `
      <button id="theme-add-custom-btn" class="theme-tile-btn theme-add-btn" title="Add Custom Background Link / Image">
        <div class="theme-add-icon">+</div>
        <span class="theme-tile-name">Custom</span>
      </button>
    `;

    grid.innerHTML = themeTilesHTML + addBtnHTML;

    grid.querySelectorAll('.theme-tile-btn[data-theme-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const themeId = btn.getAttribute('data-theme-id');
        themeManager.clearCustomBackground();
        themeManager.applyTheme(themeId, true);
        this.showToast(`Theme & Background switched to ${btn.querySelector('.theme-tile-name').textContent}`);
      });
    });

    const addBtn = document.getElementById('theme-add-custom-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.showCustomBackgroundModal();
      });
    }
  }

  // ==========================================================================
  // CUSTOM BACKGROUND MODAL
  // ==========================================================================
  showCustomBackgroundModal() {
    const modal = document.createElement('div');
    modal.className = 'custom-bg-modal-overlay';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(12px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;

    modal.innerHTML = `
      <div class="glass-card" style="width: 100%; max-width: 480px; padding: 24px; display: flex; flex-direction: column; gap: 18px; border: 1px solid var(--accent-primary); box-shadow: var(--accent-glow);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <h3 style="font-size: 16px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
            <span>🌌 Custom Background Studio</span>
          </h3>
          <button id="close-bg-modal" style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.08); color: #fff;">✕</button>
        </div>

        <p style="font-size: 13px; color: var(--text-muted); line-height: 1.4;">
          Paste an image URL, choose a preset, or apply a dynamic wallpaper across the entire app.
        </p>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 12px; font-weight: 600; color: var(--text-muted);">Background Image URL</label>
          <input id="custom-bg-url-input" class="search-input" style="padding: 10px 14px;" type="url" placeholder="https://images.unsplash.com/photo-..." value="${themeManager.customBgUrl}">
        </div>

        <!-- Presets -->
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 11px; font-weight: 600; color: var(--text-faint); text-transform: uppercase;">Quick Presets</label>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="source-pill bg-preset" data-url="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1920&auto=format&fit=crop">Cyberpunk City</button>
            <button class="source-pill bg-preset" data-url="https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1920&auto=format&fit=crop">Deep Galaxy</button>
            <button class="source-pill bg-preset" data-url="https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1920&auto=format&fit=crop">Starry Alps</button>
            <button class="source-pill bg-preset" data-url="https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=1920&auto=format&fit=crop">Code Lounge</button>
          </div>
        </div>

        <!-- Save Toggle -->
        <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); cursor: pointer;">
          <input id="save-bg-checkbox" type="checkbox" checked style="accent-color: var(--accent-primary);">
          <span>Save as permanent background (Persist across sessions)</span>
        </label>

        <!-- Actions -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
          <button id="clear-custom-bg" style="font-size: 12px; color: var(--color-pink); font-weight: 600;">Reset to Aurora Canvas</button>
          <div style="display: flex; gap: 8px;">
            <button id="cancel-bg-modal" class="source-pill">Cancel</button>
            <button id="apply-bg-modal" style="background: var(--accent-gradient); color: #fff; padding: 8px 18px; border-radius: 9999px; font-weight: 700; font-size: 13px; box-shadow: var(--accent-glow);">Apply Wallpaper</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Preset clicks
    modal.querySelectorAll('.bg-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = modal.querySelector('#custom-bg-url-input');
        input.value = btn.getAttribute('data-url');
      });
    });

    // Close & Cancel
    const closeModal = () => modal.remove();
    modal.querySelector('#close-bg-modal').addEventListener('click', closeModal);
    modal.querySelector('#cancel-bg-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Reset
    modal.querySelector('#clear-custom-bg').addEventListener('click', () => {
      themeManager.clearCustomBackground();
      this.showToast("Background reset to default Aurora Canvas");
      closeModal();
    });

    // Apply
    modal.querySelector('#apply-bg-modal').addEventListener('click', () => {
      const url = modal.querySelector('#custom-bg-url-input').value.trim();
      const save = modal.querySelector('#save-bg-checkbox').checked;
      if (url) {
        themeManager.applyCustomBackground(url, save);
        this.showToast(save ? "Custom background applied & saved!" : "Custom background applied for this session");
      } else {
        themeManager.clearCustomBackground();
        this.showToast("Background cleared");
      }
      closeModal();
    });
  }

  // ==========================================================================
  // 6. QUEUE RENDERING
  // ==========================================================================
  renderQueue() {
    const containers = [
      document.getElementById('queue-list-container'),
      document.getElementById('floating-queue-scroll')
    ].filter(Boolean);

    const badges = [
      document.getElementById('queue-count-badge'),
      document.getElementById('floating-queue-badge')
    ].filter(Boolean);

    const queue = dataStore.getQueue();
    badges.forEach(b => b.textContent = queue.length.toString());

    if (!containers.length) return;

    const currentTrack = dataStore.getCurrentTrack();

    const queueHTML = queue.map((song, idx) => {
      const isCurrent = currentTrack && currentTrack.id === song.id;
      return `
        <div class="queue-item ${isCurrent ? 'playing' : ''}" data-queue-index="${idx}">
          <div class="queue-item-left">
            <div class="queue-item-thumb">
              ${this.getCoverSVG(song.title, song.genre)}
              ${isCurrent && player.isPlaying ? `
                <div class="eq-overlay">
                  <div class="eq-bar" style="height: 12px; width: 2px;"></div>
                  <div class="eq-bar" style="height: 8px; width: 2px;"></div>
                  <div class="eq-bar" style="height: 14px; width: 2px;"></div>
                </div>
              ` : ''}
            </div>
            <div class="queue-item-info">
              <div class="queue-item-title">${song.title}</div>
              <div class="queue-item-artist">${song.artist}</div>
            </div>
          </div>
          <div class="queue-item-actions">
            <button class="btn-icon-sm remove-queue-btn" data-index="${idx}" title="Remove from Queue">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    containers.forEach(list => {
      list.innerHTML = queueHTML;

      // Click queue item to jump
      list.querySelectorAll('.queue-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.remove-queue-btn')) return;
          const index = parseInt(item.getAttribute('data-queue-index'), 10);
          player.loadTrack(index, true);
        });
      });

      // Remove from queue
      list.querySelectorAll('.remove-queue-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const index = parseInt(btn.getAttribute('data-index'), 10);
          dataStore.removeTrackFromQueue(index);
          this.renderQueue();
        });
      });
    });
  }

  // ==========================================================================
  // 7. LYRICS RENDERING & SYNC
  // ==========================================================================
  renderLyrics() {
    const container = document.getElementById('lyrics-lines-container');
    if (!container) return;

    const track = dataStore.getCurrentTrack();
    if (!track || !track.lyrics || track.lyrics.length === 0) {
      container.innerHTML = `<div class="lyrics-empty">No lyrics available for this track.</div>`;
      return;
    }

    container.innerHTML = track.lyrics.map((line, idx) => `
      <div class="lyrics-line" data-line-index="${idx}" data-time="${line.time}" style="cursor: pointer;" title="Click to jump to ${player.formatTime(line.time)}">
        ${line.text}
      </div>
    `).join('');

    // Bind click to immediately seek to clicked lyric timestamp
    container.querySelectorAll('.lyrics-line').forEach(line => {
      line.addEventListener('click', () => {
        const time = parseFloat(line.getAttribute('data-time'));
        player.seek(time);
        if (!player.isPlaying) {
          player.play();
        }
        this.syncLyrics(time);
        this.showToast(`Jumped to ${player.formatTime(time)}`);
      });
    });
  }

  syncLyrics(currentTime) {
    const lines = document.querySelectorAll('.lyrics-line');
    if (!lines.length) return;

    let activeLine = null;
    lines.forEach(line => {
      const time = parseFloat(line.getAttribute('data-time'));
      if (currentTime >= time) {
        activeLine = line;
      }
    });

    lines.forEach(line => line.classList.remove('active'));
    if (activeLine) {
      activeLine.classList.add('active');
      activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  renderFloatingLyrics() {
    const container = document.getElementById('floating-lyrics-scroll');
    if (!container) return;

    const track = dataStore.getCurrentTrack();
    if (!track || !track.lyrics || track.lyrics.length === 0) {
      container.innerHTML = `<div class="lyrics-empty" style="margin-top: 30px;">No lyrics available for this track.</div>`;
      return;
    }

    container.innerHTML = track.lyrics.map((line, idx) => `
      <div class="floating-lyric-line" data-line-index="${idx}" data-time="${line.time}" title="Jump to ${player.formatTime(line.time)}">
        ${line.text}
      </div>
    `).join('');

    // Clicking ANY lyric line immediately seeks to that timestamp
    container.querySelectorAll('.floating-lyric-line').forEach(line => {
      line.addEventListener('click', () => {
        const time = parseFloat(line.getAttribute('data-time'));
        player.seek(time);
        if (!player.isPlaying) {
          player.play();
        }
        this.syncLyrics(time);
        this.syncFloatingLyrics(time);
        this.showToast(`Jumped to ${player.formatTime(time)}`);
      });
    });
  }

  syncFloatingLyrics(currentTime) {
    const lines = document.querySelectorAll('.floating-lyric-line');
    if (!lines.length) return;

    let activeLine = null;
    lines.forEach(line => {
      const time = parseFloat(line.getAttribute('data-time'));
      if (currentTime >= time) {
        activeLine = line;
      }
    });

    lines.forEach(line => line.classList.remove('active'));
    if (activeLine) {
      activeLine.classList.add('active');
      activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  initFloatingWindow() {
    const win = document.getElementById('floating-lyrics-window');
    const header = document.getElementById('floating-header');
    const closeBtn = document.getElementById('floating-close-btn');
    const minBtn = document.getElementById('floating-minimize-btn');
    const lyricsToggleBtn = document.getElementById('player-lyrics-toggle');

    if (!win || !header) return;

    // Toggle from player bar
    if (lyricsToggleBtn) {
      lyricsToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        win.classList.toggle('visible');
        if (win.classList.contains('visible')) {
          this.renderFloatingLyrics();
          this.updatePlayerBar(dataStore.getCurrentTrack());
        }
      });
    }

    // Close & Minimize
    if (closeBtn) closeBtn.addEventListener('click', () => win.classList.remove('visible'));
    if (minBtn) {
      minBtn.addEventListener('click', () => {
        win.classList.toggle('minimized');
        minBtn.textContent = win.classList.contains('minimized') ? '+' : '−';
      });
    }

    // Floating Mini player controls
    const flPlay = document.getElementById('floating-play-btn');
    const flPrev = document.getElementById('floating-prev-btn');
    const flNext = document.getElementById('floating-next-btn');
    if (flPlay) flPlay.addEventListener('click', () => player.togglePlay());
    if (flPrev) flPrev.addEventListener('click', () => player.prev());
    if (flNext) flNext.addEventListener('click', () => player.next());

    // Floating seek drag & click
    const flSeek = document.getElementById('floating-seek-track');
    if (flSeek) {
      const handleFlSeek = (e) => {
        const rect = flSeek.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clickPos = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = (clickPos / rect.width) * 100;
        player.seekByPercentage(percent);
      };

      flSeek.addEventListener('mousedown', (e) => {
        handleFlSeek(e);
        const onMouseMove = (moveEvent) => handleFlSeek(moveEvent);
        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      flSeek.addEventListener('touchstart', (e) => {
        handleFlSeek(e);
        const onTouchMove = (moveEvent) => handleFlSeek(moveEvent);
        const onTouchEnd = () => {
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
        };
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd);
      }, { passive: true });
    }

    // Drag / Move logic (Mouse + Touch)
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const onMouseDown = (e) => {
      if (e.target.closest('.floating-action-btn')) return;
      isDragging = true;
      const rect = win.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      // Switch to absolute left/top positioning
      win.style.right = 'auto';
      win.style.bottom = 'auto';
      win.style.left = `${initialLeft}px`;
      win.style.top = `${initialTop}px`;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newLeft = Math.max(10, Math.min(window.innerWidth - win.offsetWidth - 10, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - win.offsetHeight - 80, initialTop + dy));

      win.style.left = `${newLeft}px`;
      win.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    header.addEventListener('mousedown', onMouseDown);

    // Touch support for mobile/tablets
    header.addEventListener('touchstart', (e) => {
      if (e.target.closest('.floating-action-btn')) return;
      const touch = e.touches[0];
      isDragging = true;
      const rect = win.getBoundingClientRect();
      startX = touch.clientX;
      startY = touch.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;
      win.style.right = 'auto';
      win.style.bottom = 'auto';
      win.style.left = `${initialLeft}px`;
      win.style.top = `${initialTop}px`;
    }, { passive: true });

    header.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const newLeft = Math.max(10, Math.min(window.innerWidth - win.offsetWidth - 10, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - win.offsetHeight - 80, initialTop + dy));
      win.style.left = `${newLeft}px`;
      win.style.top = `${newTop}px`;
    }, { passive: true });

    header.addEventListener('touchend', () => {
      isDragging = false;
    });
  }

  initFloatingQueueWindow() {
    const win = document.getElementById('floating-queue-window');
    const header = document.getElementById('floating-queue-header');
    const closeBtn = document.getElementById('floating-queue-close-btn');
    const minBtn = document.getElementById('floating-queue-min-btn');
    const clearBtn = document.getElementById('floating-queue-clear-btn');
    const queueToggleBtn = document.getElementById('player-queue-toggle');

    if (!win || !header) return;

    if (queueToggleBtn) {
      queueToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        win.classList.toggle('visible');
        if (win.classList.contains('visible')) {
          this.renderQueue();
        }
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => win.classList.remove('visible'));
    if (minBtn) {
      minBtn.addEventListener('click', () => {
        win.classList.toggle('minimized');
        minBtn.textContent = win.classList.contains('minimized') ? '+' : '−';
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        dataStore.clearQueue();
        this.renderQueue();
        this.showToast("Queue cleared");
      });
    }

    // Drag / Move logic (Mouse + Touch)
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    const onMouseDown = (e) => {
      if (e.target.closest('.floating-action-btn') || e.target.closest('.clear-queue-btn')) return;
      isDragging = true;
      const rect = win.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      win.style.right = 'auto';
      win.style.bottom = 'auto';
      win.style.left = `${initialLeft}px`;
      win.style.top = `${initialTop}px`;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newLeft = Math.max(10, Math.min(window.innerWidth - win.offsetWidth - 10, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - win.offsetHeight - 80, initialTop + dy));

      win.style.left = `${newLeft}px`;
      win.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    header.addEventListener('mousedown', onMouseDown);

    header.addEventListener('touchstart', (e) => {
      if (e.target.closest('.floating-action-btn') || e.target.closest('.clear-queue-btn')) return;
      const touch = e.touches[0];
      isDragging = true;
      const rect = win.getBoundingClientRect();
      startX = touch.clientX;
      startY = touch.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      win.style.right = 'auto';
      win.style.bottom = 'auto';
      win.style.left = `${initialLeft}px`;
      win.style.top = `${initialTop}px`;
    }, { passive: true });

    header.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const newLeft = Math.max(10, Math.min(window.innerWidth - win.offsetWidth - 10, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - win.offsetHeight - 80, initialTop + dy));
      win.style.left = `${newLeft}px`;
      win.style.top = `${newTop}px`;
    }, { passive: true });

    header.addEventListener('touchend', () => {
      isDragging = false;
    });
  }

  // ==========================================================================
  // 8. PLAYER BAR UPDATES & SEEK DRAG LOGIC
  // ==========================================================================
  updatePlayerBar(track) {
    if (!track) return;

    const titleEl = document.getElementById('player-title');
    const artistEl = document.getElementById('player-artist');
    const thumbEl = document.getElementById('player-thumb');
    const heartBtn = document.getElementById('player-heart-btn');

    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = track.artist;
    if (thumbEl) thumbEl.innerHTML = this.getCoverSVG(track.title, track.genre);
    if (heartBtn) {
      heartBtn.classList.toggle('liked', track.liked);
      heartBtn.querySelector('svg').setAttribute('fill', track.liked ? 'currentColor' : 'none');
    }

    // Floating window sync
    const flTitle = document.getElementById('floating-title');
    const flArtist = document.getElementById('floating-artist');
    const flThumb = document.getElementById('floating-thumb');
    const flHeaderSong = document.getElementById('floating-header-song-name');
    if (flTitle) flTitle.textContent = track.title;
    if (flArtist) flArtist.textContent = track.artist;
    if (flThumb) flThumb.innerHTML = this.getCoverSVG(track.title, track.genre);
    if (flHeaderSong) flHeaderSong.textContent = `${track.title} – Lyrics`;

    // Also sync Continue Listening Card if visible
    const contTitle = document.getElementById('continue-title');
    const contArtist = document.getElementById('continue-artist');
    const contCover = document.getElementById('continue-cover-art');
    if (contTitle) contTitle.textContent = track.title;
    if (contArtist) contArtist.textContent = track.artist;
    if (contCover) contCover.innerHTML = this.getCoverSVG(track.title, track.genre);
  }

  handlePlayStateChange(isPlaying) {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const contPlayBtn = document.getElementById('continue-play-btn');
    const flPlayBtn = document.getElementById('floating-play-btn');

    const playSvg = `
      <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="6 4 18 12 6 20 6 4"/>
      </svg>
    `;
    const pauseSvg = `
      <svg class="pause-icon" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>
    `;

    if (playPauseBtn) playPauseBtn.innerHTML = isPlaying ? pauseSvg : playSvg;
    if (contPlayBtn) contPlayBtn.innerHTML = isPlaying ? pauseSvg : playSvg;
    if (flPlayBtn) flPlayBtn.innerHTML = isPlaying ? pauseSvg : playSvg;

    if (this.currentView === 'Home') {
      this.renderRecentlyPlayed();
    }
    this.renderQueue();
  }

  handleTrackChange(track) {
    this.updatePlayerBar(track);
    if (this.currentView === 'Home') {
      this.renderRecentlyPlayed();
    }
    this.renderQueue();
    this.renderLyrics();
    this.renderFloatingLyrics();
  }

  handleTimeUpdate(data) {
    const currentTimeEl = document.getElementById('current-time-label');
    const totalTimeEl = document.getElementById('total-time-label');
    const seekFill = document.getElementById('seek-bar-fill');
    const contProgressFill = document.getElementById('continue-progress-fill');
    const contCurrentTime = document.getElementById('continue-current-time');
    const contDurationTime = document.getElementById('continue-duration-time');

    // Floating window elements
    const flCurTime = document.getElementById('floating-cur-time');
    const flDurTime = document.getElementById('floating-dur-time');
    const flSeekFill = document.getElementById('floating-seek-fill');

    const curTimeFormatted = player.formatTime(data.currentTime);
    const durFormatted = player.formatTime(data.duration);

    if (currentTimeEl) currentTimeEl.textContent = curTimeFormatted;
    if (totalTimeEl) totalTimeEl.textContent = durFormatted;
    if (seekFill) seekFill.style.width = `${data.progress}%`;

    if (contProgressFill) contProgressFill.style.width = `${data.progress}%`;
    if (contCurrentTime) contCurrentTime.textContent = curTimeFormatted;
    if (contDurationTime) contDurationTime.textContent = durFormatted;

    if (flCurTime) flCurTime.textContent = curTimeFormatted;
    if (flDurTime) flDurTime.textContent = durFormatted;
    if (flSeekFill) flSeekFill.style.width = `${data.progress}%`;

    this.syncLyrics(data.currentTime);
    this.syncFloatingLyrics(data.currentTime);
  }

  handleVolumeChange(vol) {
    const fill = document.getElementById('volume-fill');
    if (fill) fill.style.width = `${vol * 100}%`;

    const iconBtn = document.getElementById('volume-icon-btn');
    if (iconBtn) {
      if (vol === 0) {
        iconBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
        iconBtn.title = "Unmute (M)";
      } else if (vol < 0.5) {
        iconBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
        iconBtn.title = "Mute (M)";
      } else {
        iconBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
        iconBtn.title = "Mute (M)";
      }
    }
  }

  handleShuffleChange(isShuffle) {
    const btn = document.getElementById('shuffle-btn');
    if (btn) btn.classList.toggle('active', isShuffle);
  }

  handleRepeatChange(mode) {
    const btn = document.getElementById('repeat-btn');
    if (btn) {
      btn.classList.toggle('active', mode !== 'off');
      btn.title = `Repeat: ${mode.toUpperCase()}`;
    }
  }

  // ==========================================================================
  // 9. EVENT BINDINGS FOR CONTROLS & SEEK DRAGGING
  // ==========================================================================
  bindPlayerInteractions() {
    // Play/pause
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) playPauseBtn.addEventListener('click', () => player.togglePlay());

    // Next / Prev
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');
    if (nextBtn) nextBtn.addEventListener('click', () => player.next());
    if (prevBtn) prevBtn.addEventListener('click', () => player.prev());

    // Shuffle / Repeat
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    if (shuffleBtn) shuffleBtn.addEventListener('click', () => player.toggleShuffle());
    if (repeatBtn) repeatBtn.addEventListener('click', () => player.toggleRepeat());

    // Player heart
    const playerHeart = document.getElementById('player-heart-btn');
    if (playerHeart) {
      playerHeart.addEventListener('click', () => {
        const cur = dataStore.getCurrentTrack();
        if (cur) {
          const isLiked = dataStore.toggleLike(cur.id);
          this.updatePlayerBar(cur);
          this.renderStats();
          if (this.currentView === 'Home') this.renderRecentlyPlayed();
          this.showToast(isLiked ? "Added to Liked Songs" : "Removed from Liked Songs");
        }
      });
    }

    // Drag-to-seek progress bar (Bottom Player)
    const seekTrack = document.getElementById('seek-bar-track');
    if (seekTrack) {
      const handleSeekMove = (e) => {
        const rect = seekTrack.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clickPos = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = (clickPos / rect.width) * 100;
        player.seekByPercentage(percent);
      };

      seekTrack.addEventListener('mousedown', (e) => {
        player.isDragging = true;
        seekTrack.classList.add('dragging');
        handleSeekMove(e);

        const onMouseMove = (moveEvent) => {
          if (player.isDragging) handleSeekMove(moveEvent);
        };

        const onMouseUp = () => {
          player.isDragging = false;
          seekTrack.classList.remove('dragging');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      seekTrack.addEventListener('touchstart', (e) => {
        player.isDragging = true;
        handleSeekMove(e);

        const onTouchMove = (moveEvent) => {
          if (player.isDragging) handleSeekMove(moveEvent);
        };

        const onTouchEnd = () => {
          player.isDragging = false;
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
        };

        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd);
      }, { passive: true });
    }

    // Volume drag & click (Bottom Player)
    const volumeTrack = document.getElementById('volume-bar-track');
    if (volumeTrack) {
      const handleVolumeMove = (e) => {
        const rect = volumeTrack.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clickPos = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = clickPos / rect.width;
        player.setVolume(percent);
      };

      volumeTrack.addEventListener('mousedown', (e) => {
        handleVolumeMove(e);
        const onMouseMove = (moveEvent) => handleVolumeMove(moveEvent);
        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      volumeTrack.addEventListener('touchstart', (e) => {
        handleVolumeMove(e);
        const onTouchMove = (moveEvent) => handleVolumeMove(moveEvent);
        const onTouchEnd = () => {
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
        };
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd);
      }, { passive: true });
    }

    // Fullscreen toggle
    const fsBtn = document.getElementById('fullscreen-btn');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    // Clear queue footer
    const clearQueueBtn = document.getElementById('clear-queue-btn');
    if (clearQueueBtn) {
      clearQueueBtn.addEventListener('click', () => {
        dataStore.clearQueue();
        this.renderQueue();
        this.showToast("Queue cleared");
      });
    }
  }

  bindTabControls() {
    const tabBtns = document.querySelectorAll('.tab-btn[data-tab]');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPanel = document.getElementById(`tab-panel-${targetTab}`);
        if (targetPanel) targetPanel.classList.add('active');
        this.activeTab = targetTab;
      });
    });

    // Right panel quick lyrics icon in player bar
    const playerLyricsBtn = document.getElementById('player-lyrics-toggle');
    if (playerLyricsBtn) {
      playerLyricsBtn.addEventListener('click', () => {
        themeManager.openRightPanel();
        const lyricsTabBtn = document.querySelector('.tab-btn[data-tab="lyrics"]');
        if (lyricsTabBtn) lyricsTabBtn.click();
      });
    }
  }

  bindFilterChips() {
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const filter = chip.textContent.trim();
        this.activeFilter = filter;

        const allSongs = dataStore.getSongs();
        if (filter === 'Recently Played') {
          this.renderRecentlyPlayed(allSongs.slice(0, 4));
        } else if (filter === 'Top Picks' || filter === 'For You') {
          this.renderRecentlyPlayed(allSongs);
        } else {
          const filtered = allSongs.filter(s => s.genre.toLowerCase() === filter.toLowerCase());
          this.renderRecentlyPlayed(filtered.length ? filtered : allSongs);
        }
      });
    });
  }

  bindContinueListening() {
    const contPlayBtn = document.getElementById('continue-play-btn');
    if (contPlayBtn) {
      contPlayBtn.addEventListener('click', () => {
        player.togglePlay();
      });
    }

    // Click & Drag seeking on Continue Listening bar
    const contTrack = document.querySelector('.continue-progress-bar-bg');
    if (contTrack) {
      const handleContSeek = (e) => {
        const rect = contTrack.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clickPos = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = (clickPos / rect.width) * 100;
        player.seekByPercentage(percent);
      };

      contTrack.addEventListener('mousedown', (e) => {
        handleContSeek(e);
        const onMouseMove = (moveEvent) => handleContSeek(moveEvent);
        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      contTrack.addEventListener('touchstart', (e) => {
        handleContSeek(e);
        const onTouchMove = (moveEvent) => handleContSeek(moveEvent);
        const onTouchEnd = () => {
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
        };
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd);
      }, { passive: true });
    }
  }

  initEqualizerControls() {
    // EQ Preset Buttons (Right Panel & Settings)
    document.querySelectorAll('.eq-pill-btn, .eq-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-eq');
        player.applyEqualizerPreset(preset);

        document.querySelectorAll('.eq-pill-btn, .eq-preset-btn').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-eq') === preset);
        });

        const gains = player.getEqualizerGains();
        document.querySelectorAll('.eq-fader-slider').forEach(slider => {
          const band = parseInt(slider.getAttribute('data-band'), 10);
          if (gains[band] !== undefined) {
            slider.value = gains[band];
            const dbLabel = document.getElementById(`eq-db-${band}`);
            if (dbLabel) dbLabel.textContent = `${gains[band] > 0 ? '+' : ''}${gains[band]}dB`;
          }
        });

        this.showToast(`Equalizer: ${preset.toUpperCase()} preset applied`);
      });
    });

    // 5-Band Vertical Faders
    document.querySelectorAll('.eq-fader-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const band = parseInt(slider.getAttribute('data-band'), 10);
        const val = parseInt(e.target.value, 10);
        player.setEqualizerBand(band, val);
        const dbLabel = document.getElementById(`eq-db-${band}`);
        if (dbLabel) dbLabel.textContent = `${val > 0 ? '+' : ''}${val}dB`;

        document.querySelectorAll('.eq-pill-btn, .eq-preset-btn').forEach(b => b.classList.remove('active'));
      });
    });
  }

  // ==========================================================================
  // NAVIGATION ROUTE RENDERING (Home, Library, Playlists, Artists, Albums, Analytics, Import, Settings)
  // ==========================================================================
  renderView(viewName, param = null) {
    this.currentView = viewName;
    const main = document.querySelector('.main-content');
    if (!main) return;

    const topbarHTML = document.querySelector('.topbar')?.outerHTML || '';

    if (viewName === 'Home') {
      this.renderHomeView(main, topbarHTML);
      return;
    }

    if (viewName === 'Library') {
      this.renderLibraryView(main, topbarHTML);
    } else if (viewName === 'Playlists') {
      this.renderPlaylistsListView(main, topbarHTML);
    } else if (viewName === 'Artists') {
      this.renderArtistsView(main, topbarHTML);
    } else if (viewName === 'Albums') {
      this.renderAlbumsView(main, topbarHTML);
    } else if (viewName === 'Analytics') {
      this.renderAnalyticsView(main, topbarHTML);
    } else if (viewName === 'Import Music') {
      this.renderImportMusicView(main, topbarHTML);
    } else if (viewName === 'Settings') {
      this.renderSettingsView(main, topbarHTML);
    } else if (viewName === 'Liked Songs') {
      this.renderLikedSongsView(main, topbarHTML);
    }
  }

  renderHomeView(container, topbarHTML) {
    const curTrack = dataStore.getCurrentTrack();
    container.innerHTML = `
      ${topbarHTML}
      <section class="hero-section">
        <div class="greeting-container">
          <h1 class="greeting-title">
            <span id="hero-greeting-text">Good Evening, Sri Harsha</span>
            <span class="greeting-wave">👋</span>
          </h1>
          <p class="greeting-subtitle">Your personal ambient music station is tuned and ready.</p>
        </div>

        <div class="hero-filter-chips">
          <button class="filter-chip active">Recently Played</button>
          <button class="filter-chip">Top Picks</button>
          <button class="filter-chip">For You</button>
          <button class="filter-chip">Chill</button>
          <button class="filter-chip">Focus</button>
          <button class="filter-chip">Workout</button>
        </div>

        <div class="continue-listening-wrapper">
          <div class="continue-card">
            <div id="continue-cover-art" class="continue-art-wrapper"></div>
            <div class="continue-details">
              <span class="continue-badge">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Continue Listening
              </span>
              <h2 id="continue-title" class="continue-title">${curTrack ? curTrack.title : 'Starlight Symphony'}</h2>
              <p id="continue-artist" class="continue-artist">${curTrack ? curTrack.artist : 'Astral Echoes'}</p>
              
              <div class="continue-progress-row">
                <span id="continue-current-time" class="continue-time">0:00</span>
                <div class="continue-progress-bar-bg">
                  <div id="continue-progress-fill" class="continue-progress-fill"></div>
                </div>
                <span id="continue-duration-time" class="continue-time">${player.formatTime(curTrack ? curTrack.duration : 198)}</span>
              </div>
            </div>
            <button id="continue-play-btn" class="continue-play-btn" title="Play Track">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 4 18 12 6 20 6 4"/>
              </svg>
            </button>
          </div>

          <div class="quote-card glass-card">
            <div class="quote-icon">“</div>
            <p class="quote-text">Music is not what I do. It's who I am.</p>
            <span class="quote-author">— Daily Inspiration</span>
          </div>
        </div>
      </section>

      <section class="stats-grid">
        <div class="stat-card glass-card">
          <div class="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div class="stat-content">
            <div class="stat-value-row">
              <span id="stat-listening-mins" class="stat-number">482 mins</span>
              <span class="stat-trend">↑18%</span>
            </div>
            <span class="stat-label">Total Listening Time</span>
          </div>
        </div>

        <div class="stat-card glass-card">
          <div class="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </div>
          <div class="stat-content">
            <span id="stat-songs-count" class="stat-number">128</span>
            <span class="stat-label">Songs in Library</span>
          </div>
        </div>

        <div class="stat-card glass-card">
          <div class="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m16 6 4 14M12 6v14M8 8v12M4 4v16"></path>
            </svg>
          </div>
          <div class="stat-content">
            <span id="stat-playlists-count" class="stat-number">12</span>
            <span class="stat-label">Playlists</span>
          </div>
        </div>

        <div class="stat-card glass-card">
          <div class="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </div>
          <div class="stat-content">
            <span id="stat-favs-count" class="stat-number">64</span>
            <span class="stat-label">Favorite Songs</span>
          </div>
        </div>
      </section>

      <section class="playlists-section">
        <div class="section-header">
          <h2 class="section-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"></line>
              <line x1="8" y1="12" x2="21" y2="12"></line>
              <line x1="8" y1="18" x2="21" y2="18"></line>
            </svg>
            <span>Your Playlists</span>
          </h2>
          <a href="#" class="section-link">View All</a>
        </div>
        <div id="playlists-grid" class="playlists-grid"></div>
      </section>

      <section class="recently-played-section">
        <div class="section-header">
          <h2 class="section-title">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>Recently Played</span>
          </h2>
          <a href="#" class="section-link">View All</a>
        </div>
        <div id="recently-played-grid" class="tracks-grid"></div>
      </section>
    `;

    this.rebindTopbar();
    this.updateGreetingIST();
    this.renderStats();
    this.renderPlaylists();
    this.renderRecentlyPlayed();
    this.bindFilterChips();
    this.bindContinueListening();
    this.updatePlayerBar(curTrack);
  }

  renderLibraryView(container, topbarHTML) {
    const songs = dataStore.getSongs();
    container.innerHTML = `
      ${topbarHTML}
      <section class="section-header" style="margin-top: 12px;">
        <h2 class="section-title">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 6 4 14M12 6v14M8 8v12M4 4v16"></path></svg>
          <span>Your Music Library (${songs.length} Tracks)</span>
        </h2>
        <button id="lib-play-all-btn" class="source-pill active" style="padding: 8px 18px; font-weight: 700;">▶ Play All</button>
      </section>
      <div class="tracks-grid" id="library-tracks-grid">
        ${this.generateTracksGridHTML(songs)}
      </div>
    `;
    this.rebindTopbar();
    this.bindTrackCardEvents(container);

    const playAll = container.querySelector('#lib-play-all-btn');
    if (playAll) {
      playAll.addEventListener('click', () => {
        dataStore.queue = [...songs];
        dataStore.saveState('music_os_queue', dataStore.queue);
        player.loadTrack(0, true);
        this.renderQueue();
        this.showToast("Playing full music library");
      });
    }
  }

  renderPlaylistsListView(container, topbarHTML) {
    const playlists = dataStore.getPlaylists();
    container.innerHTML = `
      ${topbarHTML}
      <section class="section-header" style="margin-top: 12px;">
        <h2 class="section-title">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
          <span>Your Playlists (${playlists.length})</span>
        </h2>
        <button id="view-create-pl-btn" class="source-pill active">+ New Playlist</button>
      </section>
      <div class="playlists-grid" id="playlists-grid">
        ${playlists.map(pl => `
          <div class="playlist-card glass-card" data-playlist-id="${pl.id}">
            <div class="playlist-art-wrapper" style="background: ${pl.gradient};">
              <svg viewBox="0 0 100 100" class="playlist-svg">
                <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="6"/>
                <circle cx="50" cy="50" r="14" fill="rgba(255,255,255,0.25)"/>
                <path d="M46 40 L60 50 L46 60 Z" fill="#ffffff" opacity="0.9"/>
              </svg>
              <button class="playlist-quick-play" title="Play ${pl.name}">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </button>
            </div>
            <div class="playlist-info">
              <div class="playlist-name">${pl.name}</div>
              <div class="playlist-count">${pl.count} tracks • ${pl.category}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    this.rebindTopbar();

    container.querySelectorAll('.playlist-card').forEach(card => {
      card.addEventListener('click', () => {
        const plId = card.getAttribute('data-playlist-id');
        this.renderPlaylistDetailView(plId);
      });
    });

    const createBtn = container.querySelector('#view-create-pl-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const name = prompt("Enter a name for your new playlist:");
        if (name && name.trim()) {
          dataStore.createPlaylist(name.trim());
          this.renderPlaylistsListView(container, topbarHTML);
          this.renderSidebarPlaylists();
          this.renderStats();
          this.showToast(`Playlist "${name}" created!`);
        }
      });
    }
  }

  renderPlaylistDetailView(playlistId) {
    const main = document.querySelector('.main-content');
    if (!main) return;
    const topbarHTML = document.querySelector('.topbar')?.outerHTML || '';
    const playlist = dataStore.getPlaylists().find(p => p.id === playlistId) || {
      name: "Liked Songs",
      gradient: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
      category: "Personal"
    };

    const songs = dataStore.getSongsByPlaylist(playlistId);

    main.innerHTML = `
      ${topbarHTML}
      <div class="glass-card" style="padding: 24px; display: flex; align-items: center; gap: 24px; margin-top: 8px;">
        <div style="width: 110px; height: 110px; border-radius: 16px; background: ${playlist.gradient}; display: flex; align-items: center; justify-content: center; box-shadow: var(--accent-glow);">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#ffffff" stroke-width="1.8">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent-primary); font-weight: 700;">PLAYLIST • ${playlist.category}</span>
          <h1 style="font-size: 26px; font-weight: 800; color: #fff;">${playlist.name}</h1>
          <p style="font-size: 13px; color: var(--text-muted);">${songs.length} tracks available in lounge</p>
          <div style="display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap;">
            <button id="play-pl-detail-btn" style="background: var(--accent-gradient); color: #fff; padding: 8px 22px; border-radius: 9999px; font-weight: 700; font-size: 13px; box-shadow: var(--accent-glow);">▶ Play All</button>
            ${playlistId !== 'pl-liked' ? `<button id="delete-pl-btn" class="source-pill" style="color: var(--color-pink); border-color: var(--color-pink);">🗑 Delete Playlist</button>` : ''}
            <button id="back-to-playlists" class="source-pill">← Back</button>
          </div>
        </div>
      </div>

      <div class="tracks-grid" style="margin-top: 16px;">
        ${this.generateTracksGridHTML(songs)}
      </div>
    `;

    this.rebindTopbar();
    this.bindTrackCardEvents(main);

    const delPlBtn = main.querySelector('#delete-pl-btn');
    if (delPlBtn) {
      delPlBtn.addEventListener('click', () => {
        if (confirm(`Delete playlist "${playlist.name}"?`)) {
          dataStore.deletePlaylist(playlistId);
          this.renderStats();
          this.renderSidebarPlaylists();
          this.showToast(`Playlist "${playlist.name}" deleted.`);
          this.renderPlaylistsListView(main, topbarHTML);
        }
      });
    }

    const playBtn = main.querySelector('#play-pl-detail-btn');
    if (playBtn && songs.length) {
      playBtn.addEventListener('click', () => {
        dataStore.queue = [...songs];
        dataStore.saveState('music_os_queue', dataStore.queue);
        player.loadTrack(0, true);
        this.renderQueue();
        this.showToast(`Playing ${playlist.name}`);
      });
    }

    const backBtn = main.querySelector('#back-to-playlists');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.renderPlaylistsListView(main, topbarHTML);
      });
    }
  }

  renderArtistsView(container, topbarHTML) {
    const artists = dataStore.getArtists();
    container.innerHTML = `
      ${topbarHTML}
      <section class="section-header" style="margin-top: 12px;">
        <h2 class="section-title">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <span>Artists in Present Music (${artists.length})</span>
        </h2>
      </section>
      <div class="playlists-grid">
        ${artists.map(a => `
          <div class="playlist-card glass-card artist-card" data-artist="${a.name}">
            <div class="playlist-art-wrapper" style="border-radius: 50%;">
              ${this.getCoverSVG(a.name, a.genre)}
            </div>
            <div class="playlist-info" style="text-align: center;">
              <div class="playlist-name">${a.name}</div>
              <div class="playlist-count">${a.count} Track${a.count > 1 ? 's' : ''}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    this.rebindTopbar();

    container.querySelectorAll('.artist-card').forEach(card => {
      card.addEventListener('click', () => {
        const artist = card.getAttribute('data-artist');
        const songs = dataStore.getSongsByArtist(artist);
        this.showArtistSongs(container, topbarHTML, artist, songs);
      });
    });
  }

  showArtistSongs(container, topbarHTML, artistName, songs) {
    container.innerHTML = `
      ${topbarHTML}
      <section class="section-header" style="margin-top: 12px;">
        <h2 class="section-title">
          <span>Tracks by ${artistName} (${songs.length})</span>
        </h2>
        <button id="back-to-artists" class="source-pill">← All Artists</button>
      </section>
      <div class="tracks-grid">
        ${this.generateTracksGridHTML(songs)}
      </div>
    `;
    this.rebindTopbar();
    this.bindTrackCardEvents(container);

    container.querySelector('#back-to-artists')?.addEventListener('click', () => {
      this.renderArtistsView(container, topbarHTML);
    });
  }

  renderAlbumsView(container, topbarHTML) {
    const albums = dataStore.getAlbums();
    container.innerHTML = `
      ${topbarHTML}
      <section class="section-header" style="margin-top: 12px;">
        <h2 class="section-title">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
          <span>Albums (${albums.length})</span>
        </h2>
      </section>
      <div class="playlists-grid">
        ${albums.map(al => `
          <div class="playlist-card glass-card album-card" data-album="${al.name}">
            <div class="playlist-art-wrapper">
              ${this.getCoverSVG(al.name, al.genre)}
            </div>
            <div class="playlist-info">
              <div class="playlist-name">${al.name}</div>
              <div class="playlist-count">${al.artist} • ${al.count} track${al.count > 1 ? 's' : ''}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    this.rebindTopbar();

    container.querySelectorAll('.album-card').forEach(card => {
      card.addEventListener('click', () => {
        const album = card.getAttribute('data-album');
        const songs = dataStore.getSongsByAlbum(album);
        container.innerHTML = `
          ${topbarHTML}
          <section class="section-header" style="margin-top: 12px;">
            <h2 class="section-title"><span>${album}</span></h2>
            <button id="back-to-albums" class="source-pill">← All Albums</button>
          </section>
          <div class="tracks-grid">
            ${this.generateTracksGridHTML(songs)}
          </div>
        `;
        this.rebindTopbar();
        this.bindTrackCardEvents(container);
        container.querySelector('#back-to-albums')?.addEventListener('click', () => {
          this.renderAlbumsView(container, topbarHTML);
        });
      });
    });
  }

  renderAnalyticsView(container, topbarHTML) {
    const stats = dataStore.getStats();
    const songs = dataStore.getSongs();
    const hours = (stats.totalMinutes / 60).toFixed(1);

    container.innerHTML = `
      ${topbarHTML}
      <section class="section-header" style="margin-top: 12px;">
        <h2 class="section-title">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          <span>Listening Analytics & Lounge Insights</span>
        </h2>
      </section>

      <section class="stats-grid">
        <div class="stat-card glass-card">
          <div class="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div class="stat-content">
            <span class="stat-number">${stats.totalMinutes} mins</span>
            <span class="stat-label">Total Listening Time (~${hours} hrs)</span>
          </div>
        </div>

        <div class="stat-card glass-card">
          <div class="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
          <div class="stat-content">
            <span class="stat-number">${stats.songsCount}</span>
            <span class="stat-label">Songs in Library</span>
          </div>
        </div>

        <div class="stat-card glass-card">
          <div class="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 6 4 14M12 6v14M8 8v12M4 4v16"></path></svg>
          </div>
          <div class="stat-content">
            <span class="stat-number">${stats.playlistsCount}</span>
            <span class="stat-label">Playlists</span>
          </div>
        </div>

        <div class="stat-card glass-card">
          <div class="stat-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </div>
          <div class="stat-content">
            <span class="stat-number">${stats.likedCount}</span>
            <span class="stat-label">Favorite Songs</span>
          </div>
        </div>
      </section>

      <div class="glass-card" style="padding: 24px; margin-top: 18px; display: flex; flex-direction: column; gap: 14px;">
        <h3 style="font-size: 15px; font-weight: 700; color: #fff;">Top Genres in Lounge (Realtime)</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(stats.topGenres || []).map(g => `
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 13px;">
              <span style="font-weight: 600; color: var(--text-main);">${g.genre}</span>
              <span style="color: var(--text-muted); font-family: var(--font-mono);">${g.count} track${g.count > 1 ? 's' : ''} (${g.pct}%)</span>
            </div>
            <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 9999px; overflow: hidden;">
              <div style="width: ${g.pct}%; height: 100%; background: var(--accent-gradient);"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    this.rebindTopbar();
  }

  // ==========================================================================
  // IMPORT MUSIC HUB (By URL link, Local File, or Playlist)
  // ==========================================================================
  renderImportMusicView(container, topbarHTML) {
    container.innerHTML = `
      ${topbarHTML}
      <section class="section-header" style="margin-top: 12px;">
        <h2 class="section-title">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          <span>Import Music & Audio Tracks</span>
        </h2>
      </section>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px;">
        <!-- Option 1: Paste Audio Link / Stream -->
        <div class="glass-card" style="padding: 24px; display: flex; flex-direction: column; gap: 14px;">
          <h3 style="font-size: 15px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
            <span>🔗 Import by Audio Link / URL</span>
          </h3>
          <p style="font-size: 12px; color: var(--text-muted);">Paste direct audio link (MP3, AAC, stream) or hosted music file.</p>
          
          <input id="import-url-input" class="search-input" style="padding: 10px 14px;" type="url" placeholder="https://example.com/song.mp3">
          <input id="import-title-input" class="search-input" style="padding: 10px 14px;" type="text" placeholder="Song Title (e.g. Celestial Voyage)">
          <input id="import-artist-input" class="search-input" style="padding: 10px 14px;" type="text" placeholder="Artist (e.g. Luna Sound)">
          
          <button id="btn-import-url" style="background: var(--accent-gradient); color: #fff; padding: 10px 20px; border-radius: var(--radius-md); font-weight: 700; font-size: 13px; box-shadow: var(--accent-glow);">
            + Add to Library
          </button>
        </div>

        <!-- Option 2: Choose or Drag & Drop Local Audio File -->
        <div id="import-dropzone" class="glass-card" style="padding: 24px; display: flex; flex-direction: column; gap: 14px; border: 2px dashed var(--border-glass-hover); transition: all var(--transition-normal); cursor: pointer;">
          <h3 style="font-size: 15px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
            <span>📁 Drag & Drop or Choose Audio Files</span>
          </h3>
          <p style="font-size: 12px; color: var(--text-muted);">Drag .mp3, .wav, .m4a, .ogg, or .flac files directly here or click to browse.</p>
          
          <input id="file-picker-hidden" type="file" accept="audio/*" multiple style="display: none;">
          <button id="btn-choose-file" class="create-playlist-btn" style="padding: 14px; font-size: 13px; border-style: solid; cursor: pointer;">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <span>Browse Audio Files</span>
          </button>
          <span id="file-selected-status" style="font-size: 12px; color: var(--color-green); font-weight: 600;"></span>
        </div>
      </div>
    `;

    this.rebindTopbar();

    // Bind URL import
    container.querySelector('#btn-import-url')?.addEventListener('click', () => {
      const url = container.querySelector('#import-url-input').value.trim();
      const title = container.querySelector('#import-title-input').value.trim();
      const artist = container.querySelector('#import-artist-input').value.trim();

      if (!title) {
        alert("Please enter a title for the track.");
        return;
      }

      const newSong = dataStore.addSong({
        title,
        artist: artist || "Independent Artist",
        url: url || "https://cdn.freesound.org/previews/612/612610_5674468-lq.mp3",
        album: "User Imported",
        genre: "Chill",
        source: "local"
      });

      this.renderStats();
      this.renderSidebarPlaylists();
      this.showToast(`Track "${newSong.title}" added to library!`);
      container.querySelector('#import-url-input').value = '';
      container.querySelector('#import-title-input').value = '';
      container.querySelector('#import-artist-input').value = '';
    });

    // Bind Local file picker & Dropzone drag/drop
    const dropzone = container.querySelector('#import-dropzone');
    const filePicker = container.querySelector('#file-picker-hidden');
    const chooseBtn = container.querySelector('#btn-choose-file');
    const statusSpan = container.querySelector('#file-selected-status');

    const handleFiles = (files) => {
      const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name));
      if (!audioFiles.length) return;

      audioFiles.forEach(file => {
        const blobUrl = URL.createObjectURL(file);
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        dataStore.addSong({
          title: cleanName,
          artist: "Local Storage",
          url: blobUrl,
          album: "Local Files",
          genre: "Focus",
          source: "local"
        });
      });

      if (statusSpan) statusSpan.textContent = `✓ Successfully imported ${audioFiles.length} audio file(s)!`;
      this.renderStats();
      this.renderSidebarPlaylists();
      this.showToast(`Imported ${audioFiles.length} local track(s)!`);
    };

    if (dropzone && filePicker) {
      dropzone.addEventListener('click', () => filePicker.click());

      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.style.borderColor = 'var(--accent-primary)';
          dropzone.style.background = 'rgba(168, 85, 247, 0.15)';
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.style.borderColor = 'var(--border-glass-hover)';
          dropzone.style.background = 'transparent';
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        handleFiles(files);
      });

      filePicker.addEventListener('change', (e) => {
        handleFiles(e.target.files);
      });
    }
  }

  renderLikedSongsView(container, topbarHTML) {
    const liked = dataStore.getSongs().filter(s => s.liked);
    container.innerHTML = `
      ${topbarHTML}
      <section class="section-header" style="margin-top: 12px;">
        <h2 class="section-title">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="#ec4899" stroke="#ec4899" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          <span>Favorite Liked Songs (${liked.length})</span>
        </h2>
        <button id="play-liked-all-btn" class="source-pill active">▶ Play Favorites</button>
      </section>
      <div class="tracks-grid">
        ${this.generateTracksGridHTML(liked)}
      </div>
    `;
    this.rebindTopbar();
    this.bindTrackCardEvents(container);

    container.querySelector('#play-liked-all-btn')?.addEventListener('click', () => {
      if (liked.length) {
        dataStore.queue = [...liked];
        dataStore.saveState('music_os_queue', dataStore.queue);
        player.loadTrack(0, true);
        this.renderQueue();
        this.showToast("Playing all liked songs");
      }
    });
  }

  renderSettingsView(container, topbarHTML) {
    const currentKey = envConfig.get('YOUTUBE_API_KEY', '');
    const masked = currentKey ? `${currentKey.substring(0, 6)}...${currentKey.slice(-4)}` : "None configured";
    const currentEq = player.activeEqPreset || 'flat';

    container.innerHTML = `
      ${topbarHTML}
      <section class="section-header" style="margin-top: 12px;">
        <h2 class="section-title">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          <span>Music OS Settings & Lounge Tuning</span>
        </h2>
      </section>

      <!-- 1. Audio Equalizer Presets -->
      <div class="glass-card" style="padding: 24px; display: flex; flex-direction: column; gap: 14px;">
        <h3 style="font-size: 15px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
          <span>🎚️ Web Audio 5-Band Equalizer</span>
        </h3>
        <p style="font-size: 13px; color: var(--text-muted);">Tune frequency response for your speakers or headphones.</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="source-pill eq-preset-btn ${currentEq === 'flat' ? 'active' : ''}" data-eq="flat">Flat</button>
          <button class="source-pill eq-preset-btn ${currentEq === 'bass' ? 'active' : ''}" data-eq="bass">Bass Boost</button>
          <button class="source-pill eq-preset-btn ${currentEq === 'vocal' ? 'active' : ''}" data-eq="vocal">Vocal Enhancer</button>
          <button class="source-pill eq-preset-btn ${currentEq === 'lofi' ? 'active' : ''}" data-eq="lofi">Lofi Chill</button>
          <button class="source-pill eq-preset-btn ${currentEq === 'edm' ? 'active' : ''}" data-eq="edm">Electronic / EDM</button>
          <button class="source-pill eq-preset-btn ${currentEq === 'treble' ? 'active' : ''}" data-eq="treble">Treble Boost</button>
        </div>
      </div>

      <!-- 2. One-Click JSON Backup & Restore -->
      <div class="glass-card" style="padding: 24px; margin-top: 16px; display: flex; flex-direction: column; gap: 14px;">
        <h3 style="font-size: 15px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
          <span>💾 Backup & Restore (JSON Export/Import)</span>
        </h3>
        <p style="font-size: 13px; color: var(--text-muted);">Export your custom playlists, tracks, and listening stats to a local file or restore from a backup.</p>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button id="btn-export-backup" style="background: var(--accent-gradient); color: #fff; padding: 10px 20px; border-radius: 9999px; font-weight: 700; font-size: 13px; box-shadow: var(--accent-glow); cursor: pointer;">
            📥 Export Backup JSON
          </button>
          <input id="input-import-backup" type="file" accept=".json" style="display: none;">
          <button id="btn-import-backup" class="source-pill" style="cursor: pointer;">
            📤 Restore from JSON File
          </button>
        </div>
      </div>

      <!-- 3. YouTube API Configuration -->
      <div class="glass-card" style="padding: 24px; margin-top: 16px; display: flex; flex-direction: column; gap: 14px;">
        <h3 style="font-size: 15px; font-weight: 700; color: #fff;">🔑 YouTube Data API Key</h3>
        <p style="font-size: 13px; color: var(--text-muted);">Current API Key: <code style="color: var(--accent-primary); font-family: var(--font-mono);">${masked}</code></p>
        <div style="display: flex; gap: 10px;">
          <input id="settings-yt-key-input" class="search-input" style="padding: 10px 14px;" type="text" placeholder="Enter new YouTube Data API key">
          <button id="settings-save-key-btn" style="background: var(--accent-gradient); color: #fff; padding: 10px 22px; border-radius: 9999px; font-weight: 700; font-size: 13px; box-shadow: var(--accent-glow); cursor: pointer;">Save Key</button>
        </div>
      </div>

      <!-- 4. Keyboard Shortcuts Reference -->
      <div class="glass-card" style="padding: 24px; margin-top: 16px; display: flex; flex-direction: column; gap: 12px;">
        <h3 style="font-size: 15px; font-weight: 700; color: #fff;">⌨️ Keyboard Shortcuts Cheat Sheet</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 12px; color: var(--text-muted);">
          <div><code style="color: var(--accent-primary); font-family: var(--font-mono); font-weight: bold;">Space</code> : Play / Pause</div>
          <div><code style="color: var(--accent-primary); font-family: var(--font-mono); font-weight: bold;">Arrow Left / Right</code> : Previous / Next</div>
          <div><code style="color: var(--accent-primary); font-family: var(--font-mono); font-weight: bold;">Arrow Up / Down</code> : Volume Adjust</div>
          <div><code style="color: var(--accent-primary); font-family: var(--font-mono); font-weight: bold;">L Key</code> : Favorite Active Track</div>
          <div><code style="color: var(--accent-primary); font-family: var(--font-mono); font-weight: bold;">M Key</code> : Toggle Audio Mute</div>
        </div>
      </div>

      <!-- 5. Reset Application -->
      <div class="glass-card" style="padding: 24px; margin-top: 16px; display: flex; flex-direction: column; gap: 14px;">
        <h3 style="font-size: 15px; font-weight: 700; color: #fff;">🗑️ Reset Application</h3>
        <p style="font-size: 13px; color: var(--text-muted);">Restore sample playlists and music library to initial clean state.</p>
        <div>
          <button id="btn-reset-library" class="source-pill" style="color: var(--color-pink); border-color: var(--color-pink); cursor: pointer;">Reset Application Cache</button>
        </div>
      </div>
    `;

    this.rebindTopbar();

    // EQ Preset buttons
    container.querySelectorAll('.eq-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const eq = btn.getAttribute('data-eq');
        player.applyEqualizerPreset(eq);
        this.showToast(`Equalizer preset set to "${btn.textContent}"`);
      });
    });

    // Export Backup
    container.querySelector('#btn-export-backup')?.addEventListener('click', () => {
      const jsonStr = dataStore.exportLibraryJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `musicos_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast("Backup JSON exported successfully!");
    });

    // Import Backup
    const importInput = container.querySelector('#input-import-backup');
    container.querySelector('#btn-import-backup')?.addEventListener('click', () => {
      importInput?.click();
    });
    importInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const ok = dataStore.importLibraryJSON(evt.target.result);
        if (ok) {
          this.renderStats();
          this.renderSidebarPlaylists();
          this.showToast("Library successfully restored from backup!");
          this.renderSettingsView(container, topbarHTML);
        } else {
          alert("Invalid backup file format.");
        }
      };
      reader.readAsText(file);
    });

    container.querySelector('#settings-save-key-btn')?.addEventListener('click', () => {
      const val = container.querySelector('#settings-yt-key-input').value.trim();
      if (val) {
        envConfig.set('YOUTUBE_API_KEY', val);
        this.showToast("YouTube API Key saved successfully!");
        this.renderSettingsView(container, topbarHTML);
      }
    });

    container.querySelector('#btn-reset-library')?.addEventListener('click', () => {
      if (confirm("Reset all custom playlists and tracks to default?")) {
        dataStore.resetToDefaults();
        this.renderStats();
        this.renderSidebarPlaylists();
        this.showToast("Library reset to default.");
        this.renderLibraryView(container, topbarHTML);
      }
    });
  }

  generateTracksGridHTML(songs) {
    const currentTrack = dataStore.getCurrentTrack();
    return songs.map(song => {
      const isCurrent = currentTrack && currentTrack.id === song.id;
      return `
        <div class="track-card glass-card ${isCurrent ? 'active-playing' : ''}" data-song-id="${song.id}">
          <div class="track-thumb-box">
            ${this.getCoverSVG(song.title, song.genre)}
            <div class="track-play-badge">
              <div class="track-play-badge-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <polygon points="6 4 18 12 6 20 6 4"/>
                </svg>
              </div>
            </div>
          </div>
          <div class="track-meta">
            <div class="track-text">
              <div class="track-title">${song.title}</div>
              <div class="track-artist">${song.artist}</div>
            </div>
            <div class="track-actions">
              <button class="btn-icon-sm btn-like ${song.liked ? 'liked' : ''}" data-song-id="${song.id}" title="Like">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="${song.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
              </button>
              <button class="btn-icon-sm btn-add-to-playlist" data-song-id="${song.id}" title="Add to Playlist">+</button>
              <button class="btn-icon-sm btn-delete-track" data-song-id="${song.id}" title="Delete Song">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  bindTrackCardEvents(container) {
    container.querySelectorAll('.track-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-like') || e.target.closest('.btn-delete-track') || e.target.closest('.btn-add-to-playlist')) return;
        const songId = card.getAttribute('data-song-id');
        const queue = dataStore.getQueue();
        const index = queue.findIndex(s => s.id === songId);
        if (index !== -1) {
          player.loadTrack(index, true);
        } else {
          const song = dataStore.getSongs().find(s => s.id === songId);
          if (song) {
            dataStore.addTrackToQueue(song);
            player.loadTrack(dataStore.getQueue().length - 1, true);
          }
        }
      });
    });

    container.querySelectorAll('.btn-like').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const songId = btn.getAttribute('data-song-id');
        const isLiked = dataStore.toggleLike(songId);
        btn.classList.toggle('liked', isLiked);
        btn.querySelector('svg').setAttribute('fill', isLiked ? 'currentColor' : 'none');
        this.renderStats();
        this.renderQueue();
        this.updatePlayerBar(dataStore.getCurrentTrack());
        this.showToast(isLiked ? "Added to Liked Songs" : "Removed from Liked Songs");
      });
    });

    container.querySelectorAll('.btn-add-to-playlist').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const songId = btn.getAttribute('data-song-id');
        this.showAddToPlaylistQuickMenu(btn, songId);
      });
    });

    container.querySelectorAll('.btn-delete-track').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const songId = btn.getAttribute('data-song-id');
        const song = dataStore.getSongs().find(s => s.id === songId);
        if (confirm(`Remove "${song?.title || 'this track'}" from your lounge?`)) {
          dataStore.deleteSong(songId);
          this.renderStats();
          this.renderQueue();
          const card = btn.closest('.track-card');
          if (card) card.remove();
          this.showToast(`Track "${song?.title}" removed`);
        }
      });
    });
  }

  showAddToPlaylistQuickMenu(btn, songId) {
    document.querySelectorAll('.playlist-dropdown-menu').forEach(m => m.remove());
    const playlists = dataStore.getPlaylists();

    const menu = document.createElement('div');
    menu.className = 'playlist-dropdown-menu';
    menu.style.cssText = `position: absolute; right: 0; top: 28px; width: 180px; z-index: 200;`;

    menu.innerHTML = playlists.map(p => `
      <button class="playlist-dropdown-item" data-pl-id="${p.id}">
        + ${p.name}
      </button>
    `).join('');

    btn.parentElement.style.position = 'relative';
    btn.parentElement.appendChild(menu);

    menu.querySelectorAll('.playlist-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const plId = item.getAttribute('data-pl-id');
        dataStore.addSongsToPlaylist(plId, [songId]);
        this.renderPlaylists();
        this.renderSidebarPlaylists();
        this.showToast(`Added track to "${item.textContent.replace('+', '').trim()}"`);
        menu.remove();
      });
    });
  }

  rebindTopbar() {
    const themePill = document.getElementById('topbar-theme-pill');
    if (themePill) {
      themePill.addEventListener('click', (e) => {
        e.stopPropagation();
        themeManager.openRightPanel();
      });
    }

    // Source pills (All, YouTube, Local, Spotify, Amazon)
    const sourcePills = document.querySelectorAll('.source-pill[data-source]');
    sourcePills.forEach(pill => {
      pill.addEventListener('click', () => {
        sourcePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const source = pill.getAttribute('data-source');
        dataStore.activeSource = source;
        const allSongs = dataStore.getSongs();
        const filtered = source === 'all' ? allSongs : allSongs.filter(s => s.source.toLowerCase() === source.toLowerCase());
        if (this.currentView === 'Home') {
          this.renderRecentlyPlayed(filtered.slice(0, 4));
        } else if (this.currentView === 'Library') {
          const grid = document.getElementById('library-tracks-grid');
          if (grid) {
            grid.innerHTML = this.generateTracksGridHTML(filtered);
            this.bindTrackCardEvents(document.querySelector('.main-content'));
          }
        }
      });
    });

    // Main search input & clear button
    const searchInput = document.getElementById('main-search-input');
    const searchClear = document.getElementById('search-clear-btn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        dataStore.searchQuery = query;
        if (searchClear) searchClear.style.display = query ? 'block' : 'none';
        const allSongs = dataStore.getSongs();
        const filtered = query
          ? allSongs.filter(s => s.title.toLowerCase().includes(query) || s.artist.toLowerCase().includes(query) || s.album.toLowerCase().includes(query) || s.genre.toLowerCase().includes(query))
          : allSongs;
        if (this.currentView === 'Home') {
          this.renderRecentlyPlayed(query ? filtered : filtered.slice(0, 4));
        } else if (this.currentView === 'Library') {
          const grid = document.getElementById('library-tracks-grid');
          if (grid) {
            grid.innerHTML = this.generateTracksGridHTML(filtered);
            this.bindTrackCardEvents(document.querySelector('.main-content'));
          }
        }
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input'));
        }
      });
    }
  }

  // Cover Art Generator Helper
  getCoverSVG(title, genre = "Chill") {
    const colors = {
      Chill: ["#8b5cf6", "#06b6d4", "#3b82f6"],
      Focus: ["#ec4899", "#8b5cf6", "#3b82f6"],
      Workout: ["#f97316", "#ef4444", "#a855f7"],
      Telugu: ["#f59e0b", "#ec4899", "#8b5cf6"],
      YouTube: ["#ef4444", "#f43f5e", "#8b5cf6"]
    };
    const c = colors[genre] || colors.Chill;

    return `
      <svg viewBox="0 0 200 200" style="width: 100%; height: 100%; display: block;" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad-${title.replace(/[^a-zA-Z0-9]/g, '')}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${c[0]}" />
            <stop offset="50%" stop-color="${c[1]}" />
            <stop offset="100%" stop-color="${c[2]}" />
          </linearGradient>
        </defs>
        <rect width="200" height="200" fill="url(#grad-${title.replace(/[^a-zA-Z0-9]/g, '')})"/>
        <circle cx="100" cy="100" r="55" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="8"/>
        <circle cx="100" cy="100" r="28" fill="rgba(0,0,0,0.3)"/>
        <polygon points="94,88 114,100 94,112" fill="#ffffff"/>
      </svg>
    `;
  }

  showToast(message) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 105px;
        right: 24px;
        background: rgba(20, 15, 50, 0.85);
        backdrop-filter: blur(16px);
        border: 1px solid var(--accent-primary);
        color: #ffffff;
        padding: 10px 18px;
        border-radius: 9999px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: var(--accent-glow);
        z-index: 999;
        opacity: 0;
        transform: translateY(12px);
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
    }, 2800);
  }
}

export const ui = new MusicOSUI();
