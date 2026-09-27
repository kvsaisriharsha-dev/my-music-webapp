/* ==========================================================================
   MUSIC OS - Sync Reliability & Offline/Online Recovery Coordinator
   Centralizes network state, transient error classification, exponential
   backoff retries, user-scoped dirty state, and coordinated recovery.
   ========================================================================== */

import { authManager } from './auth.js';

const SYNC_STATE_STORAGE_KEY = 'music_os_sync_state';

class MusicOSSyncCoordinator {
  constructor() {
    this.networkState = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean')
      ? (navigator.onLine ? 'online' : 'offline')
      : 'online';

    this.inFlightSyncs = new Map(); // category -> Promise
    this.retryTimers = new Map(); // category -> timerId
    this.recoveryDebounceTimer = null;
    this.visibilityRecoveryTimer = null;
    this.lastVisibilitySyncTime = 0;
    this.listeners = new Set();

    this.initNetworkListeners();
  }

  /**
   * Initializes browser online/offline and visibility event listeners.
   */
  initNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      console.log('🌐 [SyncCoordinator] Network connection restored (online event).');
      this.setNetworkState('online');
      this.scheduleOnlineRecovery();
    });

    window.addEventListener('offline', () => {
      console.log('📡 [SyncCoordinator] Network disconnected (offline event). Running in local-first mode.');
      this.setNetworkState('offline');
      this.cancelAllRetryTimers();
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.handleVisibilityRecovery();
        }
      });
    }
  }

  setNetworkState(state) {
    if (this.networkState !== state) {
      this.networkState = state;
      this.notifyListeners(state);
    }
  }

  getNetworkState() {
    return this.networkState;
  }

  isOnline() {
    return this.networkState !== 'offline';
  }

  onStateChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
      callback(this.networkState);
    }
    return () => this.listeners.delete(callback);
  }

  notifyListeners(state) {
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('[SyncCoordinator] Listener error:', err);
      }
    }
  }

  /**
   * Classifies an error into Transient (retryable) vs Non-Transient (permanent).
   * @param {any} err 
   * @param {number} [status] 
   * @returns {boolean} True if transient/retryable
   */
  isTransientError(err, status = 0) {
    // 1. Explicit HTTP status checks
    if (status === 408 || status === 429 || (status >= 500 && status <= 599)) {
      return true;
    }

    // 2. Non-transient HTTP statuses (never retry blindly)
    if (status === 400 || status === 401 || status === 403 || status === 404 || status === 409 || status === 422) {
      return false;
    }

    // 3. Error object inspection
    if (!err) return false;
    const msg = (err.message || String(err)).toLowerCase();
    const code = err.code || '';

    // Non-transient PostgreSQL / RLS / Schema codes
    if (code === '42501' || code === 'PGRST204' || code === '23503' || code === '23505') {
      return false;
    }

    // Transient fetch / network / timeout errors
    if (
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('timeout') ||
      msg.includes('aborterror') ||
      msg.includes('connection') ||
      msg.includes('econnrefused') ||
      msg.includes('ehostunreach') ||
      err.name === 'AbortError' ||
      err.name === 'TypeError'
    ) {
      return true;
    }

    return status === 0;
  }

  /**
   * Wraps an asynchronous cloud operation with timeout safety and bounded exponential backoff retries.
   * @param {string} category Logical sync category (e.g. 'playlists', 'library')
   * @param {Function} taskFn Function returning a Promise
   * @param {object} [options]
   * @param {number} [options.maxAttempts=3]
   * @param {number} [options.timeoutMs=12000]
   * @param {number} [options.initialDelayMs=1000]
   * @param {string} [options.userId=null]
   * @returns {Promise<{success: boolean, data?: any, error?: string, wasRetried?: boolean}>}
   */
  async executeWithRetry(category, taskFn, options = {}) {
    const maxAttempts = options.maxAttempts ?? 3;
    const timeoutMs = options.timeoutMs ?? 12000;
    const initialDelayMs = options.initialDelayMs ?? 1000;
    const userId = options.userId || authManager.getCurrentUser()?.id || null;

    let attempt = 0;
    let lastError = null;
    let lastStatus = 0;

    while (attempt < maxAttempts) {
      attempt++;

      // Check current network status before making request
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.setNetworkState('offline');
        if (userId) this.markCategoryDirty(userId, category);
        return { success: false, error: 'Device is offline. Task marked for online recovery.' };
      }

      try {
        // Execute task with timeout race
        const taskPromise = taskFn();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            const err = new Error(`Request timeout after ${timeoutMs}ms`);
            err.name = 'AbortError';
            reject(err);
          }, timeoutMs);
        });

        const result = await Promise.race([taskPromise, timeoutPromise]);

        // Check if task returned a result object with error
        if (result && typeof result === 'object' && result.success === false && result.error) {
          lastError = result.error;
          lastStatus = result.status || 0;

          if (!this.isTransientError(result.error, lastStatus)) {
            // Permanent failure -> Do NOT retry
            console.warn(`🛑 [SyncCoordinator] Permanent failure in "${category}" (HTTP ${lastStatus}): ${result.error}. Not retrying.`);
            return result;
          }
        } else {
          // Success! Clear dirty state
          if (userId) {
            this.clearCategoryDirty(userId, category);
          }
          return typeof result === 'object' ? result : { success: true, data: result };
        }
      } catch (err) {
        lastError = err;
        lastStatus = err.status || 0;

        if (!this.isTransientError(err, lastStatus)) {
          // Permanent failure -> Do NOT retry
          console.warn(`🛑 [SyncCoordinator] Non-transient error in "${category}": ${err.message || err}. Not retrying.`);
          return { success: false, error: err.message || String(err) };
        }
      }

      // If we got here, a transient error occurred. Calculate backoff delay with jitter
      if (attempt < maxAttempts) {
        this.setNetworkState('degraded');
        const jitter = Math.random() * 400;
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1) + jitter, 10000);

        console.log(`⏳ [SyncCoordinator] Transient issue in "${category}" (attempt ${attempt}/${maxAttempts}). Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retry attempts exhausted: Mark category dirty for recovery when connectivity stabilizes
    console.warn(`⚠️ [SyncCoordinator] All ${maxAttempts} retry attempts exhausted for "${category}". Marking category as pending.`);
    if (userId) {
      this.markCategoryDirty(userId, category);
    }
    return {
      success: false,
      error: lastError?.message || lastError || 'Max retries exhausted for transient error.',
      wasRetried: true
    };
  }

  /**
   * Deduplicates in-flight calls for a specific category.
   * If a sync for this category is already executing, returns the existing Promise.
   * @param {string} category 
   * @param {Function} syncFn 
   * @returns {Promise<any>}
   */
  async runDeduplicated(category, syncFn) {
    if (this.inFlightSyncs.has(category)) {
      console.log(`🔒 [SyncCoordinator] Reusing existing in-flight sync for "${category}".`);
      return this.inFlightSyncs.get(category);
    }

    const promise = (async () => {
      try {
        return await syncFn();
      } finally {
        this.inFlightSyncs.delete(category);
      }
    })();

    this.inFlightSyncs.set(category, promise);
    return promise;
  }

  // ==========================================================================
  // USER-SCOPED DIRTY STATE PERSISTENCE
  // ==========================================================================

  getDirtyState() {
    try {
      if (typeof localStorage === 'undefined') return {};
      const raw = localStorage.getItem(SYNC_STATE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  saveDirtyState(state) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SYNC_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('⚠️ [SyncCoordinator] Error saving dirty state:', err);
    }
  }

  markCategoryDirty(userId, category) {
    if (!userId || !category) return;
    const allState = this.getDirtyState();
    if (!allState[userId]) allState[userId] = {};
    allState[userId][category] = true;
    this.saveDirtyState(allState);
    console.log(`📌 [SyncCoordinator] Marked "${category}" as pending for user: ${userId}`);
  }

  clearCategoryDirty(userId, category) {
    if (!userId || !category) return;
    const allState = this.getDirtyState();
    if (allState[userId] && allState[userId][category]) {
      delete allState[userId][category];
      if (Object.keys(allState[userId]).length === 0) {
        delete allState[userId];
      }
      this.saveDirtyState(allState);
      console.log(`✨ [SyncCoordinator] Cleared pending status for "${category}".`);
    }
  }

  getDirtyCategories(userId) {
    if (!userId) return [];
    const allState = this.getDirtyState();
    const userState = allState[userId];
    if (!userState || typeof userState !== 'object') return [];
    return Object.keys(userState).filter(cat => userState[cat] === true);
  }

  clearUserTransientState(userId) {
    if (!userId) return;
    const allState = this.getDirtyState();
    delete allState[userId];
    this.saveDirtyState(allState);
  }

  cancelAllRetryTimers() {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
  }

  // ==========================================================================
  // ONLINE RECOVERY COORDINATION
  // ==========================================================================

  /**
   * Schedules a debounced online recovery sync when connection is restored.
   */
  scheduleOnlineRecovery() {
    if (this.recoveryDebounceTimer) {
      clearTimeout(this.recoveryDebounceTimer);
    }

    // Wait 1500ms for connection stabilization
    this.recoveryDebounceTimer = setTimeout(async () => {
      this.recoveryDebounceTimer = null;
      await this.executeRecovery();
    }, 1500);
  }

  /**
   * Handles visibility change (tab focus) recovery without excessive requests.
   */
  handleVisibilityRecovery() {
    const now = Date.now();
    // Throttle visibility recovery to at most once every 60 seconds
    if (now - this.lastVisibilitySyncTime < 60000) {
      return;
    }

    const userId = authManager.getCurrentUser()?.id;
    if (!userId || !authManager.isAuthenticated()) {
      return;
    }

    const dirtyCats = this.getDirtyCategories(userId);
    if (dirtyCats.length > 0 && this.isOnline()) {
      this.lastVisibilitySyncTime = now;
      console.log(`👁️ [SyncCoordinator] Tab focused with ${dirtyCats.length} pending categories. Scheduling recovery...`);
      this.scheduleOnlineRecovery();
    }
  }

  /**
   * Executes recovery for pending categories sequentially without creating a sync storm.
   */
  async executeRecovery() {
    const user = authManager.getCurrentUser();
    if (!user || !authManager.isAuthenticated()) {
      return;
    }

    const userId = user.id;
    const dirtyCategories = this.getDirtyCategories(userId);

    if (dirtyCategories.length === 0) {
      console.log('✅ [SyncCoordinator] No pending cloud synchronization needed.');
      this.setNetworkState('online');
      return;
    }

    console.log(`🔄 [SyncCoordinator] Executing recovery for pending categories: [${dirtyCategories.join(', ')}]...`);
    this.setNetworkState('syncing');

    // Import cloud modules dynamically / use globally attached instances
    for (const category of dirtyCategories) {
      // Re-verify auth state hasn't changed during recovery loop
      if (authManager.getCurrentUser()?.id !== userId) {
        console.warn('⚠️ [SyncCoordinator] User session changed during recovery. Aborting previous user recovery.');
        break;
      }

      try {
        switch (category) {
          case 'preferences':
            if (window.preferencesManager) {
              await window.preferencesManager.syncPreferences();
              this.clearCategoryDirty(userId, 'preferences');
            }
            break;
          case 'library':
            if (window.libraryCloud) {
              const res = await window.libraryCloud.syncUserLibrary();
              if (res.success) this.clearCategoryDirty(userId, 'library');
            }
            break;
          case 'playlists':
            if (window.playlistsCloud) {
              const res = await window.playlistsCloud.syncPlaylists();
              if (res.success) this.clearCategoryDirty(userId, 'playlists');
            }
            break;
          case 'stats':
            if (window.statsCloud) {
              await window.statsCloud.reconcileStats();
              this.clearCategoryDirty(userId, 'stats');
            }
            break;
          case 'lyrics':
            if (window.lyricsCloud) {
              const res = await window.lyricsCloud.syncLyrics();
              if (res.success) this.clearCategoryDirty(userId, 'lyrics');
            }
            break;
        }
      } catch (err) {
        console.warn(`⚠️ [SyncCoordinator] Recovery for "${category}" encountered an issue:`, err.message || err);
      }
    }

    this.setNetworkState('online');
    console.log('🏁 [SyncCoordinator] Online recovery sequence completed.');
  }

  /**
   * Handles user sign-out by cancelling in-flight timers and resetting transient sync state.
   */
  handleSignOut() {
    console.log('🔒 [SyncCoordinator] User signed out. Cancelling background sync timers and resetting transient state.');
    this.cancelAllRetryTimers();
    if (this.recoveryDebounceTimer) {
      clearTimeout(this.recoveryDebounceTimer);
      this.recoveryDebounceTimer = null;
    }
    this.inFlightSyncs.clear();
  }
}

export const syncCoordinator = new MusicOSSyncCoordinator();

if (typeof window !== 'undefined') {
  window.syncCoordinator = syncCoordinator;
}
