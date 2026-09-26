/* ==========================================================================
   MUSIC OS - User Library Cloud Manager (public.user_library)
   Manages user-specific library relations, liked tracks sync, and cloud reconciliation.
   ========================================================================== */

import { getSupabase } from './supabase.js';
import { authManager } from './auth.js';
import { songsCloud } from './songs-cloud.js';
import { dataStore } from './data.js';

class MusicOSLibraryCloud {
  constructor() {
    this.isSyncing = false;
  }

  /**
   * Retrieves the authenticated user's ID from active Supabase session.
   * @returns {string | null}
   */
  getAuthenticatedUserId() {
    const user = authManager.getCurrentUser();
    return user?.id || null;
  }

  /**
   * Adds or updates a song in the authenticated user's library.
   * @param {string} songId 
   * @param {boolean} [liked=false] 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async addToUserLibrary(songId, liked = false) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || !songId) {
      return { success: false, error: 'Unauthenticated or invalid parameters' };
    }

    try {
      const record = {
        user_id: userId,
        song_id: String(songId),
        liked: Boolean(liked),
        added_at: new Date().toISOString()
      };

      const { error } = await client
        .from('user_library')
        .upsert(record, { onConflict: 'user_id,song_id' });

      if (error) {
        console.warn('⚠️ [LibraryCloud] Add to library error:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('❌ [LibraryCloud] Add to library exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Removes a song from the authenticated user's library.
   * @param {string} songId 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async removeFromUserLibrary(songId) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || !songId) {
      return { success: false, error: 'Unauthenticated or invalid parameters' };
    }

    try {
      const { error } = await client
        .from('user_library')
        .delete()
        .eq('user_id', userId)
        .eq('song_id', String(songId));

      if (error) {
        console.warn('⚠️ [LibraryCloud] Remove from library error:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('❌ [LibraryCloud] Remove from library exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Updates the liked status of a song in public.user_library for the authenticated user.
   * @param {string} songId 
   * @param {boolean} liked 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async setLiked(songId, liked) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || !songId) {
      return { success: false, error: 'Unauthenticated or invalid parameters' };
    }

    try {
      const record = {
        user_id: userId,
        song_id: String(songId),
        liked: Boolean(liked),
        added_at: new Date().toISOString()
      };

      const { error } = await client
        .from('user_library')
        .upsert(record, { onConflict: 'user_id,song_id' });

      if (error) {
        console.warn('⚠️ [LibraryCloud] setLiked error:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('❌ [LibraryCloud] setLiked exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Retrieves all user_library records for the authenticated user.
   * @returns {Promise<Array<{song_id: string, liked: boolean, added_at: string}>>}
   */
  async getUserLibrary() {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId) {
      return [];
    }

    try {
      const { data, error } = await client
        .from('user_library')
        .select('song_id, liked, added_at')
        .eq('user_id', userId);

      if (error) {
        console.warn('⚠️ [LibraryCloud] getUserLibrary error:', error.message);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('❌ [LibraryCloud] getUserLibrary exception:', err);
      return [];
    }
  }

  /**
   * Retrieves array of song IDs currently in the authenticated user's library.
   * @returns {Promise<Array<string>>}
   */
  async getUserLibrarySongIds() {
    const records = await this.getUserLibrary();
    return records.map(r => r.song_id);
  }

  /**
   * Executes controlled initial synchronization:
   * 1. Batch upserts all local songs from dataStore into public.songs
   * 2. Batch upserts corresponding user_library relations for the authenticated user
   * 3. Reconciles liked states between cloud and local store without data loss
   * @returns {Promise<{success: boolean, songsSynced: number, librarySynced: number}>}
   */
  async syncUserLibrary() {
    if (this.isSyncing) return { success: true, songsSynced: 0, librarySynced: 0 };
    const userId = this.getAuthenticatedUserId();
    const client = getSupabase();

    if (!client || !userId) {
      return { success: false, songsSynced: 0, librarySynced: 0 };
    }

    this.isSyncing = true;
    console.log('🔄 [LibraryCloud] Initiating controlled cloud synchronization for user:', userId);

    try {
      // 1. Read existing local songs from dataStore
      const localSongs = dataStore.getSongs();
      if (!Array.isArray(localSongs) || localSongs.length === 0) {
        this.isSyncing = false;
        return { success: true, songsSynced: 0, librarySynced: 0 };
      }

      // 2. Batch upsert songs into public.songs (Catalog)
      const songsResult = await songsCloud.upsertSongs(localSongs);
      if (!songsResult.success) {
        console.warn('⚠️ [LibraryCloud] Songs catalog sync warning:', songsResult.error);
      }

      // 3. Batch upsert user_library relations
      const libraryRecords = localSongs.map(song => ({
        user_id: userId,
        song_id: String(song.id),
        liked: Boolean(song.liked),
        added_at: new Date().toISOString()
      }));

      const chunkSize = 50;
      let librarySyncedCount = 0;

      for (let i = 0; i < libraryRecords.length; i += chunkSize) {
        const chunk = libraryRecords.slice(i, i + chunkSize);
        const { error } = await client
          .from('user_library')
          .upsert(chunk, { onConflict: 'user_id,song_id' });

        if (error) {
          console.warn(`⚠️ [LibraryCloud] user_library batch upsert chunk error [${i}..${i + chunk.length}]:`, error.message);
        } else {
          librarySyncedCount += chunk.length;
        }
      }

      console.log(`☁️ [LibraryCloud] Synchronized ${librarySyncedCount} tracks to user_library.`);

      // 4. Fetch cloud user_library to reconcile any previously saved cloud likes into local songs
      const cloudLibrary = await this.getUserLibrary();
      if (cloudLibrary && cloudLibrary.length > 0) {
        const cloudLikeMap = new Map(cloudLibrary.map(item => [item.song_id, item.liked]));
        let modified = false;

        localSongs.forEach(s => {
          if (cloudLikeMap.has(String(s.id))) {
            const cloudLiked = cloudLikeMap.get(String(s.id));
            if (s.liked !== cloudLiked) {
              s.liked = cloudLiked;
              modified = true;
            }
          }
        });

        if (modified) {
          dataStore.save();
          if (window.musicOSUI && typeof window.musicOSUI.renderRecentlyPlayed === 'function') {
            window.musicOSUI.renderRecentlyPlayed();
            window.musicOSUI.renderStats();
          }
        }
      }

      return {
        success: true,
        songsSynced: songsResult.count,
        librarySynced: librarySyncedCount
      };
    } catch (err) {
      console.error('❌ [LibraryCloud] Full sync exception:', err);
      return { success: false, songsSynced: 0, librarySynced: 0, error: err.message };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const libraryCloud = new MusicOSLibraryCloud();
export const addToUserLibrary = (id, liked) => libraryCloud.addToUserLibrary(id, liked);
export const removeFromUserLibrary = (id) => libraryCloud.removeFromUserLibrary(id);
export const setLiked = (id, liked) => libraryCloud.setLiked(id, liked);
export const getUserLibrary = () => libraryCloud.getUserLibrary();
export const getUserLibrarySongIds = () => libraryCloud.getUserLibrarySongIds();
export const syncUserLibrary = () => libraryCloud.syncUserLibrary();

if (typeof window !== 'undefined') {
  window.libraryCloud = libraryCloud;
}
