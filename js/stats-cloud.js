/* ==========================================================================
   MUSIC OS - Listening Statistics Cloud Manager (public.listening_stats)
   Periodically synchronizes accumulated listening time with multi-device safety.
   ========================================================================== */

import { getSupabase } from './supabase.js';
import { authManager } from './auth.js';
import { dataStore } from './data.js';

class MusicOSStatsCloud {
  constructor() {
    this.syncIntervalMs = 20000; // Synchronize every 20 seconds of active playback
    this.lastSyncedSeconds = 0;
    this.syncTimer = null;
    this.isSyncing = false;
  }

  getAuthenticatedUserId() {
    const user = authManager.getCurrentUser();
    return user?.id || null;
  }

  /**
   * Fetches the listening_stats record for the authenticated user.
   * @returns {Promise<{user_id: string, listening_seconds: number, updated_at: string} | null>}
   */
  async getListeningStats() {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId) return null;

    try {
      const { data, error } = await client
        .from('listening_stats')
        .select('user_id, listening_seconds, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('⚠️ [StatsCloud] getListeningStats error:', error.message);
        return null;
      }

      return data;
    } catch (err) {
      console.error('❌ [StatsCloud] getListeningStats exception:', err);
      return null;
    }
  }

  /**
   * Upserts the current listening seconds into public.listening_stats for the authenticated user.
   * @param {number} totalSeconds 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async syncListeningStats(totalSeconds) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || typeof totalSeconds !== 'number') {
      return { success: false, error: 'Unauthenticated or invalid parameters' };
    }

    try {
      const record = {
        user_id: userId,
        listening_seconds: Math.round(totalSeconds),
        updated_at: new Date().toISOString()
      };

      const { error } = await client
        .from('listening_stats')
        .upsert(record, { onConflict: 'user_id' });

      if (error) {
        console.warn('⚠️ [StatsCloud] syncListeningStats error:', error.message);
        return { success: false, error: error.message };
      }

      this.lastSyncedSeconds = totalSeconds;
      return { success: true };
    } catch (err) {
      console.error('❌ [StatsCloud] syncListeningStats exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Reconciles cloud statistics with local storage upon login using a safe max-merge strategy.
   * Ensures stats from another device are never lost.
   */
  async reconcileStats() {
    const userId = this.getAuthenticatedUserId();
    if (!userId) return;

    try {
      const cloudRecord = await this.getListeningStats();
      const localSeconds = dataStore.listeningSeconds || 0;

      if (cloudRecord && typeof cloudRecord.listening_seconds === 'number') {
        const cloudSeconds = cloudRecord.listening_seconds;
        // Merge strategy: choose the higher value so neither device loses progress
        const mergedSeconds = Math.max(localSeconds, cloudSeconds);
        dataStore.listeningSeconds = mergedSeconds;
        localStorage.setItem("music_os_listening_seconds", mergedSeconds.toString());
        this.lastSyncedSeconds = mergedSeconds;

        if (mergedSeconds > cloudSeconds) {
          await this.syncListeningStats(mergedSeconds);
        }

        if (window.musicOSUI && typeof window.musicOSUI.renderStats === 'function') {
          window.musicOSUI.renderStats();
        }
      } else {
        // Initial setup for user with no listening_stats row
        await this.syncListeningStats(localSeconds);
      }
    } catch (err) {
      console.error('❌ [StatsCloud] reconcileStats exception:', err);
    }
  }

  /**
   * Debounced listener tick: schedules periodic synchronization while playing.
   */
  onListeningTick() {
    if (!authManager.isAuthenticated()) return;

    if (!this.syncTimer) {
      this.syncTimer = setTimeout(async () => {
        this.syncTimer = null;
        const currentSeconds = dataStore.listeningSeconds || 0;
        if (Math.abs(currentSeconds - this.lastSyncedSeconds) >= 10) {
          await this.syncListeningStats(currentSeconds);
        }
      }, this.syncIntervalMs);
    }
  }

  /**
   * Immediately flushes unsynced listening seconds (e.g. on pause or track change).
   */
  async flush() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    if (authManager.isAuthenticated()) {
      const currentSeconds = dataStore.listeningSeconds || 0;
      if (Math.abs(currentSeconds - this.lastSyncedSeconds) >= 3) {
        await this.syncListeningStats(currentSeconds);
      }
    }
  }
}

export const statsCloud = new MusicOSStatsCloud();
export const getListeningStats = () => statsCloud.getListeningStats();
export const syncListeningStats = (s) => statsCloud.syncListeningStats(s);
export const reconcileStats = () => statsCloud.reconcileStats();

if (typeof window !== 'undefined') {
  window.statsCloud = statsCloud;
}
