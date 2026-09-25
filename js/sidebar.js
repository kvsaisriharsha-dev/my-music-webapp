/* ==========================================================================
   MUSIC OS - Sidebar & Navigation Controller
   Manages active routes, mobile drawer toggles, and playlist creation
   ========================================================================== */

import { dataStore } from './data.js';

class MusicOSSidebar {
  constructor() {
    this.sidebarEl = document.querySelector('.sidebar');
    this.rightPanelEl = document.querySelector('.right-panel');
    this.backdropEl = document.getElementById('panel-backdrop');
  }

  init(onNavChangeCallback, onPlaylistCreatedCallback) {
    this.onNavChangeCallback = onNavChangeCallback;
    this.onPlaylistCreatedCallback = onPlaylistCreatedCallback;
    this.bindNavLinks();
    this.bindMobileToggles();
    this.bindCreatePlaylist();
  }

  bindNavLinks() {
    const links = document.querySelectorAll('.sidebar-link[data-nav]');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        links.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const navId = link.getAttribute('data-nav');
        this.closeMobileDrawers();
        if (this.onNavChangeCallback) {
          this.onNavChangeCallback(navId);
        }
      });
    });
  }

  bindMobileToggles() {
    const mobileMenuBtn = document.getElementById('mobile-menu-toggle');
    const closeSidebarBtn = document.getElementById('sidebar-close-btn');
    const closeRightPanelBtn = document.getElementById('right-panel-close-btn');

    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', () => {
        this.openSidebar();
      });
    }

    if (closeSidebarBtn) {
      closeSidebarBtn.addEventListener('click', () => {
        this.closeSidebar();
      });
    }

    if (closeRightPanelBtn) {
      closeRightPanelBtn.addEventListener('click', () => {
        this.closeRightPanel();
      });
    }

    if (this.backdropEl) {
      this.backdropEl.addEventListener('click', () => {
        this.closeMobileDrawers();
      });
    }
  }

  openSidebar() {
    if (this.sidebarEl) this.sidebarEl.classList.add('drawer-open');
    if (this.backdropEl) this.backdropEl.classList.add('active');
  }

  closeSidebar() {
    if (this.sidebarEl) this.sidebarEl.classList.remove('drawer-open');
    if (this.backdropEl && !this.rightPanelEl?.classList.contains('drawer-open')) {
      this.backdropEl.classList.remove('active');
    }
  }

  openRightPanel() {
    if (this.rightPanelEl) this.rightPanelEl.classList.add('drawer-open');
    if (this.backdropEl) this.backdropEl.classList.add('active');
  }

  closeRightPanel() {
    if (this.rightPanelEl) this.rightPanelEl.classList.remove('drawer-open');
    if (this.backdropEl && !this.sidebarEl?.classList.contains('drawer-open')) {
      this.backdropEl.classList.remove('active');
    }
  }

  closeMobileDrawers() {
    this.closeSidebar();
    this.closeRightPanel();
  }

  bindCreatePlaylist() {
    const createBtn = document.getElementById('sidebar-create-playlist-btn');
    const addHeaderBtn = document.getElementById('sidebar-add-playlist-header-btn');

    const handleCreate = () => {
      const name = prompt("Enter a name for your new playlist:", "My Cosmic Lounge");
      if (name && name.trim()) {
        const created = dataStore.createPlaylist(name.trim());
        if (this.onPlaylistCreatedCallback) {
          this.onPlaylistCreatedCallback(created);
        }
      }
    };

    if (createBtn) createBtn.addEventListener('click', handleCreate);
    if (addHeaderBtn) addHeaderBtn.addEventListener('click', handleCreate);
  }
}

export const sidebarController = new MusicOSSidebar();
