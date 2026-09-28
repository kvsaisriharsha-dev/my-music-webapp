/* ==========================================================================
   MUSIC OS - Sync Observability & Reliability Coordinator (Stage 9)
   Centralizes network state, structured observability model, per-category
   status tracking, transient error classification, exponential backoff retries,
   user-scoped persistent dirty state, and coordinated online recovery.
   ========================================================================== */

import { authManager } from './auth.js';

const SYNC_STATE_STORAGE_KEY = 'music_os_sync_state';
const KNOWN_CATEGORIES = ['preferences', 'library', 'playlists', 'stats', 'lyrics'];

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
    this.statusListeners = new Set();

    // Active retry metadata for observability
    this.currentRetryCategory = null;
    this.currentRetryAttempt = 0;
    this.maxRetryAttempts = 3;
    this.lastError = null;

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
      this.scheduleOnlineRecovery('online_event');
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
      this.notifyStatusListeners();
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

  onSyncStatusChange(callback) {
    if (typeof callback === 'function') {
      this.statusListeners.add(callback);
      callback(this.getSyncStatus());
    }
    return () => this.statusListeners.delete(callback);
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

  notifyStatusListeners() {
    const status = this.getSyncStatus();
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[SyncCoordinator] Status listener error:', err);
      }
    }
  }

  // ==========================================================================
  // ERROR CLASSIFICATION & NORMALIZATION
  // ==========================================================================

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
    if (!err) return status === 0;
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
   * Normalizes an error into a structured, safe observability object.
   * Never exposes sensitive tokens, authorization headers, or keys.
   * @param {any} err 
   * @param {number} [status=0] 
   * @returns {{type: string, status: number|null, message: string} | null}
   */
  normalizeError(err, status = 0) {
    if (!err && !status) return null;

    let rawMsg = '';
    let code = '';
    let name = '';

    if (typeof err === 'string') {
      rawMsg = err;
    } else if (err && typeof err === 'object') {
      rawMsg = err.message || (typeof err.error === 'string' ? err.error : JSON.stringify(err));
      code = err.code || '';
      name = err.name || '';
      if (!status && typeof err.status === 'number') {
        status = err.status;
      }
    }

    const lowerMsg = rawMsg.toLowerCase();
    let type = 'unknown';

    if (status === 401 || lowerMsg.includes('jwt') || lowerMsg.includes('unauthenticated')) {
      type = 'authentication';
    } else if (status === 403 || code === '42501' || lowerMsg.includes('row-level security') || lowerMsg.includes('unauthorized') || lowerMsg.includes('permission denied')) {
      type = 'authorization';
    } else if (status === 409 || code === '23505' || lowerMsg.includes('conflict') || lowerMsg.includes('already exists')) {
      type = 'conflict';
    } else if (code === 'PGRST204' || code === '23503' || lowerMsg.includes('schema') || lowerMsg.includes('column') || lowerMsg.includes('foreign key')) {
      type = 'schema';
    } else if (status === 400 || status === 422 || lowerMsg.includes('invalid') || lowerMsg.includes('validation')) {
      type = 'validation';
    } else if (status >= 500 && status <= 599) {
      type = 'server';
    } else if (status === 408 || lowerMsg.includes('timeout') || name === 'AbortError') {
      type = 'timeout';
    } else if (
      status === 0 ||
      lowerMsg.includes('fetch') ||
      lowerMsg.includes('network') ||
      lowerMsg.includes('failed to fetch') ||
      lowerMsg.includes('connection') ||
      lowerMsg.includes('econnrefused') ||
      lowerMsg.includes('ehostunreach') ||
      name === 'TypeError'
    ) {
      type = 'network';
    }

    // Sanitize message to strip any tokens or credentials
    const cleanMsg = rawMsg
      .replace(/bearer\s+[A-Za-z0-9-_.]+/gi, 'Bearer [REDACTED]')
      .replace(/apikey=[A-Za-z0-9-_.]+/gi, 'apikey=[REDACTED]');

    return {
      type,
      status: status || null,
      message: cleanMsg || `Encountered ${type} error`
    };
  }

  // ==========================================================================
  // RETRY ENGINE & RESILIENCE
  // ==========================================================================

  /**
   * Wraps an asynchronous cloud operation with timeout safety, exponential backoff retries,
   * and structured result normalization.
   * @param {string} category Logical sync category (e.g. 'playlists', 'library')
   * @param {Function} taskFn Function returning a Promise
   * @param {object} [options]
   * @param {number} [options.maxAttempts=3]
   * @param {number} [options.timeoutMs=12000]
   * @param {number} [options.initialDelayMs=1000]
   * @param {string} [options.userId=null]
   * @returns {Promise<{success: boolean, category: string, attempts: number, durationMs: number, data?: any, error: object|null, wasRetried?: boolean}>}
   */
  async executeWithRetry(category, taskFn, options = {}) {
    const startTime = Date.now();
    const maxAttempts = options.maxAttempts ?? 3;
    const timeoutMs = options.timeoutMs ?? 12000;
    const initialDelayMs = options.initialDelayMs ?? 1000;
    const userId = options.userId || authManager.getCurrentUser()?.id || null;

    this.maxRetryAttempts = maxAttempts;
    let attempt = 0;
    let lastError = null;
    let lastStatus = 0;

    if (userId) {
      this.setCategoryStatus(userId, category, 'syncing');
    }

    while (attempt < maxAttempts) {
      attempt++;
      this.currentRetryCategory = category;
      this.currentRetryAttempt = attempt;

      // Check offline status before network dispatch
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.setNetworkState('offline');
        const normalizedErr = this.normalizeError('Device is offline. Task marked for online recovery.', 0);
        if (userId) {
          this.setCategoryStatus(userId, category, 'pending', { error: normalizedErr });
          this.markCategoryDirty(userId, category);
        }
        this.resetRetryState();
        return {
          success: false,
          category,
          attempts: attempt,
          durationMs: Date.now() - startTime,
          error: normalizedErr
        };
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

        // Check if task returned a failure object
        if (result && typeof result === 'object' && result.success === false && result.error) {
          lastError = result.error;
          lastStatus = result.status || 0;

          if (!this.isTransientError(result.error, lastStatus)) {
            const normalizedErr = this.normalizeError(result.error, lastStatus);
            console.warn(`🛑 [SyncCoordinator] Permanent failure in "${category}" (${normalizedErr.type}): ${normalizedErr.message}. Not retrying.`);
            if (userId) {
              this.setCategoryStatus(userId, category, 'failed', { error: normalizedErr, retryCount: attempt });
            }
            this.lastError = normalizedErr;
            this.resetRetryState();
            return {
              success: false,
              category,
              attempts: attempt,
              durationMs: Date.now() - startTime,
              error: normalizedErr,
              data: result
            };
          }
        } else {
          // Success! Clear dirty and mark synced
          const durationMs = Date.now() - startTime;
          if (userId) {
            this.setCategoryStatus(userId, category, 'synced', { error: null, retryCount: 0 });
            this.clearCategoryDirty(userId, category);
            this.updateLastSuccessfulSyncAt(userId);
          }
          this.lastError = null;
          this.resetRetryState();
          return {
            success: true,
            category,
            attempts: attempt,
            durationMs,
            data: result,
            error: null
          };
        }
      } catch (err) {
        lastError = err;
        lastStatus = err.status || 0;

        if (!this.isTransientError(err, lastStatus)) {
          const normalizedErr = this.normalizeError(err, lastStatus);
          console.warn(`🛑 [SyncCoordinator] Non-transient error in "${category}" (${normalizedErr.type}): ${normalizedErr.message}. Not retrying.`);
          if (userId) {
            this.setCategoryStatus(userId, category, 'failed', { error: normalizedErr, retryCount: attempt });
          }
          this.lastError = normalizedErr;
          this.resetRetryState();
          return {
            success: false,
            category,
            attempts: attempt,
            durationMs: Date.now() - startTime,
            error: normalizedErr
          };
        }
      }

      // If transient error occurred, apply exponential backoff with jitter
      if (attempt < maxAttempts) {
        this.setNetworkState('degraded');
        const jitter = Math.random() * 400;
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1) + jitter, 10000);

        console.log(`⏳ [SyncCoordinator] Transient issue in "${category}" (attempt ${attempt}/${maxAttempts}). Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted
    const normalizedErr = this.normalizeError(lastError || 'Max retries exhausted for transient error.', lastStatus);
    console.warn(`⚠️ [SyncCoordinator] All ${maxAttempts} retries exhausted for "${category}". Marking category as pending.`);
    if (userId) {
      this.setCategoryStatus(userId, category, 'failed', { error: normalizedErr, retryCount: maxAttempts });
      this.markCategoryDirty(userId, category);
    }
    this.lastError = normalizedErr;
    this.resetRetryState();
    return {
      success: false,
      category,
      attempts: maxAttempts,
      durationMs: Date.now() - startTime,
      error: normalizedErr,
      wasRetried: true
    };
  }

  resetRetryState() {
    this.currentRetryCategory = null;
    this.currentRetryAttempt = 0;
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
        this.notifyStatusListeners();
      }
    })();

    this.inFlightSyncs.set(category, promise);
    this.notifyStatusListeners();
    return promise;
  }

  // ==========================================================================
  // USER-SCOPED PERSISTENCE & OBSERVABILITY STATE
  // ==========================================================================

  getStorageState() {
    try {
      if (typeof localStorage === 'undefined') return {};
      const raw = localStorage.getItem(SYNC_STATE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  saveStorageState(state) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SYNC_STATE_STORAGE_KEY, JSON.stringify(state));
      this.notifyStatusListeners();
    } catch (err) {
      console.warn('⚠️ [SyncCoordinator] Error saving sync state:', err);
    }
  }

  /**
   * Normalizes and retrieves user-scoped state with full backward compatibility.
   * @param {string} userId 
   * @returns {object}
   */
  getUserState(userId) {
    if (!userId) return this.createDefaultUserState();
    const allState = this.getStorageState();
    const rawUserState = allState[userId];

    if (!rawUserState || typeof rawUserState !== 'object') {
      return this.createDefaultUserState();
    }

    // Handle backward compatibility with Stage 8 format { playlists: true }
    if (typeof rawUserState.dirty === 'undefined' && typeof rawUserState.categories === 'undefined') {
      const defaultState = this.createDefaultUserState();
      for (const cat of KNOWN_CATEGORIES) {
        if (rawUserState[cat] === true) {
          defaultState.dirty[cat] = true;
          defaultState.categories[cat].status = 'pending';
        }
      }
      return defaultState;
    }

    // Ensure all standard fields exist
    const userState = {
      dirty: { ...(rawUserState.dirty || {}) },
      lastSuccessfulSyncAt: rawUserState.lastSuccessfulSyncAt || null,
      categories: { ...(rawUserState.categories || {}) }
    };

    for (const cat of KNOWN_CATEGORIES) {
      if (!userState.categories[cat]) {
        userState.categories[cat] = {
          status: userState.dirty[cat] ? 'pending' : 'idle',
          lastSuccessAt: null,
          lastAttemptAt: null,
          lastError: null,
          retryCount: 0
        };
      }
    }

    return userState;
  }

  saveUserState(userId, userState) {
    if (!userId) return;
    const allState = this.getStorageState();
    allState[userId] = userState;
    this.saveStorageState(allState);
  }

  createDefaultUserState() {
    const dirty = {};
    const categories = {};
    for (const cat of KNOWN_CATEGORIES) {
      dirty[cat] = false;
      categories[cat] = {
        status: 'idle',
        lastSuccessAt: null,
        lastAttemptAt: null,
        lastError: null,
        retryCount: 0
      };
    }
    return {
      dirty,
      lastSuccessfulSyncAt: null,
      categories
    };
  }

  markCategoryDirty(userId, category) {
    if (!userId || !category) return;
    const userState = this.getUserState(userId);
    userState.dirty[category] = true;
    if (userState.categories[category]) {
      if (userState.categories[category].status !== 'failed') {
        userState.categories[category].status = 'pending';
      }
    }
    this.saveUserState(userId, userState);
    console.log(`📌 [SyncCoordinator] Marked "${category}" as pending for user: ${userId}`);
  }

  clearCategoryDirty(userId, category) {
    if (!userId || !category) return;
    const userState = this.getUserState(userId);
    if (userState.dirty[category]) {
      userState.dirty[category] = false;
    }
    this.saveUserState(userId, userState);
    console.log(`✨ [SyncCoordinator] Cleared pending status for "${category}".`);
  }

  setCategoryStatus(userId, category, status, meta = {}) {
    if (!userId || !category) return;
    const userState = this.getUserState(userId);
    if (!userState.categories[category]) {
      userState.categories[category] = {
        status: 'idle',
        lastSuccessAt: null,
        lastAttemptAt: null,
        lastError: null,
        retryCount: 0
      };
    }

    const catObj = userState.categories[category];
    catObj.status = status;
    catObj.lastAttemptAt = new Date().toISOString();

    if (status === 'synced') {
      catObj.lastSuccessAt = catObj.lastAttemptAt;
      catObj.lastError = null;
      catObj.retryCount = 0;
    } else if (status === 'failed') {
      if (meta.error) catObj.lastError = meta.error;
      if (typeof meta.retryCount === 'number') catObj.retryCount = meta.retryCount;
    }

    this.saveUserState(userId, userState);
  }

  updateLastSuccessfulSyncAt(userId) {
    if (!userId) return;
    const userState = this.getUserState(userId);
    userState.lastSuccessfulSyncAt = new Date().toISOString();
    this.saveUserState(userId, userState);
  }

  getDirtyCategories(userId) {
    if (!userId) return [];
    const userState = this.getUserState(userId);
    return Object.keys(userState.dirty).filter(cat => userState.dirty[cat] === true);
  }

  getFailedCategories(userId) {
    if (!userId) return [];
    const userState = this.getUserState(userId);
    return Object.keys(userState.categories).filter(cat => userState.categories[cat].status === 'failed');
  }

  clearUserTransientState(userId) {
    if (!userId) return;
    const allState = this.getStorageState();
    delete allState[userId];
    this.saveStorageState(allState);
  }

  cancelAllRetryTimers() {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
  }

  // ==========================================================================
  // STRUCTURED OBSERVABILITY SNAPSHOT
  // ==========================================================================

  /**
   * Returns a complete, user-scoped diagnostic snapshot of the synchronization system.
   * @returns {object}
   */
  getSyncStatus() {
    const user = authManager.getCurrentUser();
    const userId = user?.id || null;
    const userState = this.getUserState(userId);

    const syncingCategories = Array.from(this.inFlightSyncs.keys());
    const pendingCategories = this.getDirtyCategories(userId);
    const failedCategories = this.getFailedCategories(userId);

    return {
      networkState: this.networkState,
      userId: userId,
      lastSuccessfulSyncAt: userState.lastSuccessfulSyncAt,
      syncingCategories,
      pendingCategories,
      failedCategories,
      lastError: this.lastError,
      retry: {
        category: this.currentRetryCategory,
        attempt: this.currentRetryAttempt,
        maxAttempts: this.maxRetryAttempts
      },
      categories: { ...userState.categories }
    };
  }

  // ==========================================================================
  // ONLINE RECOVERY COORDINATION
  // ==========================================================================

  /**
   * Schedules debounced online recovery sync when connection is restored.
   * @param {string} [reason='online_event']
   */
  scheduleOnlineRecovery(reason = 'online_event') {
    if (this.recoveryDebounceTimer) {
      clearTimeout(this.recoveryDebounceTimer);
    }

    // Wait 1500ms for connection stabilization
    this.recoveryDebounceTimer = setTimeout(async () => {
      this.recoveryDebounceTimer = null;
      await this.executeRecovery(reason);
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
      this.scheduleOnlineRecovery('visibility_change');
    }
  }

  /**
   * Executes recovery for pending categories sequentially without creating a sync storm.
   * @param {string} [reason='unknown']
   */
  async executeRecovery(reason = 'unknown') {
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

    console.log(`🔄 [SyncCoordinator] Executing recovery (reason: ${reason}) for pending categories: [${dirtyCategories.join(', ')}]...`);
    this.setNetworkState('syncing');

    // Sequential recovery: preferences → library → playlists → stats → lyrics
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
              this.setCategoryStatus(userId, 'preferences', 'synced');
            }
            break;
          case 'library':
            if (window.libraryCloud) {
              const res = await window.libraryCloud.syncUserLibrary();
              if (res.success) {
                this.clearCategoryDirty(userId, 'library');
                this.setCategoryStatus(userId, 'library', 'synced');
              } else {
                this.setCategoryStatus(userId, 'library', 'failed', { error: this.normalizeError(res.error) });
              }
            }
            break;
          case 'playlists':
            if (window.playlistsCloud) {
              const res = await window.playlistsCloud.syncPlaylists();
              if (res.success) {
                this.clearCategoryDirty(userId, 'playlists');
                this.setCategoryStatus(userId, 'playlists', 'synced');
              } else {
                this.setCategoryStatus(userId, 'playlists', 'failed', { error: this.normalizeError(res.error) });
              }
            }
            break;
          case 'stats':
            if (window.statsCloud) {
              await window.statsCloud.reconcileStats();
              this.clearCategoryDirty(userId, 'stats');
              this.setCategoryStatus(userId, 'stats', 'synced');
            }
            break;
          case 'lyrics':
            if (window.lyricsCloud) {
              const res = await window.lyricsCloud.syncLyrics();
              if (res.success) {
                this.clearCategoryDirty(userId, 'lyrics');
                this.setCategoryStatus(userId, 'lyrics', 'synced');
              } else {
                this.setCategoryStatus(userId, 'lyrics', 'failed', { error: this.normalizeError(res.error) });
              }
            }
            break;
        }
      } catch (err) {
        console.warn(`⚠️ [SyncCoordinator] Recovery for "${category}" encountered an issue:`, err.message || err);
        this.setCategoryStatus(userId, category, 'failed', { error: this.normalizeError(err) });
      }
    }

    const remainingDirty = this.getDirtyCategories(userId);
    if (remainingDirty.length === 0) {
      this.updateLastSuccessfulSyncAt(userId);
      this.setNetworkState('online');
      console.log('🏁 [SyncCoordinator] All pending categories synchronized successfully.');
    } else {
      this.setNetworkState('degraded');
      console.warn(`⚠️ [SyncCoordinator] Recovery sequence finished. Remaining pending categories: [${remainingDirty.join(', ')}].`);
    }
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
    this.resetRetryState();
    this.lastError = null;
    this.notifyStatusListeners();
  }
}

export const syncCoordinator = new MusicOSSyncCoordinator();

if (typeof window !== 'undefined') {
  window.syncCoordinator = syncCoordinator;
}
