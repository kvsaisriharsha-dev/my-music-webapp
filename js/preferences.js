/* ==========================================================================
   MUSIC OS - Supabase User Preferences & Theme Synchronizer
   Manages cloud-synced user preferences, active themes, and RLS-scoped settings.
   ========================================================================== */

import { getSupabase } from './supabase.js';
import { authManager } from './auth.js';
import { themeManager } from './themes.js';

class MusicOSPreferences {
  constructor() {
    this.cachedPreferences = null;
    this.isSyncing = false;
  }

  /**
   * Retrieves the authenticated user's ID from the active Supabase session.
   * Ensures queries are always scoped to auth.uid().
   * @returns {string | null}
   */
  getAuthenticatedUserId() {
    const user = authManager.getCurrentUser();
    return user?.id || null;
  }

  /**
   * Fetches the user_preferences row for the currently authenticated user.
   * If no row exists, initializes a new row with safe defaults.
   * @returns {Promise<{active_theme: string, preferences: object, user_id: string} | null>}
   */
  async getUserPreferences() {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId) {
      return null;
    }

    try {
      const { data, error, status } = await client
        .from('user_preferences')
        .select('user_id, active_theme, preferences, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('⚠️ [Preferences] Error fetching preferences (HTTP ' + status + '):', error.message);
        return null;
      }

      if (!data) {
        // First login: initialize preferences row with safe defaults
        console.log('✨ [Preferences] No preferences row found. Initializing new user defaults...');
        return await this.createUserPreferences();
      }

      this.cachedPreferences = data;
      return data;
    } catch (err) {
      console.error('❌ [Preferences] Unexpected error in getUserPreferences:', err);
      return null;
    }
  }

  /**
   * Initializes a default user_preferences row for a newly authenticated user.
   * @param {object} [customDefaults]
   * @returns {Promise<{active_theme: string, preferences: object, user_id: string} | null>}
   */
  async createUserPreferences(customDefaults = {}) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId) {
      return null;
    }

    const currentTheme = themeManager.currentTheme || localStorage.getItem('music_os_theme') || 'aurora';
    const bgOpacity = themeManager.bgOpacity ?? parseFloat(localStorage.getItem('music_os_bg_opacity') || '1');
    const bgBlur = themeManager.bgBlur ?? parseInt(localStorage.getItem('music_os_bg_blur') || '0', 10);
    const customBgUrl = themeManager.customBgUrl || localStorage.getItem('music_os_custom_bg') || '';

    const newRecord = {
      user_id: userId,
      active_theme: customDefaults.active_theme || currentTheme,
      preferences: {
        bgOpacity,
        bgBlur,
        customBgUrl,
        ...(customDefaults.preferences || {})
      },
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await client
        .from('user_preferences')
        .upsert(newRecord, { onConflict: 'user_id' })
        .select('user_id, active_theme, preferences, updated_at')
        .single();

      if (error) {
        console.warn('⚠️ [Preferences] Could not create initial preferences:', error.message);
        return newRecord;
      }

      console.log('✅ [Preferences] Initial user preferences saved to Supabase.');
      this.cachedPreferences = data;
      return data;
    } catch (err) {
      console.error('❌ [Preferences] Error creating user preferences:', err);
      return newRecord;
    }
  }

  /**
   * Updates user preferences in Supabase for the authenticated user.
   * @param {object} partialPrefs
   * @returns {Promise<boolean>}
   */
  async saveUserPreferences(partialPrefs = {}) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId) {
      return false;
    }

    const currentPrefs = this.cachedPreferences?.preferences || {};
    const mergedPrefs = { ...currentPrefs, ...partialPrefs };

    try {
      const { error } = await client
        .from('user_preferences')
        .update({
          preferences: mergedPrefs,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) {
        console.warn('⚠️ [Preferences] Failed to save preferences to Supabase:', error.message);
        return false;
      }

      if (this.cachedPreferences) {
        this.cachedPreferences.preferences = mergedPrefs;
      }
      return true;
    } catch (err) {
      console.error('❌ [Preferences] Error saving preferences:', err);
      return false;
    }
  }

  /**
   * Persists active theme choice to Supabase for the authenticated user.
   * @param {string} themeId
   * @returns {Promise<boolean>}
   */
  async saveActiveTheme(themeId) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId) {
      return false;
    }

    try {
      const { error } = await client
        .from('user_preferences')
        .update({
          active_theme: themeId,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) {
        console.warn('⚠️ [Preferences] Failed to save active theme to Supabase:', error.message);
        return false;
      }

      if (this.cachedPreferences) {
        this.cachedPreferences.active_theme = themeId;
      }
      return true;
    } catch (err) {
      console.error('❌ [Preferences] Error saving active theme:', err);
      return false;
    }
  }

  /**
   * Loads the active theme from Supabase or falls back to local storage.
   * @returns {Promise<string>}
   */
  async loadActiveTheme() {
    const userId = this.getAuthenticatedUserId();
    if (!userId) {
      return localStorage.getItem('music_os_theme') || 'aurora';
    }

    const prefs = await this.getUserPreferences();
    return prefs?.active_theme || localStorage.getItem('music_os_theme') || 'aurora';
  }

  /**
   * Synchronizes preferences from Supabase into the active themeManager upon login.
   */
  async syncPreferences() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const prefs = await this.getUserPreferences();
      if (prefs) {
        console.log('🔄 [Preferences] Syncing cloud preferences to Theme Studio:', prefs.active_theme);

        // Apply theme from Supabase
        if (prefs.active_theme && prefs.active_theme !== themeManager.currentTheme) {
          themeManager.applyTheme(prefs.active_theme, true);
        }

        // Apply background sliders if present in preferences JSONB
        const jsonb = prefs.preferences;
        if (jsonb && typeof jsonb === 'object') {
          if (typeof jsonb.bgOpacity === 'number') {
            themeManager.setBgOpacity(jsonb.bgOpacity);
          }
          if (typeof jsonb.bgBlur === 'number') {
            themeManager.setBgBlur(jsonb.bgBlur);
          }
          if (typeof jsonb.customBgUrl === 'string' && jsonb.customBgUrl) {
            themeManager.applyCustomBackground(jsonb.customBgUrl, true);
          }
        }
      }
    } catch (err) {
      console.error('❌ [Preferences] Sync error:', err);
    } finally {
      this.isSyncing = false;
    }
  }
}

export const preferencesManager = new MusicOSPreferences();
export const getUserPreferences = () => preferencesManager.getUserPreferences();
export const createUserPreferences = (defaults) => preferencesManager.createUserPreferences(defaults);
export const saveUserPreferences = (prefs) => preferencesManager.saveUserPreferences(prefs);
export const saveActiveTheme = (theme) => preferencesManager.saveActiveTheme(theme);
export const loadActiveTheme = () => preferencesManager.loadActiveTheme();
export const syncPreferences = () => preferencesManager.syncPreferences();

// Expose on window for diagnostics
if (typeof window !== 'undefined') {
  window.preferencesManager = preferencesManager;
}
