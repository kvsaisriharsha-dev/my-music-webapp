/* ==========================================================================
   MUSIC OS - Playback History Cloud Manager (public.recently_played)
   Records meaningful song playback events to Supabase with deduplication.
   ========================================================================== */

import { getSupabase } from './supabase.js';
import { authManager } from './auth.js';

class MusicOSHistoryCloud {
  constructor() {
    this.lastRecordedSongId = null;
    this.lastRecordedTimestamp = 0;
    this.dedupThresholdMs = 15000; // 15 seconds debounce between same-track recordings
  }

  getAuthenticatedUserId() {
    const user = authManager.getCurrentUser();
    return user?.id || null;
  }

  /**
   * Records a playback event to public.recently_played for the authenticated user.
   * Debounces duplicate plays within a short window.
   * @param {string} songId 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async recordPlay(songId) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || !songId) {
      return { success: false, error: 'Unauthenticated or invalid songId' };
    }

    const now = Date.now();
    if (this.lastRecordedSongId === String(songId) && (now - this.lastRecordedTimestamp) < this.dedupThresholdMs) {
      return { success: true, deduped: true };
    }

    this.lastRecordedSongId = String(songId);
    this.lastRecordedTimestamp = now;

    try {
      const record = {
        user_id: userId,
        song_id: String(songId),
        played_at: new Date().toISOString()
      };

      const { error } = await client
        .from('recently_played')
        .insert(record);

      if (error) {
        console.warn('⚠️ [HistoryCloud] Error recording play:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('❌ [HistoryCloud] recordPlay exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Retrieves the authenticated user's recent playback history, newest first.
   * @param {number} [limit=20] 
   * @returns {Promise<Array<{id: string, song_id: string, played_at: string}>>}
   */
  async getRecentlyPlayed(limit = 20) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId) return [];

    try {
      const { data, error } = await client
        .from('recently_played')
        .select('id, song_id, played_at')
        .eq('user_id', userId)
        .order('played_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('⚠️ [HistoryCloud] getRecentlyPlayed error:', error.message);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('❌ [HistoryCloud] getRecentlyPlayed exception:', err);
      return [];
    }
  }
}

export const historyCloud = new MusicOSHistoryCloud();
export const recordPlay = (id) => historyCloud.recordPlay(id);
export const getRecentlyPlayed = (lim) => historyCloud.getRecentlyPlayed(lim);

if (typeof window !== 'undefined') {
  window.historyCloud = historyCloud;
}
