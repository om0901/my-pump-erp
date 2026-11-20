import { db } from '../db/database';

export const PARTIES_STORAGE_KEY = 'my_pump_master_parties_list';

export const DEFAULT_PARTIES = [];

export const getMasterParties = () => {
  try {
    const data = localStorage.getItem(PARTIES_STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed.map((p, idx) => ({
          id: p?.id || idx + 1,
          name: p?.name || '',
          phone: p?.phone || '',
          balance: parseFloat(p?.balance) || 0,
          limit: parseFloat(p?.limit) || 0,
          vehicleNumbers: Array.isArray(p?.vehicleNumbers) ? p.vehicleNumbers : [],
          transactions: Array.isArray(p?.transactions) ? p.transactions : []
        }));
      }
    }
  } catch (err) {
    console.error('Error reading master parties:', err);
  }
  return [];
};

export const saveMasterParties = async (updatedParties) => {
  if (!Array.isArray(updatedParties)) return;
  try {
    const freshJson = JSON.stringify(updatedParties);
    const existingJson = localStorage.getItem(PARTIES_STORAGE_KEY);

    // Prevent redundant event dispatch if content is identical
    if (existingJson === freshJson) return;

    localStorage.setItem(PARTIES_STORAGE_KEY, freshJson);

    if (db && db.settings) {
      await db.settings.put({
        key: 'pump_master_parties',
        data: updatedParties,
        updatedAt: new Date().toISOString()
      });
    }

    window.dispatchEvent(new Event('pump_parties_updated'));
  } catch (err) {
    console.error('Error saving master parties:', err);
  }
};
