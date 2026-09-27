/* ==========================================================================
   MUSIC OS - Supabase Playlists & Playlist Songs Manager
   Synchronizes user-owned playlists and many-to-many playlist-song relations
   with user-scoped cloud ID mapping for multi-user isolation.
   ========================================================================== */

import { getSupabase } from './supabase.js';
import { authManager } from './auth.js';
import { songsCloud } from './songs-cloud.js';
import { dataStore } from './data.js';
import { playlistCloudIds } from './playlist-cloud-ids.js';
import { syncCoordinator } from './sync-coordinator.js';

/**
 * Transforms a local playlist object into a row for public.playlists using the mapped cloud ID.
 * @param {object} pl 
 * @param {string} userId 
 * @returns {object}
 */
export function mapPlaylistToDb(pl, userId) {
  if (!pl || !userId) return null;
  const cloudId = playlistCloudIds.resolveCloudId(userId, pl.id);
  return {
    id: String(cloudId),
    user_id: userId,
    name: pl.name || 'Untitled Playlist',
    category: pl.category || 'Custom',
    icon: pl.icon || 'music',
    gradient: pl.gradient || 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
    is_favorite: Boolean(pl.isFavorite),
    updated_at: new Date().toISOString()
  };
}

/**
 * Transforms a database row and associated song IDs into a local playlist object.
 * @param {object} row 
 * @param {Array<string>} [songIds=[]] 
 * @param {string} [userId=null]
 * @returns {object}
 */
export function mapDbToPlaylist(row, songIds = [], userId = null) {
  if (!row) return null;
  const localId = userId ? playlistCloudIds.getLocalId(userId, row.id) : row.id;
  return {
    id: localId,
    name: row.name || 'Untitled Playlist',
    count: songIds.length || 0,
    icon: row.icon || 'music',
    gradient: row.gradient || 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
    category: row.category || 'Custom',
    isFavorite: Boolean(row.is_favorite),
    songIds: [...songIds]
  };
}

class MusicOSPlaylistsCloud {
  constructor() {
    this.isSyncing = false;
  }

  /**
   * Retrieves the authenticated user's ID from the active Supabase session.
   * @returns {string | null}
   */
  getAuthenticatedUserId() {
    const user = authManager.getCurrentUser();
    return user?.id || null;
  }

