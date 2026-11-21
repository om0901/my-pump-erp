import { supabase } from '../lib/supabaseClient';

/**
 * Generates an account-isolated storage key scoped strictly to the authenticated user.
 */
export function getScopedKey(userId, baseKey) {
  if (!userId) return baseKey;
  return `mypump_${userId}_${baseKey}`;
}

/**
 * Saves a user-scoped item to localStorage
 */
export function setScopedItem(userId, baseKey, value) {
  try {
    const key = getScopedKey(userId, baseKey);
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch (err) {
    console.warn(`[supabaseSyncService] Failed to setScopedItem for ${baseKey}:`, err);
  }
}

/**
 * Reads a user-scoped item from localStorage, falling back to legacy global key if user key doesn't exist yet
 */
export function getScopedItem(userId, baseKey, fallback = null) {
  try {
    if (userId) {
      const userKey = getScopedKey(userId, baseKey);
      const userVal = localStorage.getItem(userKey);
      if (userVal !== null) {
        try {
          return JSON.parse(userVal);
        } catch {
          return userVal;
        }
      }
    }

    // Check legacy global key (for smooth migration of existing workstation data)
    const legacyVal = localStorage.getItem(baseKey);
    if (legacyVal !== null) {
      try {
        const parsed = JSON.parse(legacyVal);
        // Migrate to user scope if userId provided
        if (userId) {
          setScopedItem(userId, baseKey, parsed);
        }
        return parsed;
      } catch {
        if (userId) setScopedItem(userId, baseKey, legacyVal);
        return legacyVal;
      }
    }
  } catch (err) {
    console.warn(`[supabaseSyncService] Failed to getScopedItem for ${baseKey}:`, err);
  }
  return fallback;
}

/**
 * Pushes a consolidated station snapshot to Supabase Cloud for the authenticated user.
 * Strictly linked to user_id.
 */
export async function syncStationDataToCloud(userId, snapshot) {
  if (!userId || !snapshot) return { success: false, error: 'Missing userId or snapshot' };

  const payload = {
    updated_at: new Date().toISOString(),
    ...snapshot
  };

  // 1. Primary Cloud Sync: Supabase Auth User Metadata (zero SQL setup required)
  try {
    const { error: metaError } = await supabase.auth.updateUser({
      data: {
        station_cloud_data: payload,
        last_synced_at: payload.updated_at
      }
    });

    if (metaError) {
      console.warn('[supabaseSyncService] Metadata cloud sync warning:', metaError.message);
    } else {
      console.log(`[supabaseSyncService] ✅ Station data synced to Supabase Cloud for user ${userId}`);
    }
  } catch (err) {
    console.warn('[supabaseSyncService] Error updating user cloud metadata:', err);
  }

  // 2. Secondary Cloud Sync: Attempt public.station_data table if created in Postgres
  try {
    const { error: tableError } = await supabase
      .from('station_data')
      .upsert({
        user_id: userId,
        data: payload,
        updated_at: payload.updated_at
      });

    if (!tableError) {
      console.log('[supabaseSyncService] ✅ Postgres station_data table updated');
    }
  } catch {
    // Graceful no-op if table does not exist
  }

  return { success: true };
}

/**
 * Pulls station snapshot from Supabase Cloud for the authenticated user.
 */
export async function pullStationDataFromCloud(user) {
  if (!user || !user.id) return null;

  // 1. Try public.station_data Postgres table first
  try {
    const { data, error } = await supabase
      .from('station_data')
      .select('data')
      .eq('user_id', user.id)
      .single();

    if (!error && data && data.data) {
      return data.data;
    }
  } catch {
    // Table not present, proceed to metadata
  }

  // 2. Fall back to user_metadata
  if (user.user_metadata?.station_cloud_data) {
    return user.user_metadata.station_cloud_data;
  }

  return null;
}
