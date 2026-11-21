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

  // 1. Primary Cloud Sync: public.pump_station_data table (RLS enabled)
  try {
    const { error: tableError } = await supabase
      .from('pump_station_data')
      .upsert({
        user_id: userId,
        station_profile: snapshot.stationProfile || {},
        nozzle_config: snapshot.nozzles || [],
        fuel_rates: snapshot.fuelRates || snapshot.rates || {},
        dip_levels: snapshot.dips || {},
        daily_shifts: snapshot.dailyShifts || [],
        other_accounts: snapshot.otherAccounts || {},
        bank_hisab: snapshot.bankEntries || snapshot.bank_hisab || [],
        staff_attendance: snapshot.staffAttendance || {},
        updated_at: payload.updated_at
      }, { onConflict: 'user_id' });

    if (!tableError) {
      console.log('[supabaseSyncService] ✅ Postgres pump_station_data table updated');
    }
  } catch (err) {
    console.warn('[supabaseSyncService] pump_station_data upsert error:', err);
  }

  // 2. Fallback User Metadata Sync (ensures persistence even without SQL table)
  try {
    const { error: metaError } = await supabase.auth.updateUser({
      data: {
        station_cloud_data: payload,
        last_synced_at: payload.updated_at
      }
    });

    if (!metaError) {
      console.log(`[supabaseSyncService] ✅ Station data synced to Supabase Cloud for user ${userId}`);
    }
  } catch (err) {
    console.warn('[supabaseSyncService] Error updating user cloud metadata:', err);
  }

  return { success: true };
}

/**
 * Pulls station snapshot from Supabase Cloud for the authenticated user.
 */
export async function pullStationDataFromCloud(user) {
  if (!user || !user.id) return null;

  // 1. Try public.pump_station_data Postgres table first
  try {
    const { data, error } = await supabase
      .from('pump_station_data')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error && data) {
      return {
        stationProfile: data.station_profile,
        rates: data.fuel_rates,
        fuelRates: data.fuel_rates,
        nozzles: data.nozzle_config,
        dips: data.dip_levels,
        dailyShifts: data.daily_shifts,
        ushinaDirectory: data.other_accounts?.ushinaDirectory,
        bank_hisab: data.bank_hisab,
        staffAttendance: data.staff_attendance
      };
    }
  } catch {
    // Table not present or offline, proceed to metadata
  }

  // 2. Fall back to user_metadata
  if (user.user_metadata?.station_cloud_data) {
    return user.user_metadata.station_cloud_data;
  }

  return null;
}