  /**
   * Upserts a single playlist and its associated playlist_songs relations into Supabase.
   * @param {object} playlist 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async upsertPlaylist(playlist) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || !playlist) {
      return { success: false, error: 'Unauthenticated or invalid playlist' };
    }

    const record = mapPlaylistToDb(playlist, userId);
    try {
      // 1. Upsert playlist metadata using user-scoped cloud ID
      const { error: plError } = await client
        .from('playlists')
        .upsert(record, { onConflict: 'id' });

      if (plError) {
        console.warn('⚠️ [PlaylistsCloud] Upsert playlist error:', plError.message);
        return { success: false, error: plError.message };
      }

      // 2. Synchronize song relationships if songIds are present
      if (Array.isArray(playlist.songIds)) {
        await this.syncPlaylistSongs(playlist.id, playlist.songIds);
      }

      return { success: true };
    } catch (err) {
      console.error('❌ [PlaylistsCloud] Upsert playlist exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Batch upserts playlists and their song relations.
   * @param {Array<object>} playlists 
   * @returns {Promise<{success: boolean, count: number, error?: string}>}
   */
  async upsertPlaylists(playlists) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || !Array.isArray(playlists) || playlists.length === 0) {
      return { success: true, count: 0 };
    }

    const records = playlists.map(pl => mapPlaylistToDb(pl, userId)).filter(Boolean);
    try {
      const { error } = await client
        .from('playlists')
        .upsert(records, { onConflict: 'id' });

      if (error) {
        console.warn('⚠️ [PlaylistsCloud] Batch playlists upsert error:', error.message);
        return { success: false, count: 0, error: error.message };
      }

      // Upsert songs for all playlists in batch
      for (const pl of playlists) {
        if (Array.isArray(pl.songIds) && pl.songIds.length > 0) {
          await this.syncPlaylistSongs(pl.id, pl.songIds);
        }
      }

      return { success: true, count: records.length };
    } catch (err) {
      console.error('❌ [PlaylistsCloud] Batch playlists exception:', err);
      return { success: false, count: 0, error: err.message };
    }
  }

  /**
   * Replaces/Synchronizes playlist_songs relationships for a specific playlist preserving exact positions.
   * @param {string} playlistId (local ID)
   * @param {Array<string>} songIds 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async syncPlaylistSongs(playlistId, songIds) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || !playlistId || !Array.isArray(songIds)) {
      return { success: false, error: 'Invalid parameters' };
    }

    const cloudId = playlistCloudIds.resolveCloudId(userId, playlistId);

    try {
      // 1. Delete existing relations for this cloud playlist
      await client
        .from('playlist_songs')
        .delete()
        .eq('playlist_id', String(cloudId));

      if (songIds.length === 0) return { success: true };

      // Query which songIds exist in public.songs to avoid 23503 foreign key violation
      let validSongIds = songIds;
      try {
        const { data: existingSongs } = await client
          .from('songs')
          .select('id')
          .in('id', songIds.map(String));
        const existingSet = new Set((existingSongs || []).map(r => r.id));
        validSongIds = songIds.filter(id => existingSet.has(String(id)));
      } catch (e) {
        // Continue with original list if check fails
      }

      if (validSongIds.length === 0) {
        console.warn(`⚠️ [PlaylistsCloud] Songs for playlist "${playlistId}" are not in public.songs catalog yet. Skipping playlist_songs write.`);
        return { success: true };
      }

      // 2. Prepare new ordered records using cloud ID
      const relations = validSongIds.map((songId, index) => ({
        playlist_id: String(cloudId),
        song_id: String(songId),
        position: index,
        added_at: new Date().toISOString()
      }));

      // 3. Batch insert new relations
      const { error } = await client
        .from('playlist_songs')
        .insert(relations);

      if (error) {
        console.warn(`⚠️ [PlaylistsCloud] Error inserting playlist_songs for ${playlistId} (${cloudId}):`, error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('❌ [PlaylistsCloud] syncPlaylistSongs exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Adds a single song to a playlist at a specific position or at the end.
   * @param {string} playlistId (local ID)
   * @param {string} songId 
   * @param {number} [position] 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async addSongToPlaylist(playlistId, songId, position = 0) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || !playlistId || !songId) {
      return { success: false, error: 'Unauthenticated or invalid parameters' };
    }

    const cloudId = playlistCloudIds.resolveCloudId(userId, playlistId);

    try {
      const record = {
        playlist_id: String(cloudId),
        song_id: String(songId),
        position: Math.max(0, position),
        added_at: new Date().toISOString()
      };

      const { error } = await client
        .from('playlist_songs')
        .insert(record);

      if (error) {
        console.warn('⚠️ [PlaylistsCloud] addSongToPlaylist error:', error.message);
        return { success: false, error: error.message };
      }

      // Update timestamp on playlist
      await client
        .from('playlists')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', String(cloudId))
        .eq('user_id', userId);

      return { success: true };
    } catch (err) {
      console.error('❌ [PlaylistsCloud] addSongToPlaylist exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Removes a song relationship from a playlist.
   * Does NOT delete the song from public.songs or user_library.
   * @param {string} playlistId (local ID)
   * @param {string} songId 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async removeSongFromPlaylist(playlistId, songId) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || !playlistId || !songId) {
      return { success: false, error: 'Unauthenticated or invalid parameters' };
    }

    const cloudId = playlistCloudIds.resolveCloudId(userId, playlistId);

    try {
      const { error } = await client
        .from('playlist_songs')
        .delete()
        .eq('playlist_id', String(cloudId))
        .eq('song_id', String(songId));

      if (error) {
        console.warn('⚠️ [PlaylistsCloud] removeSongFromPlaylist error:', error.message);
        return { success: false, error: error.message };
      }

      // Update timestamp on playlist
      await client
        .from('playlists')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', String(cloudId))
        .eq('user_id', userId);

      return { success: true };
    } catch (err) {
      console.error('❌ [PlaylistsCloud] removeSongFromPlaylist exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Deletes a playlist and its relationships from Supabase.
   * Does NOT delete the referenced songs from public.songs or user_library.
   * @param {string} playlistId (local ID)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deletePlaylist(playlistId) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || !playlistId) {
      return { success: false, error: 'Unauthenticated or invalid playlistId' };
    }

    const cloudId = playlistCloudIds.resolveCloudId(userId, playlistId);

    try {
      // 1. Delete associated playlist_songs entries
      await client
        .from('playlist_songs')
        .delete()
        .eq('playlist_id', String(cloudId));

      // 2. Delete the playlist record
      const { error } = await client
        .from('playlists')
        .delete()
        .eq('id', String(cloudId))
        .eq('user_id', userId);

      if (error) {
        console.warn('⚠️ [PlaylistsCloud] deletePlaylist error:', error.message);
        return { success: false, error: error.message };
      }

      // Clean up mapping
      playlistCloudIds.removeMapping(userId, playlistId);
      return { success: true };
    } catch (err) {
      console.error('❌ [PlaylistsCloud] deletePlaylist exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Updates is_favorite status on a playlist in Supabase.
   * @param {string} playlistId (local ID)
   * @param {boolean} isFavorite 
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async setPlaylistFavorite(playlistId, isFavorite) {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId || !playlistId) {
      return { success: false, error: 'Unauthenticated or invalid parameters' };
    }

    const cloudId = playlistCloudIds.resolveCloudId(userId, playlistId);

    try {
      const { error } = await client
        .from('playlists')
        .update({
          is_favorite: Boolean(isFavorite),
          updated_at: new Date().toISOString()
        })
        .eq('id', String(cloudId))
        .eq('user_id', userId);

      if (error) {
        console.warn('⚠️ [PlaylistsCloud] setPlaylistFavorite error:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error('❌ [PlaylistsCloud] setPlaylistFavorite exception:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetches all playlists and ordered song relationships for the authenticated user.
   * @returns {Promise<Array<object>>}
   */
  async getUserPlaylists() {
    const client = getSupabase();
    const userId = this.getAuthenticatedUserId();

    if (!client || !userId) return [];

    try {
      // 1. Fetch user playlists
      const { data: playlistsData, error: plError } = await client
        .from('playlists')
        .select('*')
        .eq('user_id', userId);

      if (plError || !playlistsData) return [];

      // 2. Fetch associated playlist_songs for these playlists
      const playlistIds = playlistsData.map(p => p.id);
      if (playlistIds.length === 0) return [];

      const { data: songsData, error: songsError } = await client
        .from('playlist_songs')
        .select('playlist_id, song_id, position')
        .in('playlist_id', playlistIds)
        .order('position', { ascending: true });

      const songsByPlaylist = new Map();
      if (!songsError && Array.isArray(songsData)) {
        songsData.forEach(rel => {
          if (!songsByPlaylist.has(rel.playlist_id)) {
            songsByPlaylist.set(rel.playlist_id, []);
          }
          songsByPlaylist.get(rel.playlist_id).push(rel.song_id);
        });
      }

      return playlistsData.map(row => mapDbToPlaylist(row, songsByPlaylist.get(row.id) || [], userId));
    } catch (err) {
      console.error('❌ [PlaylistsCloud] getUserPlaylists exception:', err);
      return [];
    }
  }

  /**
   * Executes controlled initial synchronization of local playlists to Supabase.
   * @returns {Promise<{success: boolean, playlistsSynced: number}>}
   */
  async syncPlaylists() {
    return syncCoordinator.runDeduplicated('playlists', async () => {
      const userId = this.getAuthenticatedUserId();
      const client = getSupabase();

      if (!client || !userId) {
        return { success: false, playlistsSynced: 0 };
      }

      console.log('🔄 [PlaylistsCloud] Initiating playlists cloud synchronization for user:', userId);

      try {
        const localPlaylists = dataStore.getPlaylists();
        if (!Array.isArray(localPlaylists) || localPlaylists.length === 0) {
          return { success: true, playlistsSynced: 0 };
        }

        // Ensure all referenced songs exist in public.songs
        const allSongs = dataStore.getSongs();
        await songsCloud.upsertSongs(allSongs);

        // 1. Fetch user's existing cloud playlists to reconcile mappings and preserve ownership
        const { data: rawCloudPlaylists } = await client
          .from('playlists')
          .select('*')
          .eq('user_id', userId);

        // 2. Reconcile user-scoped local-to-cloud ID mappings
        playlistCloudIds.reconcileUserMappings(userId, rawCloudPlaylists || [], localPlaylists);

        // 3. Upsert playlists and relationships with user-scoped cloud IDs
        const result = await this.upsertPlaylists(localPlaylists);

        // 4. Reconcile cloud favorite states if cloud has previously saved favorites
        const cloudPlaylists = await this.getUserPlaylists();
        if (cloudPlaylists && cloudPlaylists.length > 0) {
          const cloudFavMap = new Map(cloudPlaylists.map(cp => [cp.id, cp.isFavorite]));
          let modified = false;

          localPlaylists.forEach(lp => {
            if (cloudFavMap.has(lp.id)) {
              const cloudFav = cloudFavMap.get(lp.id);
              if (lp.isFavorite !== cloudFav) {
                lp.isFavorite = cloudFav;
                modified = true;
              }
            }
          });

          if (modified) {
            dataStore.saveState("music_os_playlists", localPlaylists);
            dataStore.notifyPlaylistsChange();
          }
        }

        console.log(`☁️ [PlaylistsCloud] Synchronized ${result.count} playlists to Supabase.`);
        return { success: true, playlistsSynced: result.count };
      } catch (err) {
        console.error('❌ [PlaylistsCloud] syncPlaylists exception:', err);
        return { success: false, playlistsSynced: 0, error: err.message };
      }
    });
  }
}

export const playlistsCloud = new MusicOSPlaylistsCloud();
export const upsertPlaylist = (pl) => playlistsCloud.upsertPlaylist(pl);
export const upsertPlaylists = (pls) => playlistsCloud.upsertPlaylists(pls);
export const deletePlaylist = (id) => playlistsCloud.deletePlaylist(id);
export const addSongToPlaylist = (plId, sId, pos) => playlistsCloud.addSongToPlaylist(plId, sId, pos);
export const removeSongFromPlaylist = (plId, sId) => playlistsCloud.removeSongFromPlaylist(plId, sId);
export const setPlaylistFavorite = (plId, isFav) => playlistsCloud.setPlaylistFavorite(plId, isFav);
export const getUserPlaylists = () => playlistsCloud.getUserPlaylists();
export const syncPlaylists = () => playlistsCloud.syncPlaylists();

if (typeof window !== 'undefined') {
  window.playlistsCloud = playlistsCloud;
}
