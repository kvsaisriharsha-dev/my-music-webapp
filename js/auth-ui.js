/* ==========================================================================
   MUSIC OS - Authentication UI & Modal Controller
   Provides sleek glassmorphism Sign In / Sign Up modals and profile state updates
   ========================================================================== */

import { authManager } from './auth.js';
import { ui } from './ui.js';

class MusicOSAuthUI {
  constructor() {
    this.modalEl = null;
    this.activeTab = 'signin'; // 'signin' | 'signup'
    this.isSubmitting = false;
  }

  init() {
    this.createAuthModal();
    this.bindSidebarProfile();

    // Subscribe to Auth State Changes to update UI
    authManager.onAuthStateChange((state) => {
      this.updateProfileUI(state);
    });
  }

  /**
   * Builds and attaches the Auth Modal DOM element if not present.
   */
  createAuthModal() {
    if (document.getElementById('auth-modal-backdrop')) return;

    const modalHTML = `
      <div id="auth-modal-backdrop" class="auth-modal-backdrop" style="display: none;">
        <div class="auth-modal-card" role="dialog" aria-labelledby="auth-modal-title" aria-modal="true">
          <!-- Header -->
          <div class="auth-modal-header">
            <div class="auth-brand-badge">
              <div class="auth-brand-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v4"></path>
                </svg>
              </div>
              <span class="auth-brand-text">MUSIC OS</span>
            </div>
            <button id="auth-modal-close-btn" class="auth-close-btn" title="Close">✕</button>
          </div>

          <!-- Tabs -->
          <div class="auth-tabs">
            <button id="auth-tab-signin" class="auth-tab-btn active" data-tab="signin">Sign In</button>
            <button id="auth-tab-signup" class="auth-tab-btn" data-tab="signup">Sign Up</button>
          </div>

          <!-- Alert / Error Banner -->
          <div id="auth-error-banner" class="auth-banner auth-banner-error" style="display: none;"></div>
          <div id="auth-success-banner" class="auth-banner auth-banner-success" style="display: none;"></div>

          <!-- Sign In Form -->
          <form id="auth-signin-form" class="auth-form" autocomplete="on">
            <div class="auth-input-group">
              <label for="auth-signin-email" class="auth-label">Email Address</label>
              <div class="auth-input-wrapper">
                <svg class="auth-input-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <input id="auth-signin-email" type="email" class="auth-input" placeholder="you@example.com" required autocomplete="email">
              </div>
            </div>

            <div class="auth-input-group">
              <label for="auth-signin-password" class="auth-label">Password</label>
              <div class="auth-input-wrapper">
                <svg class="auth-input-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input id="auth-signin-password" type="password" class="auth-input" placeholder="••••••••" required autocomplete="current-password">
              </div>
            </div>

            <button id="auth-signin-submit-btn" type="submit" class="auth-submit-btn">
              <span>Sign In</span>
            </button>
          </form>

          <!-- Sign Up Form -->
          <form id="auth-signup-form" class="auth-form" style="display: none;" autocomplete="on">
            <div class="auth-input-group">
              <label for="auth-signup-email" class="auth-label">Email Address</label>
              <div class="auth-input-wrapper">
                <svg class="auth-input-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <input id="auth-signup-email" type="email" class="auth-input" placeholder="you@example.com" required autocomplete="email">
              </div>
            </div>

            <div class="auth-input-group">
              <label for="auth-signup-password" class="auth-label">Create Password (Min. 6 characters)</label>
              <div class="auth-input-wrapper">
                <svg class="auth-input-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input id="auth-signup-password" type="password" class="auth-input" placeholder="••••••••" required autocomplete="new-password" minlength="6">
              </div>
            </div>

            <div class="auth-input-group">
              <label for="auth-signup-confirm-password" class="auth-label">Confirm Password</label>
              <div class="auth-input-wrapper">
                <svg class="auth-input-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <input id="auth-signup-confirm-password" type="password" class="auth-input" placeholder="••••••••" required autocomplete="new-password" minlength="6">
              </div>
            </div>

            <button id="auth-signup-submit-btn" type="submit" class="auth-submit-btn">
              <span>Create Account</span>
            </button>
          </form>

          <!-- Footer Switch -->
          <div class="auth-footer">
            <span id="auth-footer-text" class="auth-footer-text">Don't have an account?</span>
            <button id="auth-switch-mode-btn" class="auth-switch-btn">Sign Up</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modalEl = document.getElementById('auth-modal-backdrop');

    this.bindModalEvents();
  }

  bindModalEvents() {
    const closeBtn = document.getElementById('auth-modal-close-btn');
    const tabSignIn = document.getElementById('auth-tab-signin');
    const tabSignUp = document.getElementById('auth-tab-signup');
    const switchBtn = document.getElementById('auth-switch-mode-btn');

    const signInForm = document.getElementById('auth-signin-form');
    const signUpForm = document.getElementById('auth-signup-form');

    closeBtn?.addEventListener('click', () => this.hideAuthModal());

    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.hideAuthModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl?.style.display !== 'none') {
        this.hideAuthModal();
      }
    });

    tabSignIn?.addEventListener('click', () => this.switchTab('signin'));
    tabSignUp?.addEventListener('click', () => this.switchTab('signup'));
    switchBtn?.addEventListener('click', () => {
      this.switchTab(this.activeTab === 'signin' ? 'signup' : 'signin');
    });

    // Handle Sign In Submit
    signInForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (this.isSubmitting) return;

      const email = document.getElementById('auth-signin-email')?.value;
      const password = document.getElementById('auth-signin-password')?.value;

      this.setSubmitting(true, 'auth-signin-submit-btn', 'Signing In...');
      this.clearBanners();

      const res = await authManager.signIn(email, password);
      this.setSubmitting(false, 'auth-signin-submit-btn', 'Sign In');

      if (!res.success) {
        this.showError(res.error || 'Failed to sign in. Please check your credentials.');
      } else {
        this.showSuccess(`Welcome back, ${res.user?.email || 'User'}!`);
        setTimeout(() => {
          this.hideAuthModal();
          ui.showToast(`Logged in as ${res.user?.email}`);
        }, 600);
      }
    });

    // Handle Sign Up Submit
    signUpForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (this.isSubmitting) return;

      const email = document.getElementById('auth-signup-email')?.value;
      const password = document.getElementById('auth-signup-password')?.value;
      const confirmPassword = document.getElementById('auth-signup-confirm-password')?.value;

      this.clearBanners();

      if (password !== confirmPassword) {
        this.showError('Passwords do not match. Please re-enter.');
        return;
      }

      this.setSubmitting(true, 'auth-signup-submit-btn', 'Creating Account...');

      const res = await authManager.signUp(email, password);
      this.setSubmitting(false, 'auth-signup-submit-btn', 'Create Account');

      if (!res.success) {
        this.showError(res.error || 'Failed to create account.');
      } else {
        this.showSuccess(res.message);
        if (!res.requiresConfirmation) {
          setTimeout(() => {
            this.hideAuthModal();
            ui.showToast(`Account created for ${res.user?.email}`);
          }, 800);
        }
      }
    });
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.clearBanners();

    const tabSignIn = document.getElementById('auth-tab-signin');
    const tabSignUp = document.getElementById('auth-tab-signup');
    const signInForm = document.getElementById('auth-signin-form');
    const signUpForm = document.getElementById('auth-signup-form');
    const footerText = document.getElementById('auth-footer-text');
    const switchBtn = document.getElementById('auth-switch-mode-btn');

    if (tab === 'signin') {
      tabSignIn?.classList.add('active');
      tabSignUp?.classList.remove('active');
      if (signInForm) signInForm.style.display = 'flex';
      if (signUpForm) signUpForm.style.display = 'none';
      if (footerText) footerText.textContent = "Don't have an account?";
      if (switchBtn) switchBtn.textContent = "Sign Up";
    } else {
      tabSignUp?.classList.add('active');
      tabSignIn?.classList.remove('active');
      if (signInForm) signInForm.style.display = 'none';
      if (signUpForm) signUpForm.style.display = 'flex';
      if (footerText) footerText.textContent = "Already have an account?";
      if (switchBtn) switchBtn.textContent = "Sign In";
    }
  }

  showAuthModal(initialTab = 'signin') {
    if (!this.modalEl) this.createAuthModal();
    this.switchTab(initialTab);
    this.clearBanners();
    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
      const targetInput = initialTab === 'signin' 
        ? document.getElementById('auth-signin-email')
        : document.getElementById('auth-signup-email');
      targetInput?.focus();
    }
  }

  hideAuthModal() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
      this.clearBanners();
    }
  }

  setSubmitting(isSubmitting, btnId, text) {
    this.isSubmitting = isSubmitting;
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.disabled = isSubmitting;
      btn.innerHTML = isSubmitting
        ? `<span class="auth-spinner"></span> <span>${text}</span>`
        : `<span>${text}</span>`;
    }
  }

  showError(msg) {
    const banner = document.getElementById('auth-error-banner');
    if (banner) {
      banner.textContent = msg;
      banner.style.display = 'block';
    }
  }

  showSuccess(msg) {
    const banner = document.getElementById('auth-success-banner');
    if (banner) {
      banner.textContent = msg;
      banner.style.display = 'block';
    }
  }

  clearBanners() {
    const err = document.getElementById('auth-error-banner');
    const succ = document.getElementById('auth-success-banner');
    if (err) err.style.display = 'none';
    if (succ) succ.style.display = 'none';
  }

  /**
   * Binds click events to the sidebar user card.
   */
  bindSidebarProfile() {
    const userCard = document.querySelector('.sidebar-user .user-card');
    if (!userCard) return;

    userCard.addEventListener('click', (e) => {
      e.preventDefault();
      const state = authManager.getAuthState();

      if (state.isAuthenticated) {
        this.showAccountDetailsModal(state.user);
      } else {
        this.showAuthModal('signin');
      }
    });
  }

  /**
   * Updates sidebar user card based on current auth state.
   */
  updateProfileUI(state) {
    const nameEl = document.querySelector('.sidebar-user .user-name');
    const planEl = document.querySelector('.sidebar-user .user-plan');
    const avatarEl = document.querySelector('.sidebar-user .user-avatar');

    if (!nameEl || !planEl || !avatarEl) return;

    if (state.isAuthenticated && state.user) {
      const email = state.user.email || 'User';
      const initial = email.charAt(0).toUpperCase();
      const displayName = email.split('@')[0];

      nameEl.textContent = displayName;
      nameEl.title = email;
      planEl.textContent = "Supabase Synced";
      planEl.style.color = "var(--color-green)";
      avatarEl.textContent = initial;
      avatarEl.style.background = "linear-gradient(135deg, #10b981, #06b6d4)";
      avatarEl.style.boxShadow = "0 0 12px rgba(16, 185, 129, 0.4)";
    } else {
      nameEl.textContent = "Sign In";
      nameEl.title = "Click to sign in or create account";
      planEl.textContent = "Cloud Account";
      planEl.style.color = "var(--text-muted)";
      avatarEl.textContent = "👤";
      avatarEl.style.background = "linear-gradient(135deg, #8b5cf6, #ec4899)";
      avatarEl.style.boxShadow = "0 0 12px rgba(139, 92, 246, 0.3)";
    }
  }

  /**
   * Displays authenticated account info and Sign Out prompt.
   */
  showAccountDetailsModal(user) {
    let backdrop = document.getElementById('account-modal-backdrop');
    if (!backdrop) {
      const modalHTML = `
        <div id="account-modal-backdrop" class="auth-modal-backdrop" style="display: none;">
          <div class="auth-modal-card" style="max-width: 380px;">
            <div class="auth-modal-header">
              <div class="auth-brand-badge">
                <span class="auth-brand-text">Account Profile</span>
              </div>
              <button id="account-modal-close-btn" class="auth-close-btn">✕</button>
            </div>
            <div class="account-info-body" style="padding: 16px 0; display: flex; flex-direction: column; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div class="user-avatar" id="account-modal-avatar" style="width: 44px; height: 44px; font-size: 16px;"></div>
                <div style="display: flex; flex-direction: column;">
                  <span id="account-modal-email" style="font-weight: 600; font-size: 14px; color: var(--text-main);"></span>
                  <span style="font-size: 11px; color: var(--color-green);">● Supabase Active Session</span>
                </div>
              </div>
              <div style="font-size: 11px; color: var(--text-muted); word-break: break-all; background: rgba(255,255,255,0.03); padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-glass);">
                <span style="color: var(--text-faint); display: block; margin-bottom: 2px;">User ID:</span>
                <span id="account-modal-uid"></span>
              </div>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <button id="account-signout-btn" class="btn-danger-glass" style="flex: 1; padding: 10px; border-radius: 10px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHTML);
      backdrop = document.getElementById('account-modal-backdrop');

      document.getElementById('account-modal-close-btn')?.addEventListener('click', () => {
        backdrop.style.display = 'none';
      });

      backdrop?.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.style.display = 'none';
      });

      document.getElementById('account-signout-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('account-signout-btn');
        if (btn) btn.textContent = 'Signing out...';
        await authManager.signOut();
        backdrop.style.display = 'none';
        ui.showToast('Signed out successfully.');
      });
    }

    const email = user?.email || 'User';
    const emailEl = document.getElementById('account-modal-email');
    const uidEl = document.getElementById('account-modal-uid');
    const avatarEl = document.getElementById('account-modal-avatar');

    if (emailEl) emailEl.textContent = email;
    if (uidEl) uidEl.textContent = user?.id || '';
    if (avatarEl) {
      avatarEl.textContent = email.charAt(0).toUpperCase();
      avatarEl.style.background = "linear-gradient(135deg, #10b981, #06b6d4)";
    }

    backdrop.style.display = 'flex';
  }
}

export const authUI = new MusicOSAuthUI();

if (typeof window !== 'undefined') {
  window.authUI = authUI;
}
