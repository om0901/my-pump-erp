import { db } from '../db/database';

export const BANK_STORAGE_KEY = 'my_pump_master_bank_accounts';
export const LEGACY_STORAGE_KEY = 'pump_bank_accounts_master';

export const DEFAULT_BANKS = [
  { id: 'bank-1', name: 'The Mehsana Urban Co-Op Bank Ltd', accountNumber: '00151304000095', branch: 'Kheralu Branch', balance: 0, deposits: [] },
  { id: 'bank-2', name: 'State Bank of India', accountNumber: '30129481023', branch: 'Mehsana Highway', balance: 0, deposits: [] },
  { id: 'bank-3', name: 'HDFC Bank Ltd', accountNumber: '5541098231', branch: 'Unjha Circle', balance: 0, deposits: [] }
];

export const DEFAULT_PUMP_BANKS = DEFAULT_BANKS;

export const getMasterBankAccounts = () => {
  try {
    const rawData = localStorage.getItem('pump_bank_accounts') ??
                    localStorage.getItem(BANK_STORAGE_KEY) ??
                    localStorage.getItem(LEGACY_STORAGE_KEY);
    
    // If explicitly saved in storage (even as an empty array []), respect it!
    if (rawData !== null) {
      try {
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) {
          return parsed.map((b, idx) => ({
            id: b?.id || `bank-${idx + 1}`,
            name: b?.name || 'Bank Account',
            accountNumber: b?.accountNumber || '',
            branch: b?.branch || '',
            balance: parseFloat(b?.balance) || 0,
            openingBalance: parseFloat(b?.openingBalance) || 0,
            deposits: Array.isArray(b?.deposits) ? b.deposits : []
          }));
        }
      } catch (e) {
        console.error('Error parsing bank accounts:', e);
      }
    }

    // Only set and return default banks on first-time launch when storage is null
    const defaultsJson = JSON.stringify(DEFAULT_BANKS);
    localStorage.setItem('pump_bank_accounts', defaultsJson);
    localStorage.setItem(BANK_STORAGE_KEY, defaultsJson);
    localStorage.setItem(LEGACY_STORAGE_KEY, defaultsJson);
    return DEFAULT_BANKS;
  } catch (err) {
    console.error('Error reading master bank accounts:', err);
    return [];
  }
};

export const saveMasterBankAccounts = async (updatedBanks) => {
  if (!Array.isArray(updatedBanks)) return;
  try {
    const freshJson = JSON.stringify(updatedBanks);

    localStorage.setItem('pump_bank_accounts', freshJson);
    localStorage.setItem(BANK_STORAGE_KEY, freshJson);
    localStorage.setItem(LEGACY_STORAGE_KEY, freshJson);
    
    if (db && db.settings) {
      await db.settings.put({
        key: 'bank_accounts_master',
        data: updatedBanks,
        updatedAt: new Date().toISOString()
      });

      const bankHisabRec = await db.settings.get('bank_hisab_store');
      const bankHisabData = bankHisabRec?.data || {
        upi_transactions: [],
        atm_transactions: [],
        smart_money_transactions: []
      };

      await db.settings.put({
        key: 'bank_hisab_store',
        data: {
          ...bankHisabData,
          bank_accounts: updatedBanks
        },
        updatedAt: new Date().toISOString()
      });
    }

    window.dispatchEvent(new Event('bank_master_updated'));
    window.dispatchEvent(new Event('bank_accounts_updated'));
  } catch (err) {
    console.error('Error saving master bank accounts:', err);
  }
};
