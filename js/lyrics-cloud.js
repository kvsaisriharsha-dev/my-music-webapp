/* ==========================================================================
   MUSIC OS - Synchronized Lyrics Cloud Manager (public.lyrics)
   Manages global song lyrics synchronization, retrieval, and validation.
   ========================================================================== */

import { getSupabase } from './supabase.js';
import { authManager } from './auth.js';
import { dataStore } from './data.js';

/**
 * Validates and normalizes an array of timestamped synchronized lyrics lines.
 * @param {Array<object>} lines 
 * @returns {Array<{time: number, text: string}> | null}
 */
export function validateSynchronizedLyrics(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;

  const validLines = [];
  for (const item of lines) {
    if (!item || typeof item !== 'object') continue;
    const time = typeof item.time === 'number' ? item.time : parseFloat(item.time);
    const text = typeof item.text === 'string' ? item.text.trim() : '';

    if (!isNaN(time) && time >= 0 && text) {
      validLines.push({ time, text });
    }
  }

  if (validLines.length === 0) return null;

  // Ensure chronological order
  validLines.sort((a, b) => a.time - b.time);
  return validLines;
}

class MusicOSLyricsCloud {
  constructor() {
    this.lyricsCache = new Map();
    this.isSyncing = false;
  }

  /**
   * Upserts synchronized lyrics for a song into public.lyrics.
   * @param {string} songId 
   * @param {Array<{time: number, text: string}>} lines 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async upsertLyrics(songId, lines) {
    const client = getSupabase();
    if (!client || !songId) {
      return { success: false, error: 'Supabase client unavailable or missing songId' };
    }

    const validated = validateSynchronizedLyrics(lines);
    if (!validated) {
      return { success: false, error: 'Invalid or empty synchronized lyrics structure' };
    }

    try {
      const record = {
        song_id: String(songId),
        lines: validated,
        updated_at: new Date().toISOString()
      };

      const { error } = await client
        .from('lyrics')
        .upsert(record, { onConflict: 'song_id' });

      if (error) {
        console.warn('⚠️ [LyricsCloud] upsertLyrics error:', error.message);
        return { success: false, error: error.message };
      }

      this.lyricsCache.set(String(songId), validated);
      return { success: true };
    } catch (err) {
      console.error('❌ [LyricsCloud] upsertLyrics exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetches synchronized lyrics for a specific song by ID.
   * @param {string} songId 
   * @returns {Promise<Array<{time: number, text: string}> | null>}
   */
  async getLyrics(songId) {
    if (!songId) return null;

    // Check memory cache
    if (this.lyricsCache.has(String(songId))) {
      return this.lyricsCache.get(String(songId));
    }

    const client = getSupabase();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('lyrics')
        .select('song_id, lines')
        .eq('song_id', String(songId))
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      const validated = validateSynchronizedLyrics(data.lines);
      if (validated) {
        this.lyricsCache.set(String(songId), validated);
      }
      return validated;
    } catch (err) {
      console.error('❌ [LyricsCloud] getLyrics exception:', err);
      return null;
    }
  }

  /**
   * Batch fetches lyrics for multiple songs.
   * @param {Array<string>} songIds 
   * @returns {Promise<Map<string, Array<{time: number, text: string}>>>}
   */
  async getLyricsForSongs(songIds) {
    const results = new Map();
    if (!Array.isArray(songIds) || songIds.length === 0) return results;

    const client = getSupabase();
    if (!client) return results;

    try {
      const cleanIds = songIds.map(String);
      const { data, error } = await client
        .from('lyrics')
        .select('song_id, lines')
        .in('song_id', cleanIds);

      if (error || !Array.isArray(data)) return results;

      data.forEach(row => {
        const validated = validateSynchronizedLyrics(row.lines);
        if (validated) {
          results.set(row.song_id, validated);
          this.lyricsCache.set(row.song_id, validated);
        }
      });

      return results;
    } catch (err) {
      console.error('❌ [LyricsCloud] getLyricsForSongs exception:', err);
      return results;
    }
  }

  /**
   * Synchronizes all local songs with valid lyrics to public.lyrics.
   * @returns {Promise<{success: boolean, lyricsSynced: number}>}
   */
  async syncLyrics() {
    if (this.isSyncing) return { success: true, lyricsSynced: 0 };
    const client = getSupabase();

    if (!client || !authManager.isAuthenticated()) {
      return { success: false, lyricsSynced: 0 };
    }

    this.isSyncing = true;
    console.log('🔄 [LyricsCloud] Synchronizing local synchronized lyrics to public.lyrics...');

    try {
      const allSongs = dataStore.getSongs();
      const songsWithLyrics = allSongs.filter(s => s && validateSynchronizedLyrics(s.lyrics));

      if (songsWithLyrics.length === 0) {
        this.isSyncing = false;
        return { success: true, lyricsSynced: 0 };
      }

      const records = songsWithLyrics.map(s => ({
        song_id: String(s.id),
        lines: validateSynchronizedLyrics(s.lyrics),
        updated_at: new Date().toISOString()
      }));

      const chunkSize = 25;
      let lyricsSyncedCount = 0;

      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await client
          .from('lyrics')
          .upsert(chunk, { onConflict: 'song_id' });

        if (error) {
          console.warn(`⚠️ [LyricsCloud] Batch lyrics upsert chunk error [${i}..${i + chunk.length}]:`, error.message);
        } else {
          lyricsSyncedCount += chunk.length;
        }
      }

      console.log(`☁️ [LyricsCloud] Synchronized ${lyricsSyncedCount} lyrics records to Supabase.`);
      return { success: true, lyricsSynced: lyricsSyncedCount };
    } catch (err) {
      console.error('❌ [LyricsCloud] syncLyrics exception:', err);
      return { success: false, lyricsSynced: 0, error: err.message };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Lazy-loads cloud lyrics for a track if its local lyrics are missing.
   * Does NOT replace valid local lyrics.
   * @param {object} track 
   */
  async loadLyricsForTrack(track) {
    if (!track || !track.id) return;
    if (validateSynchronizedLyrics(track.lyrics)) return; // Already has valid local lyrics

    if (!authManager.isAuthenticated()) return;

    try {
      const cloudLines = await this.getLyrics(track.id);
      if (cloudLines && validateSynchronizedLyrics(cloudLines)) {
        track.lyrics = cloudLines;
        console.log(`✨ [LyricsCloud] Retrieved and applied cloud lyrics for "${track.title}"`);
        if (window.musicOSUI) {
          window.musicOSUI.renderLyrics();
          window.musicOSUI.renderFloatingLyrics();
        }
      }
    } catch (err) {
      console.debug('[LyricsCloud Lazy Load]', err);
    }
  }
}

export const lyricsCloud = new MusicOSLyricsCloud();
export const upsertLyrics = (sId, lines) => lyricsCloud.upsertLyrics(sId, lines);
export const getLyrics = (sId) => lyricsCloud.getLyrics(sId);
export const getLyricsForSongs = (sIds) => lyricsCloud.getLyricsForSongs(sIds);
export const syncLyrics = () => lyricsCloud.syncLyrics();

if (typeof window !== 'undefined') {
  window.lyricsCloud = lyricsCloud;
}
