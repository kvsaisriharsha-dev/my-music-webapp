/* ==========================================================================
   MUSIC OS - Playlist Cloud ID Mapping Controller
   Maintains user-scoped stable mappings between local playlist IDs
   (e.g., "pl-liked", "pl-coding") and globally unique Supabase cloud IDs.
   ========================================================================== */

const STORAGE_KEY = 'music_os_playlist_cloud_ids';

class MusicOSPlaylistCloudIds {
  constructor() {
    this.memoryCache = new Map(); // userId -> Map(localId -> cloudId)
    this.reverseCache = new Map(); // userId -> Map(cloudId -> localId)
    this.loadAllFromStorage();
  }

  loadAllFromStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [userId, mappings] of Object.entries(parsed)) {
          if (mappings && typeof mappings === 'object') {
            const userMap = new Map();
            const revMap = new Map();
            for (const [localId, cloudId] of Object.entries(mappings)) {
              if (localId && cloudId) {
                userMap.set(String(localId), String(cloudId));
                revMap.set(String(cloudId), String(localId));
              }
            }
            this.memoryCache.set(userId, userMap);
            this.reverseCache.set(userId, revMap);
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ [PlaylistCloudIds] Error loading mappings from storage:', err);
    }
  }

  saveAllToStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      const payload = {};
      for (const [userId, userMap] of this.memoryCache.entries()) {
        payload[userId] = Object.fromEntries(userMap.entries());
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('⚠️ [PlaylistCloudIds] Error saving mappings to storage:', err);
    }
  }

  getUserMap(userId) {
    if (!userId) return new Map();
    if (!this.memoryCache.has(userId)) {
      this.memoryCache.set(userId, new Map());
      this.reverseCache.set(userId, new Map());
    }
    return this.memoryCache.get(userId);
  }

  getCloudId(userId, localId) {
    if (!userId || !localId) return localId;
    const userMap = this.getUserMap(userId);
    return userMap.get(String(localId)) || null;
  }

  getLocalId(userId, cloudId) {
    if (!userId || !cloudId) return cloudId;
    if (this.reverseCache.has(userId)) {
      const revMap = this.reverseCache.get(userId);
      if (revMap.has(String(cloudId))) {
        return revMap.get(String(cloudId));
      }
    }
    return cloudId;
  }

  setMapping(userId, localId, cloudId) {
    if (!userId || !localId || !cloudId) return;
    const userMap = this.getUserMap(userId);
    userMap.set(String(localId), String(cloudId));

    if (!this.reverseCache.has(userId)) {
      this.reverseCache.set(userId, new Map());
    }
    this.reverseCache.get(userId).set(String(cloudId), String(localId));

    this.saveAllToStorage();
  }

  removeMapping(userId, localId) {
    if (!userId || !localId) return;
    const userMap = this.getUserMap(userId);
    const cloudId = userMap.get(String(localId));
    userMap.delete(String(localId));
    if (cloudId && this.reverseCache.has(userId)) {
      this.reverseCache.get(userId).delete(String(cloudId));
    }
    this.saveAllToStorage();
  }

  generateUniqueCloudId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'pl_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Initializes or refreshes user mappings against their existing cloud rows in Supabase.
   * Ensures existing playlists owned by this user retain their ID,
   * while new or colliding playlists receive user-isolated unique cloud UUIDs.
   * @param {string} userId 
   * @param {Array<object>} cloudPlaylists 
   * @param {Array<object>} localPlaylists 
   */
  reconcileUserMappings(userId, cloudPlaylists = [], localPlaylists = []) {
    if (!userId) return;

    const userMap = this.getUserMap(userId);
    const cloudRows = Array.isArray(cloudPlaylists) ? cloudPlaylists : [];
    const localRows = Array.isArray(localPlaylists) ? localPlaylists : [];

    // Map of cloud rows owned by this user: id -> row and name -> row
    const cloudIdSet = new Set(cloudRows.map(r => String(r.id)));
    const cloudNameMap = new Map(cloudRows.map(r => [r.name?.toLowerCase().trim(), String(r.id)]));

    // 1. If this user already owns cloud rows with fixed local IDs (e.g. User A owning "pl-liked"), preserve them
    for (const cloudRow of cloudRows) {
      const cId = String(cloudRow.id);
      // Check if any local playlist matches this ID directly
      const matchingLocal = localRows.find(lp => String(lp.id) === cId);
      if (matchingLocal && !userMap.has(matchingLocal.id)) {
        this.setMapping(userId, matchingLocal.id, cId);
      }
    }

    // 2. For each local playlist, ensure a valid cloud ID mapping exists
    for (const lp of localRows) {
      const localId = String(lp.id);
      const existingMappedCloudId = userMap.get(localId);

      // If already mapped, check if it's still valid
      if (existingMappedCloudId) {
        continue;
      }

      // If user owns a cloud row with identical ID, map directly
      if (cloudIdSet.has(localId)) {
        this.setMapping(userId, localId, localId);
        continue;
      }

      // If user has a cloud playlist with the same name that hasn't been mapped to another local ID
      const normName = lp.name?.toLowerCase().trim();
      if (normName && cloudNameMap.has(normName)) {
        const matchingCloudId = cloudNameMap.get(normName);
        // Verify this cloud ID is not already mapped to another local ID for this user
        if (!this.getLocalId(userId, matchingCloudId) || this.getLocalId(userId, matchingCloudId) === matchingCloudId) {
          this.setMapping(userId, localId, matchingCloudId);
          continue;
        }
      }

      // Otherwise generate a new globally unique UUID for this user's playlist
      const newCloudId = this.generateUniqueCloudId();
      this.setMapping(userId, localId, newCloudId);
    }

    this.saveAllToStorage();
  }

  /**
   * Resolves the cloud ID for a local playlist ID, generating one if not yet present.
   * @param {string} userId 
   * @param {string} localId 
   * @returns {string}
   */
  resolveCloudId(userId, localId) {
    if (!userId || !localId) return localId;
    let cloudId = this.getCloudId(userId, localId);
    if (!cloudId) {
      cloudId = this.generateUniqueCloudId();
      this.setMapping(userId, localId, cloudId);
    }
    return cloudId;
  }
}

export const playlistCloudIds = new MusicOSPlaylistCloudIds();

if (typeof window !== 'undefined') {
  window.playlistCloudIds = playlistCloudIds;
}
