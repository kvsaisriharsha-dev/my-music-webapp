/* ==========================================================================
   MUSIC OS - Cloud Songs Catalog Manager (public.songs)
   Manages global song catalog synchronization, batch upserts, and mappings.
   ========================================================================== */

import { getSupabase } from './supabase.js';

/**
 * Transforms a local Music OS song object into a database-compatible row for public.songs.
 * @param {object} song 
 * @returns {object}
 */
export function mapSongToDb(song) {
  if (!song) return null;
  return {
    id: String(song.id),
    title: song.title || 'Untitled Track',
    artist: song.artist || 'Unknown Artist',
    album: song.album || 'Single',
    duration: typeof song.duration === 'number' ? Math.round(song.duration) : 0,
    cover: song.cover || '',
    genre: song.genre || 'Various',
    source: song.source || 'local',
    video_id: song.videoId || song.video_id || song.youtubeId || song.youtube_id || null,
    youtube_id: song.youtubeId || song.youtube_id || song.videoId || song.video_id || null,
    url: song.url || '',
    synth_note: song.synthNote || song.synth_note || 'C4',
    updated_at: new Date().toISOString()
  };
}

/**
 * Transforms a database row from public.songs into a Music OS song object.
 * @param {object} row 
 * @returns {object}
 */
export function mapDbToSong(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || 'Untitled Track',
    artist: row.artist || 'Unknown Artist',
    album: row.album || 'Single',
    duration: row.duration || 0,
    cover: row.cover || '',
    genre: row.genre || 'Various',
    source: row.source || 'local',
    videoId: row.video_id || row.youtube_id || '',
    youtubeId: row.youtube_id || row.video_id || '',
    url: row.url || '',
    synthNote: row.synth_note || 'C4',
    liked: false // Local/Library relation determines liked status
  };
}

class MusicOSSongsCloud {
  /**
   * Upserts a single song into public.songs global catalog.
   * @param {object} song 
   * @returns {Promise<{success: boolean, data?: object, error?: string}>}
   */
  async upsertSong(song) {
    const client = getSupabase();
    if (!client || !song) {
      return { success: false, error: 'Supabase client not available or invalid song' };
    }

    const record = mapSongToDb(song);
    try {
      const { data, error } = await client
        .from('songs')
        .upsert(record, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        console.warn('⚠️ [SongsCloud] Upsert error:', error.message);
        return { success: false, error: error.message };
      }

      return { success: true, data: mapDbToSong(data) };
    } catch (err) {
      console.error('❌ [SongsCloud] Exception upserting song:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Batch upserts an array of songs into public.songs in chunks to optimize network efficiency.
   * @param {Array<object>} songs 
   * @param {number} [chunkSize=50]
   * @returns {Promise<{success: boolean, count: number, error?: string}>}
   */
  async upsertSongs(songs, chunkSize = 50) {
    const client = getSupabase();
    if (!client || !Array.isArray(songs) || songs.length === 0) {
      return { success: true, count: 0 };
    }

    const records = songs.map(mapSongToDb).filter(Boolean);
    let totalUpserted = 0;

    try {
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { error } = await client
          .from('songs')
          .upsert(chunk, { onConflict: 'id' });

        if (error) {
          console.warn(`⚠️ [SongsCloud] Batch upsert chunk error [${i}..${i + chunk.length}]:`, error.message);
          return { success: false, count: totalUpserted, error: error.message };
        }
        totalUpserted += chunk.length;
      }

      console.log(`☁️ [SongsCloud] Synchronized ${totalUpserted} songs to public.songs.`);
      return { success: true, count: totalUpserted };
    } catch (err) {
      console.error('❌ [SongsCloud] Batch upsert exception:', err);
      return { success: false, count: totalUpserted, error: err.message };
    }
  }

  /**
   * Retrieves a single song by its ID.
   * @param {string} songId 
   * @returns {Promise<object | null>}
   */
  async getSongById(songId) {
    const client = getSupabase();
    if (!client || !songId) return null;

    try {
      const { data, error } = await client
        .from('songs')
        .select('*')
        .eq('id', String(songId))
        .maybeSingle();

      if (error || !data) return null;
      return mapDbToSong(data);
    } catch (err) {
      console.error('❌ [SongsCloud] Error getting song by ID:', err);
      return null;
    }
  }

  /**
   * Retrieves multiple songs by an array of IDs.
   * @param {Array<string>} songIds 
   * @returns {Promise<Array<object>>}
   */
  async getSongsByIds(songIds) {
    const client = getSupabase();
    if (!client || !Array.isArray(songIds) || songIds.length === 0) return [];

    try {
      const cleanIds = songIds.map(String);
      const { data, error } = await client
        .from('songs')
        .select('*')
        .in('id', cleanIds);

      if (error || !data) return [];
      return data.map(mapDbToSong);
    } catch (err) {
      console.error('❌ [SongsCloud] Error getting songs by IDs:', err);
      return [];
    }
  }
}

export const songsCloud = new MusicOSSongsCloud();
export const upsertSong = (s) => songsCloud.upsertSong(s);
export const upsertSongs = (s) => songsCloud.upsertSongs(s);
export const getSongById = (id) => songsCloud.getSongById(id);
export const getSongsByIds = (ids) => songsCloud.getSongsByIds(ids);

if (typeof window !== 'undefined') {
  window.songsCloud = songsCloud;
}
