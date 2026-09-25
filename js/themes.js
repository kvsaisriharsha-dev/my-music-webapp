/* ==========================================================================
   MUSIC OS - Theme Engine & Dynamic Landscape Manager
   Swaps CSS variables, custom background images/videos & persists state
   ========================================================================== */

import { THEMES } from './data.js';

class MusicOSThemeManager {
  constructor() {
    this.currentTheme = localStorage.getItem('music_os_theme') || 'aurora';
    this.customBgUrl = localStorage.getItem('music_os_custom_bg') || '';
    this.bgOpacity = parseFloat(localStorage.getItem('music_os_bg_opacity') || '1');
    this.bgBlur = parseInt(localStorage.getItem('music_os_bg_blur') || '0', 10);
    this.isPanelOpen = false;
  }

  init() {
    this.applyTheme(this.currentTheme, false);
    this.applyBgSettings();
    if (this.customBgUrl) {
      this.applyCustomBackground(this.customBgUrl, true);
    }
    this.bindEvents();
    this.initSliderEvents();
  }

  applyBgSettings() {
    const canvas = document.getElementById('background-canvas') || document.querySelector('.background-canvas');
    if (canvas) {
      canvas.style.opacity = this.bgOpacity;
      canvas.style.filter = `blur(${this.bgBlur}px)`;
    }

    const opSlider = document.getElementById('theme-opacity-slider');
    const opLabel = document.getElementById('theme-opacity-val');
    if (opSlider) opSlider.value = this.bgOpacity;
    if (opLabel) opLabel.textContent = `${Math.round(this.bgOpacity * 100)}%`;

    const blurSlider = document.getElementById('theme-blur-slider');
    const blurLabel = document.getElementById('theme-blur-val');
    if (blurSlider) blurSlider.value = this.bgBlur;
    if (blurLabel) blurLabel.textContent = `${this.bgBlur}px`;
  }

  setBgOpacity(val) {
    this.bgOpacity = Math.max(0.1, Math.min(1, parseFloat(val)));
    localStorage.setItem('music_os_bg_opacity', this.bgOpacity.toString());
    this.applyBgSettings();
  }

  setBgBlur(val) {
    this.bgBlur = Math.max(0, Math.min(40, parseInt(val, 10)));
    localStorage.setItem('music_os_bg_blur', this.bgBlur.toString());
    this.applyBgSettings();
  }

  applyTheme(themeId, notify = true) {
    const validTheme = THEMES.find(t => t.id === themeId) ? themeId : 'aurora';
    this.currentTheme = validTheme;
    document.documentElement.setAttribute('data-theme', validTheme);
    document.body.setAttribute('data-theme', validTheme);
    localStorage.setItem('music_os_theme', validTheme);

    this.updateUISelection(validTheme);

    if (notify) {
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: validTheme } }));
    }
  }

  applyCustomBackground(url, save = true) {
    const layer = document.getElementById('bg-custom-layer');
    if (!layer) return;

    if (!url || !url.trim()) {
      this.clearCustomBackground();
      return;
    }

    const cleanUrl = url.trim();
    layer.style.backgroundImage = `url("${cleanUrl}")`;
    document.body.classList.add('has-custom-bg');

    if (save) {
      localStorage.setItem('music_os_custom_bg', cleanUrl);
      this.customBgUrl = cleanUrl;
    } else {
      this.customBgUrl = cleanUrl;
    }
  }

  clearCustomBackground() {
    const layer = document.getElementById('bg-custom-layer');
    if (layer) {
      layer.style.backgroundImage = 'none';
    }
    document.body.classList.remove('has-custom-bg');
    localStorage.removeItem('music_os_custom_bg');
    this.customBgUrl = '';
  }

  openRightPanel() {
    const app = document.getElementById('app');
    const rightPanel = document.querySelector('.right-panel');
    const backdrop = document.getElementById('panel-backdrop');

    if (app) app.classList.add('right-panel-open');
    if (rightPanel) rightPanel.classList.add('drawer-open');
    if (backdrop && window.innerWidth <= 1200) backdrop.classList.add('active');
    this.isPanelOpen = true;
  }

  closeRightPanel() {
    const app = document.getElementById('app');
    const rightPanel = document.querySelector('.right-panel');
    const backdrop = document.getElementById('panel-backdrop');

    if (app) app.classList.remove('right-panel-open');
    if (rightPanel) rightPanel.classList.remove('drawer-open');
    if (backdrop && !document.querySelector('.sidebar')?.classList.contains('drawer-open')) {
      backdrop.classList.remove('active');
    }
    this.isPanelOpen = false;
  }

  toggleRightPanel() {
    if (this.isPanelOpen) {
      this.closeRightPanel();
    } else {
      this.openRightPanel();
    }
  }

  updateUISelection(themeId) {
    // Update theme pill in topbar
    const themeNameLabel = document.getElementById('current-theme-label');
    const themeObj = THEMES.find(t => t.id === themeId);
    if (themeNameLabel && themeObj) {
      themeNameLabel.textContent = themeObj.name;
    }

    // Update active badge in themes card
    const activeTag = document.getElementById('theme-active-tag');
    if (activeTag && themeObj) {
      activeTag.textContent = themeObj.name;
    }

    // Update active class on theme grid buttons
    const themeButtons = document.querySelectorAll('.theme-tile-btn');
    themeButtons.forEach(btn => {
      if (btn.getAttribute('data-theme-id') === themeId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  bindEvents() {
    // Topbar theme pill dropdown trigger -> Opens right panel & theme studio
    const themePill = document.getElementById('topbar-theme-pill');
    if (themePill) {
      themePill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openRightPanel();
        const themesCard = document.querySelector('.themes-panel-card');
        if (themesCard) themesCard.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Right panel desktop close button
    const desktopCloseBtn = document.getElementById('right-panel-desktop-close');
    if (desktopCloseBtn) {
      desktopCloseBtn.addEventListener('click', () => {
        this.closeRightPanel();
      });
    }

    // Mobile right panel close button
    const mobileCloseBtn = document.getElementById('right-panel-close-btn');
    if (mobileCloseBtn) {
      mobileCloseBtn.addEventListener('click', () => {
        this.closeRightPanel();
      });
    }
  }

  initSliderEvents() {
    const opSlider = document.getElementById('theme-opacity-slider');
    const blurSlider = document.getElementById('theme-blur-slider');

    if (opSlider) {
      const handleOpacityChange = (e) => {
        this.setBgOpacity(e.target.value);
      };
      opSlider.addEventListener('input', handleOpacityChange);
      opSlider.addEventListener('change', handleOpacityChange);
    }

    if (blurSlider) {
      const handleBlurChange = (e) => {
        this.setBgBlur(e.target.value);
      };
      blurSlider.addEventListener('input', handleBlurChange);
      blurSlider.addEventListener('change', handleBlurChange);
    }
  }
}

export const themeManager = new MusicOSThemeManager();
