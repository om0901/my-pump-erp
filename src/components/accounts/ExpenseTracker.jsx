import React, { useState, useEffect, useMemo } from 'react';
import { useApp, DEFAULT_USHINA_DIRECTORY } from '../../context/AppContext';
import { db } from '../../db/database';
import {
  Receipt,
  Plus,
  Trash2,
  Calendar,
  Tag,
  Wallet,
  Search,
  Printer,
  Download,
  Phone,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  FolderPlus,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Save,
  CreditCard,
  Banknote,
  DollarSign,
  FileText
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import NumericInput from '../common/NumericInput';

const ACCOUNT_CATEGORIES = [
  'Daily Operations',
  'Maintenance & Repairs',
  'Power & Fuel',
  'Vendor / Supplier',
  'Staff & Partner Upad',
  'Miscellaneous'
];

// Default Ushina Khata (Dual Jama-Udhar) Accounts
const DEFAULT_USHINA_ACCOUNTS = [];

// Default Daily Pump Expenses (Single-Sided Expense Log) Categories (100% Zero-State for new users)
const DEFAULT_EXPENSE_CATEGORIES = [];

export const sanitizeUshinaList = (list) => {
  if (!Array.isArray(list)) return DEFAULT_USHINA_ACCOUNTS;
  return list.map((acc, idx) => ({
    id: acc?.id || `ush-${idx}-${Date.now()}`,
    name: acc?.name || 'Unnamed Account',
    category: acc?.category || 'Daily Operations',
    phone: acc?.phone || '',
    openingBalance: parseFloat(acc?.openingBalance) || 0,
    jamaEntries: Array.isArray(acc?.jamaEntries) ? acc.jamaEntries : [],
    udharEntries: Array.isArray(acc?.udharEntries) ? acc.udharEntries : []
  }));
};

export const sanitizeExpenseCategoryList = (list) => {
  if (!Array.isArray(list)) return DEFAULT_EXPENSE_CATEGORIES;
  return list.map((cat, idx) => ({
    id: cat?.id || `exp-cat-${idx}-${Date.now()}`,
    name: cat?.name || 'General Expense',
    category: cat?.category || 'Daily Operations',
    entries: Array.isArray(cat?.entries) ? cat.entries : []
  }));
};

export default function ExpenseTracker() {
  const {
    selectedDate,
    showToast,
    stationProfile,
    ushinaDirectory = [],
    ushinaDirectoryList = ushinaDirectory,
    updateUshinaDirectory = () => {},
    updateUshinaDirectoryList = updateUshinaDirectory,
    pumpExpenseCategories = [],
    updatePumpExpenseCategories = () => {},
    expenseEntries = [],
    otherIncomeEntries = []
  } = useApp();
  const [loading, setLoading] = useState(true);

  // Active Sub-Tab: 'ushina' (Ushina Khata Dual Ledger) vs 'expenses' (Daily Pump Expenses Single Ledger)
  const [activeSubTab, setActiveSubTab] = useState('ushina');

  // --- TAB 1: USHINA KHATA STATE ---
  const [ushinaAccounts, setUshinaAccounts] = useState(() => {
    try {
      const saved = localStorage.getItem('ushina_accounts') || localStorage.getItem('pump_ushina_directory');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return sanitizeUshinaList(parsed);
      }
    } catch (e) {}
    const list = Array.isArray(ushinaDirectoryList) ? ushinaDirectoryList : ushinaDirectory;
    return sanitizeUshinaList(list);
  });
  const [selectedUshinaId, setSelectedUshinaId] = useState(() => {
    try {
      const saved = localStorage.getItem('ushina_accounts') || localStorage.getItem('pump_ushina_directory');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0]?.id || null;
      }
    } catch (e) {}
    const list = Array.isArray(ushinaDirectoryList) ? ushinaDirectoryList : ushinaDirectory;
    if (Array.isArray(list) && list.length > 0) return list[0]?.id || null;
    return null;
  });
  const [ushinaSearch, setUshinaSearch] = useState('');

  // --- TAB 2: PUMP EXPENSES STATE ---
  const [expenseCategories, setExpenseCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('expense_categories') || localStorage.getItem('pump_expense_categories');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return sanitizeExpenseCategoryList(parsed);
      }
    } catch (e) {}
    if (Array.isArray(pumpExpenseCategories)) return sanitizeExpenseCategoryList(pumpExpenseCategories);
    return sanitizeExpenseCategoryList(DEFAULT_EXPENSE_CATEGORIES);
  });
  const [selectedExpenseCatId, setSelectedExpenseCatId] = useState(() => {
    try {
      const saved = localStorage.getItem('expense_categories') || localStorage.getItem('pump_expense_categories');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0]?.id || null;
      }
    } catch (e) {}
    if (Array.isArray(pumpExpenseCategories) && pumpExpenseCategories.length > 0) return pumpExpenseCategories[0]?.id || null;
    return null;
  });
  const [expenseSearch, setExpenseSearch] = useState('');

  // --- TAB 3: OTHER EXPENSES STATE ---
  const [otherExpenses, setOtherExpenses] = useState(() => {
    try {
      const saved = localStorage.getItem('pump_other_expenses') || localStorage.getItem('other_expenses');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });
  const [otherExpSearch, setOtherExpSearch] = useState('');
  const [showOtherExpModal, setShowOtherExpModal] = useState(false);
  const [otherExpDate, setOtherExpDate] = useState(selectedDate || new Date().toISOString().split('T')[0]);
  const [otherExpAmount, setOtherExpAmount] = useState('');
  const [otherExpRemarks, setOtherExpRemarks] = useState('');

  // Common Modals State
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [showNewExpenseCatModal, setShowNewExpenseCatModal] = useState(false);
  const [showJamaModal, setShowJamaModal] = useState(false);
  const [showUdharModal, setShowUdharModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);

  // Forms State
  const [newAccount, setNewAccount] = useState({
    name: '',
    category: 'Daily Operations',
    phone: '',
    openingBalance: 0
  });

  const [newExpenseCat, setNewExpenseCat] = useState({
    name: '',
    category: 'Daily Operations'
  });

  const [entryDate, setEntryDate] = useState(selectedDate || new Date().toISOString().split('T')[0]);
  const [entryAmount, setEntryAmount] = useState('');
  const [entryRemarks, setEntryRemarks] = useState('');
  const [entryPaymentMode, setEntryPaymentMode] = useState('Cash');

  useEffect(() => {
    loadAllStores();
  }, []);

  useEffect(() => {
    const activeList = Array.isArray(ushinaDirectoryList) ? ushinaDirectoryList : ushinaDirectory;
    if (Array.isArray(activeList) && activeList.length > 0) {
      setUshinaAccounts(prev => {
        const prevList = Array.isArray(prev) && prev.length > 0 ? prev : [];
        let savedList = [];
        try {
          const s = localStorage.getItem('ushina_accounts') || localStorage.getItem('pump_ushina_directory');
          if (s) {
            const p = JSON.parse(s);
            if (Array.isArray(p)) savedList = p;
          }
        } catch (e) {}

        const merged = activeList.map(activeAcc => {
          const activeCleanName = (activeAcc.name || '').trim().toLowerCase();
          const existingInPrev = prevList.find(p => p.id === activeAcc.id || (p.name && p.name.trim().toLowerCase() === activeCleanName));
          const existingInSaved = savedList.find(s => s.id === activeAcc.id || (s.name && s.name.trim().toLowerCase() === activeCleanName));

          const prevJama = Array.isArray(existingInPrev?.jamaEntries) && existingInPrev.jamaEntries.length > 0 ? existingInPrev.jamaEntries : [];
          const savedJama = Array.isArray(existingInSaved?.jamaEntries) && existingInSaved.jamaEntries.length > 0 ? existingInSaved.jamaEntries : [];
          const activeJama = Array.isArray(activeAcc.jamaEntries) && activeAcc.jamaEntries.length > 0 ? activeAcc.jamaEntries : [];
          const bestJama = activeJama.length >= Math.max(prevJama.length, savedJama.length) ? activeJama : (prevJama.length >= savedJama.length ? prevJama : savedJama);

          const prevUdhar = Array.isArray(existingInPrev?.udharEntries) && existingInPrev.udharEntries.length > 0 ? existingInPrev.udharEntries : [];
          const savedUdhar = Array.isArray(existingInSaved?.udharEntries) && existingInSaved.udharEntries.length > 0 ? existingInSaved.udharEntries : [];
          const activeUdhar = Array.isArray(activeAcc.udharEntries) && activeAcc.udharEntries.length > 0 ? activeAcc.udharEntries : [];
          const bestUdhar = activeUdhar.length >= Math.max(prevUdhar.length, savedUdhar.length) ? activeUdhar : (prevUdhar.length >= savedUdhar.length ? prevUdhar : savedUdhar);

          return {
            ...activeAcc,
            openingBalance: activeAcc.openingBalance !== undefined ? activeAcc.openingBalance : (existingInPrev?.openingBalance ?? existingInSaved?.openingBalance ?? 0),
            jamaEntries: bestJama,
            udharEntries: bestUdhar
          };
        });
        return merged;
      });

      if (!selectedUshinaId || !activeList.some(a => a.id === selectedUshinaId)) {
        setSelectedUshinaId(activeList[0].id);
      }
    }
  }, [ushinaDirectoryList, ushinaDirectory]);

  useEffect(() => {
    if (Array.isArray(pumpExpenseCategories)) {
      setExpenseCategories(pumpExpenseCategories);
      if (pumpExpenseCategories.length === 0) {
        setSelectedExpenseCatId(null);
      } else if (!selectedExpenseCatId || !pumpExpenseCategories.some(c => c.id === selectedExpenseCatId)) {
        setSelectedExpenseCatId(pumpExpenseCategories[0].id);
      }
    }
  }, [pumpExpenseCategories]);

  useEffect(() => {
    if (selectedDate) {
      setEntryDate(selectedDate);
      setOtherExpDate(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    const handleOaSync = () => {
      try {
        const savedOther = localStorage.getItem('pump_other_expenses') || localStorage.getItem('other_expenses');
        if (savedOther) {
          const parsed = JSON.parse(savedOther);
          if (Array.isArray(parsed)) setOtherExpenses(parsed);
        }
        const savedUsh = localStorage.getItem('ushina_accounts') || localStorage.getItem('pump_ushina_directory');
        if (savedUsh) {
          const parsedUsh = JSON.parse(savedUsh);
          if (Array.isArray(parsedUsh)) setUshinaAccounts(sanitizeUshinaList(parsedUsh));
        }
      } catch (e) {}
    };
    window.addEventListener('pump_oa_sync', handleOaSync);
    return () => window.removeEventListener('pump_oa_sync', handleOaSync);
  }, []);

  const loadAllStores = async () => {
    setLoading(true);
    try {
      // 1. Load Ushina Khata Accounts
      let ushRec = await db.settings.get('other_accounts_ushina');
      if (!ushRec) {
        ushRec = await db.settings.get('vividh_khata_accounts');
      }

      const savedUsh = localStorage.getItem('ushina_accounts') || localStorage.getItem('pump_ushina_directory');

      if (ushRec && Array.isArray(ushRec.data)) {
        const sanitizedUsh = sanitizeUshinaList(ushRec.data);
        setUshinaAccounts(sanitizedUsh);
        setSelectedUshinaId(sanitizedUsh.length > 0 ? sanitizedUsh[0].id : null);
        if (typeof updateUshinaDirectoryList === 'function') updateUshinaDirectoryList(sanitizedUsh);
        else if (typeof updateUshinaDirectory === 'function') updateUshinaDirectory(sanitizedUsh);
      } else if (savedUsh !== null) {
        try {
          const parsedUsh = JSON.parse(savedUsh);
          if (Array.isArray(parsedUsh)) {
            const sanitizedUsh = sanitizeUshinaList(parsedUsh);
            setUshinaAccounts(sanitizedUsh);
            setSelectedUshinaId(sanitizedUsh.length > 0 ? sanitizedUsh[0].id : null);
            if (typeof updateUshinaDirectoryList === 'function') updateUshinaDirectoryList(sanitizedUsh);
            else if (typeof updateUshinaDirectory === 'function') updateUshinaDirectory(sanitizedUsh);
            await saveUshinaAccountsToDb(sanitizedUsh);
          }
        } catch (e) {
          console.error('Error parsing saved Ushina accounts:', e);
        }
      } else {
        const defaultUsh = sanitizeUshinaList(DEFAULT_USHINA_ACCOUNTS);
        setUshinaAccounts(defaultUsh);
        setSelectedUshinaId(defaultUsh[0]?.id || null);
        if (typeof updateUshinaDirectoryList === 'function') updateUshinaDirectoryList(defaultUsh);
        else if (typeof updateUshinaDirectory === 'function') updateUshinaDirectory(defaultUsh);
        await saveUshinaAccountsToDb(defaultUsh);
      }

      // 1b. Reconcile saved DB other income and expenses into Ushina accounts
      try {
        const allDbInc = await db.otherIncome.toArray();
        const allDbExp = await db.expenses.toArray();
        if ((allDbInc && allDbInc.length > 0) || (allDbExp && allDbExp.length > 0)) {
          setUshinaAccounts(prev => {
            const list = Array.isArray(prev) ? prev : [];
            let changed = false;
            const updated = list.map((acc, aIdx) => {
              const accName = (acc.name || '').trim().toLowerCase();
              const accId = (acc.id || '').trim().toLowerCase();
              let newJama = [...(acc.jamaEntries || [])];
              let newUdhar = [...(acc.udharEntries || [])];

              // Reconcile db.otherIncome into Jama
              (allDbInc || []).forEach(inc => {
                const amt = parseFloat(inc.amount) || 0;
                if (amt <= 0) return;
                let cat = (inc.category || '').trim().toLowerCase();
                const desc = (inc.description || '').trim().toLowerCase();
                const pName = (inc.partyName || '').trim().toLowerCase();
                const incAccId = (inc.accountId || '').trim().toLowerCase();

                const isDirectMatch = cat === accName || pName === accName || (incAccId && incAccId === accId);
                const isDescMatch = desc === accName;
                const isGenericCategoryMatch = (
                  (cat === 'ushina khata' || cat === 'ushina' || cat === 'other income') &&
                  (desc === accName || (!desc && (aIdx === 0 || list.length === 1)))
                );
                const isSingleAccountFallback = list.length === 1;

                if (isDirectMatch || isDescMatch || isGenericCategoryMatch || isSingleAccountFallback) {
                  const entryKey = `jama-shift-${inc.date}-${inc.shiftId || 'Day'}-${inc.id}`;
                  if (!newJama.some(j => j.id === entryKey || (j.date === inc.date && parseFloat(j.amount) === amt && j.fromDailyShift))) {
                    newJama.push({
                      id: entryKey,
                      date: inc.date,
                      amount: amt,
                      remarks: inc.description ? `${inc.description} (Daily Entry Other Income)` : `Daily Entry Other Income (${inc.date})`,
                      fromDailyShift: true
                    });
                    changed = true;
                  }
                }
              });

              // Reconcile db.expenses into Udhar
              (allDbExp || []).forEach(exp => {
                const amt = parseFloat(exp.amount) || 0;
                if (amt <= 0) return;
                const cat = (exp.category || '').trim().toLowerCase();
                const desc = (exp.description || '').trim().toLowerCase();
                if ((cat === 'ushina khata' || cat === 'ushina') && (desc === accName || (!desc && (aIdx === 0 || list.length === 1)))) {
                  const entryKey = `udhar-shift-${exp.date}-${exp.shiftId || 'Day'}-${exp.id}`;
                  if (!newUdhar.some(u => u.id === entryKey || (u.date === exp.date && parseFloat(u.amount) === amt && u.fromDailyShift))) {
                    newUdhar.push({
                      id: entryKey,
                      date: exp.date,
                      amount: amt,
                      description: exp.description ? `Daily Entry Shift Expense (${exp.date}) - ${exp.description}` : `Daily Entry Shift Expense (${exp.date})`,
                      fromDailyShift: true
                    });
                    changed = true;
                  }
                }
              });

              return { ...acc, jamaEntries: newJama, udharEntries: newUdhar };
            });

            if (changed) {
              saveUshinaAccountsToDb(updated);
            }
            return changed ? updated : prev;
          });
        }
      } catch (reconcileErr) {
        console.error('Error auto-reconciling DB other income/expenses with Ushina:', reconcileErr);
      }

      // 2. Load Pump Direct Expenses Categories
      const expRec = await db.settings.get('pump_direct_expenses');
      const savedExp = localStorage.getItem('expense_categories') || localStorage.getItem('pump_expense_categories');

      if (expRec && Array.isArray(expRec.data)) {
        const sanitizedExp = sanitizeExpenseCategoryList(expRec.data);
        setExpenseCategories(sanitizedExp);
        setSelectedExpenseCatId(sanitizedExp.length > 0 ? sanitizedExp[0].id : null);
        if (typeof updatePumpExpenseCategories === 'function') updatePumpExpenseCategories(sanitizedExp);
      } else if (savedExp !== null) {
        try {
          const parsedExp = JSON.parse(savedExp);
          if (Array.isArray(parsedExp)) {
            const sanitizedExp = sanitizeExpenseCategoryList(parsedExp);
            setExpenseCategories(sanitizedExp);
            setSelectedExpenseCatId(sanitizedExp.length > 0 ? sanitizedExp[0].id : null);
            if (typeof updatePumpExpenseCategories === 'function') updatePumpExpenseCategories(sanitizedExp);
            await saveExpenseCategoriesToDb(sanitizedExp);
          }
        } catch (e) {
          console.error('Error parsing saved expense categories:', e);
        }
      } else {
        const defaultExp = sanitizeExpenseCategoryList(DEFAULT_EXPENSE_CATEGORIES);
        setExpenseCategories(defaultExp);
        setSelectedExpenseCatId(defaultExp[0]?.id || null);
        if (typeof updatePumpExpenseCategories === 'function') updatePumpExpenseCategories(defaultExp);
        await saveExpenseCategoriesToDb(defaultExp);
      }

      // 3. Load Other Expenses Register
      const otherExpRec = await db.settings.get('pump_other_expenses');
      const savedOtherExp = localStorage.getItem('pump_other_expenses') || localStorage.getItem('other_expenses');
      if (otherExpRec && Array.isArray(otherExpRec.data)) {
        setOtherExpenses(otherExpRec.data);
      } else if (savedOtherExp !== null) {
        try {
          const parsedOther = JSON.parse(savedOtherExp);
          if (Array.isArray(parsedOther)) setOtherExpenses(parsedOther);
        } catch (e) {}
      }
    } catch (err) {
      console.error('Error loading other accounts modules:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveUshinaAccountsToDb = async (updatedList) => {
    try {
      const list = Array.isArray(updatedList) ? updatedList : [];
      localStorage.setItem('ushina_accounts', JSON.stringify(list));
      localStorage.setItem('pump_ushina_directory', JSON.stringify(list));
      window.dispatchEvent(new Event('pump_oa_sync'));
      await db.settings.put({
        key: 'other_accounts_ushina',
        data: list,
        updatedAt: new Date().toISOString()
      });
      await db.settings.put({
        key: 'vividh_khata_accounts',
        data: list,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error saving ushina accounts:', err);
    }
  };

  const saveExpenseCategoriesToDb = async (updatedList) => {
    try {
      const list = Array.isArray(updatedList) ? updatedList : [];
      localStorage.setItem('expense_categories', JSON.stringify(list));
      localStorage.setItem('pump_expense_categories', JSON.stringify(list));
      window.dispatchEvent(new Event('pump_oa_sync'));
      await db.settings.put({
        key: 'pump_direct_expenses',
        data: list,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error saving expense categories:', err);
    }
  };

  const saveOtherExpensesToDb = async (updatedList) => {
    try {
      const list = Array.isArray(updatedList) ? updatedList : [];
      localStorage.setItem('pump_other_expenses', JSON.stringify(list));
      window.dispatchEvent(new Event('pump_oa_sync'));
      await db.settings.put({
        key: 'pump_other_expenses',
        data: list,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error saving other expenses:', err);
    }
  };

  // --- IN-MEMORY REAL-TIME LIVE SYNC FROM DAILY ENTRY (SECTION G & SECTION D) ---
  const effectiveUshinaAccounts = useMemo(() => {
    const baseList = Array.isArray(ushinaAccounts) ? ushinaAccounts : [];
    if (baseList.length === 0) return [];

    return baseList.map((acc, accIdx) => {
      const accNameClean = (acc.name || '').trim().toLowerCase();
      const accIdClean = (acc.id || '').trim().toLowerCase();

      // Check if current shift was already committed to stored records
      const isShiftSavedUdhar = (acc.udharEntries || []).some(
        u => u.fromDailyShift && (u.date === selectedDate || String(u.id).includes(`-${selectedDate}-`))
      );
      const isShiftSavedJama = (acc.jamaEntries || []).some(
        j => j.fromDailyShift && (j.date === selectedDate || String(j.id).includes(`-${selectedDate}-`))
      );

      // 1. Live UDHAR from Section G (Expenses)
      const liveUdharEntries = isShiftSavedUdhar ? [] : (expenseEntries || [])
        .filter(exp => {
          const amt = parseFloat(exp.amount) || 0;
          if (amt <= 0) return false;
          const cat = (exp.category || '').trim().toLowerCase();
          const desc = (exp.description || '').trim().toLowerCase();
          return (cat === 'ushina khata' || cat === 'ushina') && (desc === accNameClean || (!desc && (accIdx === 0 || baseList.length === 1)));
        })
        .map((exp, idx) => ({
          id: `live-secg-ushina-${exp.id !== undefined ? exp.id : idx}`,
          date: exp.date || selectedDate,
          amount: parseFloat(exp.amount) || 0,
          description: exp.description ? `Daily Entry Shift Expense (${selectedDate}) - ${exp.description}` : `Daily Entry Shift Expense (${selectedDate})`,
          isLive: true
        }));

      // 2. Live JAMA from Section D (Other Income)
      const liveJamaEntries = isShiftSavedJama ? [] : (otherIncomeEntries || [])
        .filter(inc => {
          const amt = parseFloat(inc.amount) || 0;
          if (amt <= 0) return false;
          let cat = (inc.category || '').trim().toLowerCase();
          const desc = (inc.description || '').trim().toLowerCase();
          const pName = (inc.partyName || '').trim().toLowerCase();
          const accId = (inc.accountId || '').trim().toLowerCase();

          // Direct account match by ID, Name or PartyName
          const isDirectMatch = (
            cat === accNameClean ||
            pName === accNameClean ||
            (accId && accId === accIdClean)
          );
          // Remarks or description contains account name
          const isDescMatch = desc === accNameClean;
          // Generic category match: category is "ushina khata", "ushina", or "other income"
          const isCategoryMatch = (
            (cat === 'ushina khata' || cat === 'ushina' || cat === 'other income') &&
            (desc === accNameClean || (!desc && (accIdx === 0 || baseList.length === 1)))
          );
          // Single account fallback: If only 1 Ushina account registered, any Section D entry routes here
          const isSingleAccountFallback = baseList.length === 1;

          return isDirectMatch || isDescMatch || isCategoryMatch || isSingleAccountFallback;
        })
        .map((inc, idx) => ({
          id: `live-secd-ushina-${inc.id !== undefined ? inc.id : idx}`,
          date: inc.date || selectedDate,
          amount: parseFloat(inc.amount) || 0,
          remarks: inc.description ? `${inc.description} (Daily Entry Other Income)` : `Daily Entry Other Income (${selectedDate})`,
          isLive: true
        }));

      const manualUdhar = (acc.udharEntries || []).filter(u => !u.isLive && !String(u.id).startsWith('live-secg-ushina-'));
      const manualJama = (acc.jamaEntries || []).filter(j => !j.isLive && !String(j.id).startsWith('live-secd-ushina-'));

      return {
        ...acc,
        jamaEntries: [...liveJamaEntries, ...manualJama],
        udharEntries: [...liveUdharEntries, ...manualUdhar]
      };
    });
  }, [ushinaAccounts, expenseEntries, otherIncomeEntries, selectedDate]);

  const effectiveExpenseCategories = useMemo(() => {
    const baseList = Array.isArray(expenseCategories) ? expenseCategories : [];
    if (baseList.length === 0) return [];

    return baseList.map(cat => {
      // Find matching Section G entries where category === 'Daily Pump Expenses' and description matches this category name
      const liveEntries = (expenseEntries || [])
        .filter(exp => exp.category === 'Daily Pump Expenses' && exp.description === cat.name && (parseFloat(exp.amount) || 0) > 0)
        .map((exp, idx) => ({
          id: `live-secg-cat-${exp.id !== undefined ? exp.id : idx}`,
          date: exp.date || selectedDate,
          amount: parseFloat(exp.amount) || 0,
          description: `Daily Entry Shift Expense (${selectedDate})`,
          paymentMode: 'Cash / Shift Drawer',
          isLive: true
        }));

      const manualEntries = (cat.entries || []).filter(e => !e.isLive && !String(e.id).startsWith('live-secg-cat-'));

      return {
        ...cat,
        entries: [...liveEntries, ...manualEntries]
      };
    });
  }, [expenseCategories, expenseEntries, selectedDate]);

  // --- TAB 1 COMPUTATIONS (USHINA KHATA) ---
  const filteredUshinaAccounts = useMemo(() => {
    if (!ushinaSearch.trim()) return effectiveUshinaAccounts;
    const q = ushinaSearch.toLowerCase();
    return effectiveUshinaAccounts.filter(
      acc =>
        (acc?.name || '').toLowerCase().includes(q) ||
        (acc?.category || '').toLowerCase().includes(q) ||
        (acc?.phone || '').includes(q)
    );
  }, [effectiveUshinaAccounts, ushinaSearch]);

  const selectedUshina = useMemo(() => {
    if (!effectiveUshinaAccounts || effectiveUshinaAccounts.length === 0 || !selectedUshinaId) return null;
    return effectiveUshinaAccounts.find(a => a.id === selectedUshinaId) || null;
  }, [effectiveUshinaAccounts, selectedUshinaId]);

  const ushinaStats = useMemo(() => {
    if (!selectedUshina) return { totalJama: 0, totalUdhar: 0, netBalance: 0, openingBal: 0 };
    const totalJama = (selectedUshina.jamaEntries || []).reduce((sum, j) => sum + (parseFloat(j.amount) || 0), 0);
    const openingBal = parseFloat(selectedUshina.openingBalance) || 0;
    const totalUdhar = openingBal + (selectedUshina.udharEntries || []).reduce((sum, u) => sum + (parseFloat(u.amount) || 0), 0);
    const netBalance = totalJama - totalUdhar;
    return { totalJama, totalUdhar, netBalance, openingBal };
  }, [selectedUshina]);

  // --- TAB 2 COMPUTATIONS (DAILY PUMP EXPENSES) ---
  const filteredExpenseCategories = useMemo(() => {
    if (!expenseSearch.trim()) return effectiveExpenseCategories;
    const q = expenseSearch.toLowerCase();
    return effectiveExpenseCategories.filter(
      cat => (cat?.name || '').toLowerCase().includes(q) || (cat?.category || '').toLowerCase().includes(q)
    );
  }, [effectiveExpenseCategories, expenseSearch]);

  const selectedExpenseCat = useMemo(() => {
    if (!effectiveExpenseCategories || effectiveExpenseCategories.length === 0 || !selectedExpenseCatId) return null;
    return effectiveExpenseCategories.find(c => c.id === selectedExpenseCatId) || null;
  }, [effectiveExpenseCategories, selectedExpenseCatId]);

  const expenseCatStats = useMemo(() => {
    if (!selectedExpenseCat) return { totalAmount: 0, count: 0 };
    const entries = selectedExpenseCat.entries || [];
    const totalAmount = entries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    return { totalAmount, count: entries.length };
  }, [selectedExpenseCat]);

  // --- TAB 3 COMPUTATIONS (OTHER EXPENSES) ---
  const effectiveOtherExpenses = useMemo(() => {
    const baseList = Array.isArray(otherExpenses) ? otherExpenses : [];

    // Live entries from Section G (Daily Entry) where category === 'Other Expenses'
    const liveEntries = (expenseEntries || [])
      .filter(exp => {
        const amt = parseFloat(exp.amount) || 0;
        if (amt <= 0) return false;
        const cat = (exp.category || '').trim().toLowerCase();
        return cat === 'other expenses' || cat === 'other expense';
      })
      .map((exp, idx) => ({
        id: `live-secg-otherexp-${exp.id !== undefined ? exp.id : idx}`,
        date: exp.date || selectedDate,
        remarks: exp.description ? `${exp.description} (Daily Entry Section G)` : `Daily Entry Other Expense (${selectedDate})`,
        amount: parseFloat(exp.amount) || 0,
        isLive: true
      }));

    const manualEntries = baseList.filter(e => !e.isLive && !String(e.id).startsWith('live-secg-otherexp-'));
    return [...liveEntries, ...manualEntries];
  }, [otherExpenses, expenseEntries, selectedDate]);

  const filteredOtherExpenses = useMemo(() => {
    if (!otherExpSearch.trim()) return effectiveOtherExpenses;
    const q = otherExpSearch.toLowerCase();
    return effectiveOtherExpenses.filter(e =>
      (e.remarks || '').toLowerCase().includes(q) ||
      (e.date || '').toLowerCase().includes(q) ||
      String(e.amount || '').includes(q)
    );
  }, [effectiveOtherExpenses, otherExpSearch]);

  const otherExpensesStats = useMemo(() => {
    const totalAmount = effectiveOtherExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const currentShiftTotal = effectiveOtherExpenses
      .filter(e => e.date === selectedDate)
      .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    return {
      totalAmount,
      currentShiftTotal,
      count: effectiveOtherExpenses.length
    };
  }, [effectiveOtherExpenses, selectedDate]);

  // --- USHINA KHATA HANDLERS ---
  const handleCreateUshinaAccount = async (e) => {
    e.preventDefault();
    if (!newAccount.name.trim()) return;

    const accObj = {
      id: `ush-${Date.now()}`,
      name: newAccount.name.trim(),
      category: newAccount.category || 'Daily Operations',
      phone: newAccount.phone.trim(),
      openingBalance: parseFloat(newAccount.openingBalance) || 0,
      jamaEntries: [],
      udharEntries: []
    };

    const updated = [...ushinaAccounts, accObj];
    setUshinaAccounts(updated);
    if (typeof updateUshinaDirectoryList === 'function') updateUshinaDirectoryList(updated);
    else if (typeof updateUshinaDirectory === 'function') updateUshinaDirectory(updated);
    setSelectedUshinaId(accObj.id);
    setShowNewAccountModal(false);
    setNewAccount({ name: '', category: 'Daily Operations', phone: '', openingBalance: 0 });

    await saveUshinaAccountsToDb(updated);
    showToast(`Created Ushina Account: ${accObj.name}`, 'success');
  };

  const handleDeleteUshinaAccount = async (id, e) => {
    if (e) e.stopPropagation();
    const updated = ushinaAccounts.filter(a => a.id !== id);
    setUshinaAccounts(updated);
    if (typeof updateUshinaDirectoryList === 'function') updateUshinaDirectoryList(updated);
    else if (typeof updateUshinaDirectory === 'function') updateUshinaDirectory(updated);
    if (selectedUshinaId === id || updated.length === 0) {
      setSelectedUshinaId(updated.length > 0 ? updated[0].id : null);
    }
    await saveUshinaAccountsToDb(updated);
    showToast('Deleted Ushina account', 'info');
  };

  const handleAddJamaEntry = async (e) => {
    e.preventDefault();
    if (!selectedUshina) return;
    const amt = parseFloat(entryAmount) || 0;
    if (amt <= 0) return;

    const jamaObj = {
      id: `j-${Date.now()}`,
      date: entryDate || selectedDate,
      amount: amt,
      remarks: entryRemarks.trim() || 'Payment Received'
    };

    const updated = ushinaAccounts.map(acc => {
      if (acc.id === selectedUshina.id) {
        return { ...acc, jamaEntries: [...(acc.jamaEntries || []), jamaObj] };
      }
      return acc;
    });

    setUshinaAccounts(updated);
    if (typeof updateUshinaDirectory === 'function') updateUshinaDirectory(updated);
    setShowJamaModal(false);
    setEntryAmount('');
    setEntryRemarks('');

    await saveUshinaAccountsToDb(updated);
    showToast(`Recorded Jama of ₹${amt.toLocaleString('en-IN')}`, 'success');
  };

  const handleAddUdharEntry = async (e) => {
    e.preventDefault();
    if (!selectedUshina) return;
    const amt = parseFloat(entryAmount) || 0;
    if (amt <= 0) return;

    const udharObj = {
      id: `u-${Date.now()}`,
      date: entryDate || selectedDate,
      amount: amt,
      description: entryRemarks.trim() || 'Expense / Advance'
    };

    const updated = ushinaAccounts.map(acc => {
      if (acc.id === selectedUshina.id) {
        return { ...acc, udharEntries: [...(acc.udharEntries || []), udharObj] };
      }
      return acc;
    });

    setUshinaAccounts(updated);
    if (typeof updateUshinaDirectory === 'function') updateUshinaDirectory(updated);
    setShowUdharModal(false);
    setEntryAmount('');
    setEntryRemarks('');

    await saveUshinaAccountsToDb(updated);
    showToast(`Recorded Udhar of ₹${amt.toLocaleString('en-IN')}`, 'success');
  };

  const handleDeleteJama = async (jamaId) => {
    if (!selectedUshina) return;
    if (String(jamaId).startsWith('live-secd-ushina-')) {
      showToast('This entry is live synced from Daily Entry Section D (Other Income). Remove it from Section D.', 'info');
      return;
    }
    const updated = ushinaAccounts.map(acc => {
      if (acc.id === selectedUshina.id) {
        return { ...acc, jamaEntries: (acc.jamaEntries || []).filter(j => j.id !== jamaId) };
      }
      return acc;
    });
    setUshinaAccounts(updated);
    if (typeof updateUshinaDirectory === 'function') updateUshinaDirectory(updated);
    await saveUshinaAccountsToDb(updated);
    showToast('Deleted Jama entry', 'info');
  };

  const handleDeleteUdhar = async (udharId) => {
    if (!selectedUshina) return;
    if (String(udharId).startsWith('live-secg-ushina-')) {
      showToast('This entry is live synced from Daily Entry Section G. Remove it from Section G.', 'info');
      return;
    }
    const updated = ushinaAccounts.map(acc => {
      if (acc.id === selectedUshina.id) {
        return { ...acc, udharEntries: (acc.udharEntries || []).filter(u => u.id !== udharId) };
      }
      return acc;
    });
    setUshinaAccounts(updated);
    if (typeof updateUshinaDirectory === 'function') updateUshinaDirectory(updated);
    await saveUshinaAccountsToDb(updated);
    showToast('Deleted Udhar entry', 'info');
  };

  // --- DAILY EXPENSES HANDLERS ---
  const handleCreateExpenseCategory = async (e) => {
    e.preventDefault();
    if (!newExpenseCat.name.trim()) return;

    const catObj = {
      id: `exp-cat-${Date.now()}`,
      name: newExpenseCat.name.trim(),
      category: newExpenseCat.category || 'Daily Operations',
      entries: []
    };

    const updated = [...expenseCategories, catObj];
    setExpenseCategories(updated);
    if (typeof updatePumpExpenseCategories === 'function') updatePumpExpenseCategories(updated);
    setSelectedExpenseCatId(catObj.id);
    setShowNewExpenseCatModal(false);
    setNewExpenseCat({ name: '', category: 'Daily Operations' });

    await saveExpenseCategoriesToDb(updated);
    showToast(`Added Expense Category: ${catObj.name}`, 'success');
  };

  const handleDeleteExpenseCategory = async (id, e) => {
    if (e) e.stopPropagation();
    const updated = expenseCategories.filter(c => c.id !== id);
    setExpenseCategories(updated);
    if (typeof updatePumpExpenseCategories === 'function') updatePumpExpenseCategories(updated);
    if (selectedExpenseCatId === id || updated.length === 0) {
      setSelectedExpenseCatId(updated.length > 0 ? updated[0].id : null);
    }
    await saveExpenseCategoriesToDb(updated);
    showToast('Deleted Expense Category', 'info');
  };

  const handleAddDirectExpenseEntry = async (e) => {
    e.preventDefault();
    if (!selectedExpenseCat) return;
    const amt = parseFloat(entryAmount) || 0;
    if (amt <= 0) return;

    const expObj = {
      id: `e-${Date.now()}`,
      date: entryDate || selectedDate,
      amount: amt,
      description: entryRemarks.trim() || selectedExpenseCat.name,
      paymentMode: entryPaymentMode || 'Cash'
    };

    const updated = expenseCategories.map(cat => {
      if (cat.id === selectedExpenseCat.id) {
        return { ...cat, entries: [...(cat.entries || []), expObj] };
      }
      return cat;
    });

    setExpenseCategories(updated);
    if (typeof updatePumpExpenseCategories === 'function') updatePumpExpenseCategories(updated);
    setShowAddExpenseModal(false);
    setEntryAmount('');
    setEntryRemarks('');

    await saveExpenseCategoriesToDb(updated);
    showToast(`Recorded Expense of ₹${amt.toLocaleString('en-IN')}`, 'success');
  };

  const handleDeleteExpenseEntry = async (expId) => {
    if (!selectedExpenseCat) return;
    if (String(expId).startsWith('live-secg-cat-')) {
      showToast('This entry is live synced from Daily Entry Section G. Remove it from Section G.', 'info');
      return;
    }
    const updated = expenseCategories.map(cat => {
      if (cat.id === selectedExpenseCat.id) {
        return { ...cat, entries: (cat.entries || []).filter(e => e.id !== expId) };
      }
      return cat;
    });
    setExpenseCategories(updated);
    if (typeof updatePumpExpenseCategories === 'function') updatePumpExpenseCategories(updated);
    await saveExpenseCategoriesToDb(updated);
    showToast('Deleted expense entry', 'info');
  };

  // --- TAB 3: OTHER EXPENSES HANDLERS ---
  const handleAddOtherExpense = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const amt = parseFloat(otherExpAmount) || 0;
    if (amt <= 0) {
      showToast('Please enter a valid expense amount', 'warning');
      return;
    }

    const newEntry = {
      id: `oe-${Date.now()}`,
      date: otherExpDate || selectedDate || new Date().toISOString().split('T')[0],
      remarks: otherExpRemarks.trim() || 'General Station Expense',
      amount: amt
    };

    const updated = [newEntry, ...otherExpenses];
    setOtherExpenses(updated);
    await saveOtherExpensesToDb(updated);
    setShowOtherExpModal(false);
    setOtherExpAmount('');
    setOtherExpRemarks('');
    showToast(`Recorded Other Expense of ₹${amt.toLocaleString('en-IN')}`, 'success');
  };

  const handleDeleteOtherExpense = async (id) => {
    if (String(id).startsWith('live-secg-otherexp-')) {
      showToast('This entry is live synced from Daily Entry Section G. Remove it from Section G.', 'info');
      return;
    }
    const updated = otherExpenses.filter(e => e.id !== id);
    setOtherExpenses(updated);
    await saveOtherExpensesToDb(updated);
    showToast('Deleted expense entry', 'info');
  };

  const handlePrintOtherExpensesPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(stationProfile?.fuelStationName || 'SHITAL PETROL PUMP', pageWidth / 2, 12, { align: 'center' });

      doc.setFontSize(11);
      doc.text('OTHER EXPENSES REGISTER', pageWidth / 2, 18, { align: 'center' });

      const body = effectiveOtherExpenses.map((e, i) => [
        i + 1,
        e.date,
        e.remarks || '-',
        `Rs. ${parseFloat(e.amount || 0).toLocaleString('en-IN')}`
      ]);
      body.push(['TOTAL OTHER EXPENSES', '', '', `Rs. ${otherExpensesStats.totalAmount.toLocaleString('en-IN')}`]);

      autoTable(doc, {
        startY: 25,
        head: [['#', 'DATE', 'REMARKS / DESCRIPTION', 'AMOUNT (Rs.)']],
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8 }
      });

      doc.save(`OTHER_EXPENSES_REGISTER.pdf`);
      showToast(`Generated Other Expenses PDF!`, 'success');
    } catch (err) {
      showToast('Error printing other expenses PDF: ' + err.message, 'error');
    }
  };

  // --- PDF PRINT & CSV EXPORTS ---
  const handlePrintUshinaPDF = () => {
    if (!selectedUshina) return;
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(stationProfile?.fuelStationName || 'SHITAL PETROL PUMP', pageWidth / 2, 12, { align: 'center' });

      doc.setFontSize(11);
      doc.text(`USHINA KHATA STATEMENT — ${selectedUshina.name.toUpperCase()}`, pageWidth / 2, 18, { align: 'center' });

      const jamaBody = (selectedUshina.jamaEntries || []).map((j, i) => [i + 1, j.date, `Rs. ${parseFloat(j.amount || 0).toLocaleString('en-IN')}`, j.remarks || '-']);
      if (jamaBody.length === 0) jamaBody.push(['-', '-', 'Rs. 0', 'No Jama entries']);
      jamaBody.push(['TOTAL JAMA', '', `Rs. ${ushinaStats.totalJama.toLocaleString('en-IN')}`, '']);

      const udharBody = [];
      if (ushinaStats.openingBal > 0) {
        udharBody.push(['Opening Bal', '-', `Rs. ${ushinaStats.openingBal.toLocaleString('en-IN')}`, 'Previous Udhar Carryforward']);
      }
      (selectedUshina.udharEntries || []).forEach((u, i) => {
        udharBody.push([i + 1, u.date, `Rs. ${parseFloat(u.amount || 0).toLocaleString('en-IN')}`, u.description || '-']);
      });
      if (udharBody.length === 0) udharBody.push(['-', '-', 'Rs. 0', 'No Udhar entries']);
      udharBody.push(['TOTAL UDHAR', '', `Rs. ${ushinaStats.totalUdhar.toLocaleString('en-IN')}`, '']);

      doc.setFont('helvetica', 'bold');
      doc.text('🟢 JAMA (CREDIT / RECEIVED):', 14, 28);
      autoTable(doc, {
        startY: 30,
        head: [['#', 'DATE', 'AMOUNT (Rs.)', 'REMARKS']],
        body: jamaBody,
        theme: 'grid',
        headStyles: { fillColor: [4, 120, 87], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8 }
      });

      const nextY = doc.lastAutoTable.finalY + 8;
      doc.text('🔴 UDHAR (DEBIT / EXPENSES):', 14, nextY);
      autoTable(doc, {
        startY: nextY + 2,
        head: [['#', 'DATE', 'AMOUNT (Rs.)', 'DESCRIPTION']],
        body: udharBody,
        theme: 'grid',
        headStyles: { fillColor: [190, 18, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8 }
      });

      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      if (ushinaStats.netBalance >= 0) {
        doc.setTextColor(4, 120, 87);
        doc.text(`NET CREDIT BALANCE (CHUKTI RAKAM): Rs. ${ushinaStats.netBalance.toLocaleString('en-IN')}`, 14, finalY);
      } else {
        doc.setTextColor(190, 18, 60);
        doc.text(`NET DEBIT BALANCE (BAKI UDHAR): Rs. ${Math.abs(ushinaStats.netBalance).toLocaleString('en-IN')}`, 14, finalY);
      }

      doc.save(`USHINA_KHATA_${selectedUshina.name.replace(/\s+/g, '_')}.pdf`);
      showToast(`Generated Statement PDF for ${selectedUshina.name}!`, 'success');
    } catch (err) {
      showToast('Error printing statement: ' + err.message, 'error');
    }
  };

  const handlePrintExpensePDF = () => {
    if (!selectedExpenseCat) return;
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(stationProfile?.fuelStationName || 'SHITAL PETROL PUMP', pageWidth / 2, 12, { align: 'center' });

      doc.setFontSize(11);
      doc.text(`DAILY PUMP EXPENSE REGISTER — ${selectedExpenseCat.name.toUpperCase()}`, pageWidth / 2, 18, { align: 'center' });

      const expBody = (selectedExpenseCat.entries || []).map((e, i) => [
        i + 1,
        e.date,
        `Rs. ${parseFloat(e.amount || 0).toLocaleString('en-IN')}`,
        e.description || '-',
        e.paymentMode || 'Cash'
      ]);
      expBody.push(['TOTAL EXPENSES', '', `Rs. ${expenseCatStats.totalAmount.toLocaleString('en-IN')}`, '', '']);

      autoTable(doc, {
        startY: 25,
        head: [['#', 'DATE', 'AMOUNT (Rs.)', 'DESCRIPTION / REASON', 'PAYMENT MODE']],
        body: expBody,
        theme: 'grid',
        headStyles: { fillColor: [190, 18, 60], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8 }
      });

      doc.save(`DAILY_EXPENSE_${selectedExpenseCat.name.replace(/\s+/g, '_')}.pdf`);
      showToast(`Generated Expense PDF for ${selectedExpenseCat.name}!`, 'success');
    } catch (err) {
      showToast('Error printing expense PDF: ' + err.message, 'error');
    }
  };

  if (loading) return <div className="p-8 text-center text-sm font-semibold text-slate-400">Loading Other Accounts...</div>;

  return (
    <div className="p-4 space-y-3.5 animate-fadeIn bg-[#0c121d] min-h-screen select-text font-sans text-slate-200">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#121927] p-3 rounded-xl border border-[#1e293b] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#0e1420] text-amber-400 border border-[#1b2537]">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-xs text-slate-100 flex items-center gap-2 tracking-wide">
              <span>Other Accounts (Vividh Khata Workspace)</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">
              Dual Jama-Udhar Ushina Khata & Daily Pump Direct Expense Registers
            </p>
          </div>
        </div>
      </div>

      {/* TOP SUB-TABS SWITCHER BAR */}
      <div className="flex items-center gap-2 border-b border-[#1e293b] pb-2.5">
        <button type="button"
          onClick={() => setActiveSubTab('ushina')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'ushina'
              ? 'bg-[#192438] text-white border-l-2 border-blue-500 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#131b29]'
          }`}
        >
          <span>🤝 Ushina Khata (Dual Jama-Udhar)</span>
          <span className="text-[10px] bg-[#0e1420] text-amber-300 font-mono font-bold px-1.5 py-0.5 rounded border border-[#1b2537]">
            {ushinaAccounts.length}
          </span>
        </button>

        <button type="button"
          onClick={() => setActiveSubTab('expenses')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'expenses'
              ? 'bg-[#192438] text-white border-l-2 border-blue-500 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#131b29]'
          }`}
        >
          <span>💸 Daily Pump Expenses (Kharach Khata)</span>
          <span className="text-[10px] bg-[#0e1420] text-rose-300 font-mono font-bold px-1.5 py-0.5 rounded border border-[#1b2537]">
            {expenseCategories.length}
          </span>
        </button>

        <button type="button"
          onClick={() => setActiveSubTab('other_expenses')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'other_expenses'
              ? 'bg-[#192438] text-white border-l-2 border-purple-500 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#131b29]'
          }`}
        >
          <span>📑 Other Expenses</span>
          <span className="text-[10px] bg-[#0e1420] text-purple-300 font-mono font-bold px-1.5 py-0.5 rounded border border-[#1b2537]">
            {effectiveOtherExpenses.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: USHINA KHATA (DUAL JAMA-UDHAR WORKSPACE) */}
      {/* ========================================================================= */}
      {activeSubTab === 'ushina' && (
        <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-220px)]">
          {/* 🗂️ LEFT PANEL: USHINA ACCOUNTS DIRECTORY (~32% Width) */}
          <div className="lg:w-[32%] shrink-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <span>🤝 USHINA DIRECTORY</span>
                </span>
                <button type="button"
                  onClick={() => setShowNewAccountModal(true)}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ New Account</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={ushinaSearch}
                  onChange={(e) => setUshinaSearch(e.target.value)}
                  placeholder="Search Ushina account name or phone..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 font-medium outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Ushina Accounts Roster List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[580px]">
              {ushinaAccounts.length === 0 ? (
                <div className="p-8 text-center text-xs font-semibold text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  No Ushina accounts found. Click <strong className="text-orange-600 font-bold cursor-pointer hover:underline" onClick={() => setShowNewAccountModal(true)}>'+ New Account'</strong> to add one.
                </div>
              ) : filteredUshinaAccounts.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-slate-400">
                  No accounts match search "{ushinaSearch}".
                </div>
              ) : (
                filteredUshinaAccounts.map((acc) => {
                  const isSelected = selectedUshina?.id === acc.id;
                  const jTotal = (acc.jamaEntries || []).reduce((s, j) => s + (parseFloat(j.amount) || 0), 0);
                  const uTotal = (parseFloat(acc.openingBalance) || 0) + (acc.udharEntries || []).reduce((s, u) => s + (parseFloat(u.amount) || 0), 0);
                  const bal = jTotal - uTotal;

                  return (
                    <div
                      key={acc.id}
                      onClick={() => setSelectedUshinaId(acc.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer select-none space-y-2 ${
                        isSelected
                          ? 'border-2 border-blue-500 bg-blue-50/40 shadow-xs ring-1 ring-blue-500'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 overflow-hidden">
                          <h4 className="font-extrabold text-xs text-slate-900 truncate">
                            {acc.name}
                          </h4>
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
                            <Tag className="w-3 h-3 text-slate-400" />
                            <span>{acc.category}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-full border ${
                            bal >= 0
                              ? 'bg-emerald-100/80 text-emerald-900 border-emerald-300'
                              : 'bg-rose-100/80 text-rose-900 border-rose-300'
                          }`}>
                            ₹ {Math.abs(bal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            <span className="text-[9px] ml-0.5">{bal >= 0 ? 'Cr' : 'Dr'}</span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteUshinaAccount(acc.id, e)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ⚖️ RIGHT PANEL: USHINA JAMA - UDHAR LEDGER WORKSPACE */}
          {selectedUshina && ushinaAccounts.length > 0 ? (
            <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 min-w-0">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-900">{selectedUshina.name}</h2>
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                      {selectedUshina.category}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-semibold flex items-center gap-2 mt-0.5">
                    {selectedUshina.phone && (
                      <>
                        <span>Contact: <strong className="text-slate-800 font-mono">{selectedUshina.phone}</strong></span>
                        <span className="text-slate-300">|</span>
                      </>
                    )}
                    <span>Opening Bal: <strong className="text-slate-800 font-mono">₹ {(selectedUshina.openingBalance || 0).toLocaleString('en-IN')}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={handlePrintUshinaPDF}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Print Statement</span>
                  </button>
                </div>
              </div>

              {/* 3 Summary Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
                  <div className="text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider">
                    🟢 TOTAL JAMA (CREDIT)
                  </div>
                  <div className="font-mono text-lg font-black text-emerald-950">
                    ₹ {ushinaStats.totalJama.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 space-y-1">
                  <div className="text-[11px] font-extrabold text-rose-800 uppercase tracking-wider">
                    🔴 TOTAL UDHAR (DEBIT)
                  </div>
                  <div className="font-mono text-lg font-black text-rose-950">
                    ₹ {ushinaStats.totalUdhar.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                </div>

                <div className={`p-3 rounded-2xl border-2 space-y-1 ${
                  ushinaStats.netBalance >= 0 ? 'bg-emerald-100/60 border-emerald-400 text-emerald-950' : 'bg-rose-100/60 border-rose-400 text-rose-950'
                }`}>
                  <div className="text-[11px] font-black uppercase tracking-wider">
                    ⚖️ NET BALANCE
                  </div>
                  <div className="font-mono text-xl font-black">
                    ₹ {Math.abs(ushinaStats.netBalance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>

              {/* 2-Column Split Table */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
                {/* Jama Side */}
                <div className="bg-emerald-50/20 border border-emerald-200/80 rounded-2xl p-3 space-y-2.5 flex flex-col">
                  <div className="flex items-center justify-between bg-emerald-100/80 p-2.5 rounded-xl border border-emerald-200">
                    <span className="font-extrabold text-xs text-emerald-950 uppercase tracking-wide">
                      🟢 JAMA (CREDIT / RECEIVED)
                    </span>
                    <button type="button"
                      onClick={() => { setEntryDate(selectedDate || new Date().toISOString().split('T')[0]); setEntryAmount(''); setEntryRemarks(''); setShowJamaModal(true); }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1 rounded-lg transition-all cursor-pointer"
                    >
                      + Add Jama
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-emerald-200 bg-white flex-1 min-h-[200px]">
                    <table className="w-full text-left border-collapse font-sans text-xs">
                      <thead>
                        <tr className="bg-emerald-100/90 text-emerald-950 text-[11px] font-extrabold uppercase border-b border-emerald-200">
                          <th className="p-2 border-r border-emerald-200 w-8 text-center font-mono">#</th>
                          <th className="p-2 border-r border-emerald-200 w-24">DATE</th>
                          <th className="p-2 border-r border-emerald-200 text-right w-24 font-mono">AMOUNT (₹)</th>
                          <th className="p-2 border-r border-emerald-200">REMARKS</th>
                          <th className="p-2 text-center w-10">ACT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100 font-semibold select-text">
                        {(selectedUshina.jamaEntries || []).length === 0 ? (
                          <tr><td colSpan="5" className="p-6 text-center text-emerald-500 font-mono text-xs">No Jama entries recorded</td></tr>
                        ) : (
                          (selectedUshina.jamaEntries || []).map((j, idx) => (
                            <tr key={j.id || idx} className="hover:bg-emerald-50/50">
                              <td className="p-2 text-center font-mono font-bold text-emerald-800 border-r border-emerald-100">{idx + 1}</td>
                              <td className="p-2 font-mono font-bold text-slate-700 border-r border-emerald-100">
                                {j.date}
                                {j.isLive && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">LIVE</span>}
                              </td>
                              <td className="p-2 text-right font-mono font-extrabold text-emerald-950 border-r border-emerald-100">₹ {parseFloat(j.amount || 0).toLocaleString('en-IN')}</td>
                              <td className="p-2 text-slate-800 font-medium border-r border-emerald-100">{j.remarks}</td>
                              <td className="p-2 text-center">
                                <button type="button" onClick={() => handleDeleteJama(j.id)} className="p-1 text-rose-400 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Udhar Side */}
                <div className="bg-rose-50/20 border border-rose-200/80 rounded-2xl p-3 space-y-2.5 flex flex-col">
                  <div className="flex items-center justify-between bg-rose-100/80 p-2.5 rounded-xl border border-rose-200">
                    <span className="font-extrabold text-xs text-rose-950 uppercase tracking-wide">
                      🔴 UDHAR (DEBIT / EXPENSES)
                    </span>
                    <button type="button"
                      onClick={() => { setEntryDate(selectedDate || new Date().toISOString().split('T')[0]); setEntryAmount(''); setEntryRemarks(''); setShowUdharModal(true); }}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3 py-1 rounded-lg transition-all cursor-pointer"
                    >
                      + Add Udhar
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-rose-200 bg-white flex-1 min-h-[200px]">
                    <table className="w-full text-left border-collapse font-sans text-xs">
                      <thead>
                        <tr className="bg-rose-100/90 text-rose-950 text-[11px] font-extrabold uppercase border-b border-rose-200">
                          <th className="p-2 border-r border-rose-200 w-8 text-center font-mono">#</th>
                          <th className="p-2 border-r border-rose-200 w-24">DATE</th>
                          <th className="p-2 border-r border-rose-200 text-right w-24 font-mono">AMOUNT (₹)</th>
                          <th className="p-2 border-r border-rose-200">DESCRIPTION</th>
                          <th className="p-2 text-center w-10">ACT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100 font-semibold select-text">
                        {ushinaStats.openingBal > 0 && (
                          <tr className="bg-amber-50/60 font-bold border-b border-rose-200">
                            <td className="p-1.5 text-center font-mono text-amber-800 border-r border-rose-200">★</td>
                            <td className="p-1.5 border-r border-rose-200 font-mono text-slate-700">Opening Bal</td>
                            <td className="p-1.5 border-r border-rose-200 text-right font-mono font-black text-rose-800">₹ {ushinaStats.openingBal.toLocaleString('en-IN')}</td>
                            <td className="p-1.5 border-r border-rose-200 text-slate-600 text-xs italic">Previous Carryforward</td>
                            <td className="p-1.5 text-center text-slate-400">—</td>
                          </tr>
                        )}
                        {(selectedUshina.udharEntries || []).length === 0 && ushinaStats.openingBal === 0 ? (
                          <tr><td colSpan="5" className="p-6 text-center text-rose-400 font-mono text-xs">No Udhar entries recorded</td></tr>
                        ) : (
                          (selectedUshina.udharEntries || []).map((u, idx) => (
                            <tr key={u.id || idx} className="hover:bg-rose-50/50">
                              <td className="p-2 text-center font-mono font-bold text-rose-800 border-r border-rose-100">{idx + 1}</td>
                              <td className="p-2 font-mono font-bold text-slate-700 border-r border-rose-100">
                                {u.date}
                                {u.isLive && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">LIVE</span>}
                              </td>
                              <td className="p-2 text-right font-mono font-extrabold text-rose-950 border-r border-rose-100">₹ {parseFloat(u.amount || 0).toLocaleString('en-IN')}</td>
                              <td className="p-2 text-slate-800 font-medium border-r border-rose-100">{u.description}</td>
                              <td className="p-2 text-center">
                                <button type="button" onClick={() => handleDeleteUdhar(u.id)} className="p-1 text-rose-400 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center p-8 text-center text-slate-500 shadow-sm min-h-[400px]">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400 border border-slate-200">
                <Receipt className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-700">No Account Selected</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Select an Ushina account or click '+ New Account' to view dual Jama-Udhar ledger.
              </p>
              <button
                type="button"
                onClick={() => setShowNewAccountModal(true)}
                className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New Account</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DAILY PUMP EXPENSES (SINGLE-SIDED EXPENSE WORKSPACE) */}
      {/* ========================================================================= */}
      {activeSubTab === 'expenses' && (
        <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-220px)]">
          {/* 🗂️ LEFT PANEL: EXPENSE CATEGORIES DIRECTORY (~32% Width) */}
          <div className="lg:w-[32%] shrink-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <span>💸 EXPENSE CATEGORIES</span>
                </span>
                <button type="button"
                  onClick={() => setShowNewExpenseCatModal(true)}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ New Category</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  placeholder="Search expense category..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 font-medium outline-none focus:border-rose-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Expense Categories Roster List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[580px]">
              {expenseCategories.length === 0 ? (
                <div className="p-8 text-center text-xs font-semibold text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  No expense categories found. Click <strong className="text-rose-600 font-bold cursor-pointer hover:underline" onClick={() => setShowNewExpenseCatModal(true)}>'+ New Category'</strong> to add one.
                </div>
              ) : filteredExpenseCategories.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-slate-400">
                  No expense categories match search "{expenseSearch}".
                </div>
              ) : (
                filteredExpenseCategories.map((cat) => {
                  const isSelected = selectedExpenseCat?.id === cat.id;
                  const catTotal = (cat.entries || []).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

                  return (
                    <div
                      key={cat.id}
                      onClick={() => setSelectedExpenseCatId(cat.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer select-none space-y-2 ${
                        isSelected
                          ? 'border-2 border-rose-500 bg-rose-50/40 shadow-xs ring-1 ring-rose-500'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 overflow-hidden">
                          <h4 className="font-extrabold text-xs text-slate-900 truncate">
                            {cat.name}
                          </h4>
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold">
                            <Tag className="w-3 h-3 text-slate-400" />
                            <span>{cat.category}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-mono font-black text-xs px-2 py-0.5 rounded-full border bg-rose-100/80 text-rose-950 border-rose-300">
                            ₹ {catTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteExpenseCategory(cat.id, e)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete Category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 🔴 RIGHT PANEL: SINGLE-SIDED EXPENSE REGISTER WORKSPACE (Flex-1) */}
          {selectedExpenseCat && expenseCategories.length > 0 ? (
            <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 min-w-0">
              
              {/* Expense Category Top Header Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-900">{selectedExpenseCat.name}</h2>
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                      {selectedExpenseCat.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Direct Pump Daily Expense Register (Single-Sided Kharach Khata)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={handlePrintExpensePDF}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Print Statement</span>
                  </button>
                </div>
              </div>

              {/* 2 Top Financial Summary Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 space-y-1">
                  <div className="text-[11px] font-extrabold text-rose-800 uppercase tracking-wider">
                    🔴 TOTAL EXPENSE AMOUNT
                  </div>
                  <div className="font-mono text-2xl font-black text-rose-950">
                    ₹ {expenseCatStats.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                    📝 TOTAL ENTRIES
                  </div>
                  <div className="font-mono text-2xl font-black text-slate-900">
                    {expenseCatStats.count} Recorded Logs
                  </div>
                </div>
              </div>

              {/* Full-Width Single Expense Table */}
              <div className="bg-rose-50/20 border border-rose-200/80 rounded-2xl p-3.5 space-y-3 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between bg-rose-100/80 p-2.5 rounded-xl border border-rose-200 shrink-0">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-rose-700" />
                    <h4 className="font-extrabold text-xs text-rose-950 uppercase tracking-wide">
                      🔴 EXPENSE LOG / KHARACH REGISTER — <span className="text-slate-700 font-normal">{selectedExpenseCat.name}</span>
                    </h4>
                  </div>

                  <button type="button"
                    onClick={() => {
                      setEntryDate(selectedDate || new Date().toISOString().split('T')[0]);
                      setEntryAmount('');
                      setEntryRemarks('');
                      setEntryPaymentMode('Cash');
                      setShowAddExpenseModal(true);
                    }}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Add Expense</span>
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-rose-200 shadow-2xs bg-white flex-1 min-h-[260px]">
                  <table className="w-full text-left border-collapse font-sans text-xs">
                    <thead>
                      <tr className="bg-rose-100/90 text-rose-950 text-[11px] font-extrabold uppercase tracking-wider border-b border-rose-200">
                        <th className="p-2.5 border-r border-rose-200 w-10 text-center font-mono">#</th>
                        <th className="p-2.5 border-r border-rose-200 w-32">DATE</th>
                        <th className="p-2.5 border-r border-rose-200 text-right w-36 font-mono">AMOUNT (₹)</th>
                        <th className="p-2.5 border-r border-rose-200">DESCRIPTION / REASON</th>
                        <th className="p-2.5 border-r border-rose-200 w-32 text-center">PAYMENT MODE</th>
                        <th className="p-2.5 text-center w-12">ACT</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-rose-100 font-semibold select-text">
                      {(selectedExpenseCat.entries || []).length === 0 ? (
                        <tr>
                          <td colSpan="6" className="p-8 text-center text-rose-400 font-mono text-xs">
                            No expenses recorded for {selectedExpenseCat.name}. Click <strong>"+ Add Expense"</strong> to log an expense.
                          </td>
                        </tr>
                      ) : (
                        (selectedExpenseCat.entries || []).map((e, idx) => (
                          <tr key={e.id || idx} className="hover:bg-rose-50/50 transition-colors">
                            <td className="p-2.5 text-center bg-rose-50/40 font-mono font-extrabold text-rose-800 border-r border-rose-200">
                              {idx + 1}
                            </td>
                            <td className="p-2.5 font-mono font-bold text-slate-700 border-r border-rose-200">
                              {e.date}
                              {e.isLive && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">LIVE</span>}
                            </td>
                            <td className="p-2.5 text-right font-mono font-extrabold text-rose-950 border-r border-rose-200 bg-rose-50/30">
                              ₹ {parseFloat(e.amount || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="p-2.5 text-slate-900 font-medium border-r border-rose-200">
                              {e.description}
                            </td>
                            <td className="p-2.5 text-center border-r border-rose-200 font-mono font-bold text-xs text-slate-700">
                              <span className="bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full">
                                {e.paymentMode || 'Cash'}
                              </span>
                            </td>
                            <td className="p-2.5 text-center">
                              <button type="button"
                                onClick={() => handleDeleteExpenseEntry(e.id)}
                                className="p-1 rounded text-rose-400 hover:text-rose-700 hover:bg-rose-100 transition-colors"
                                title="Delete Expense Entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>

                    <tfoot className="bg-rose-100/90 border-t-2 border-rose-300 font-mono text-xs select-text">
                      <tr>
                        <td colSpan="2" className="p-2.5 text-right font-black text-rose-950 uppercase font-sans border-r border-rose-300">
                          TOTAL EXPENSES:
                        </td>
                        <td className="p-2.5 text-right font-black text-rose-950 text-sm bg-rose-200/70 border-r border-rose-300">
                          ₹ {expenseCatStats.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </td>
                        <td colSpan="3" className="p-2.5"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center p-8 text-center text-slate-500 shadow-sm min-h-[400px]">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400 border border-slate-200">
                <Receipt className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-700">No Category Selected</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Select an expense category or click '+ New Category' to view expense register.
              </p>
              <button
                type="button"
                onClick={() => setShowNewExpenseCatModal(true)}
                className="mt-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New Category</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: OTHER EXPENSES REGISTER WORKSPACE */}
      {/* ========================================================================= */}
      {activeSubTab === 'other_expenses' && (
        <div className="flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 min-h-[calc(100vh-220px)] animate-fadeIn">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <h2 className="text-base font-black text-slate-900">Other Expenses Register</h2>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
                  General Station Kharch
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Miscellaneous, ad-hoc, and non-categorized pump operational expenses
              </p>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={otherExpSearch}
                  onChange={(e) => setOtherExpSearch(e.target.value)}
                  placeholder="Search remarks, date, amount..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 font-medium outline-none focus:border-purple-500 focus:bg-white transition-all"
                />
              </div>

              <button
                type="button"
                onClick={handlePrintOtherExpensesPDF}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-xs px-3 py-2 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Print Other Expenses Register PDF"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden md:inline">Print PDF</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOtherExpDate(selectedDate || new Date().toISOString().split('T')[0]);
                  setOtherExpAmount('');
                  setOtherExpRemarks('');
                  setShowOtherExpModal(true);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Expense</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-900">
                TOTAL OTHER EXPENSES
              </span>
              <div className="text-xl font-mono font-black text-purple-950 mt-1">
                ₹ {otherExpensesStats.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                ACTIVE SHIFT ({selectedDate || 'Today'})
              </span>
              <div className="text-xl font-mono font-black text-slate-800 mt-1">
                ₹ {otherExpensesStats.currentShiftTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                TOTAL ENTRIES
              </span>
              <div className="text-xl font-mono font-black text-slate-800 mt-1">
                {otherExpensesStats.count} <span className="text-xs font-sans font-medium text-slate-500">records</span>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="flex-1 overflow-x-auto rounded-xl border border-slate-200 bg-white min-h-[350px]">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <thead>
                <tr className="bg-purple-100/80 text-purple-950 text-[11px] font-extrabold uppercase border-b border-purple-200">
                  <th className="p-2.5 border-r border-purple-200 w-12 text-center font-mono">#</th>
                  <th className="p-2.5 border-r border-purple-200 w-36">DATE</th>
                  <th className="p-2.5 border-r border-purple-200">REMARKS / DESCRIPTION</th>
                  <th className="p-2.5 border-r border-purple-200 text-right w-36 font-mono">AMOUNT (₹)</th>
                  <th className="p-2.5 text-center w-16">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold select-text">
                {filteredOtherExpenses.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <FileText className="w-8 h-8 text-slate-300" />
                        <p className="text-xs font-semibold text-slate-500">
                          {otherExpSearch ? `No other expenses matching "${otherExpSearch}"` : 'No other expenses recorded yet.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setOtherExpDate(selectedDate || new Date().toISOString().split('T')[0]);
                            setOtherExpAmount('');
                            setOtherExpRemarks('');
                            setShowOtherExpModal(true);
                          }}
                          className="mt-2 text-xs font-bold text-purple-600 hover:text-purple-700 underline cursor-pointer"
                        >
                          + Record First Expense
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredOtherExpenses.map((e, idx) => (
                    <tr key={e.id || idx} className="hover:bg-purple-50/40 transition-colors">
                      <td className="p-2.5 text-center font-mono font-bold text-purple-900 border-r border-slate-100">
                        {idx + 1}
                      </td>
                      <td className="p-2.5 font-mono font-bold text-slate-700 border-r border-slate-100 whitespace-nowrap">
                        {e.date}
                        {e.isLive && (
                          <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                            LIVE
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-900 font-medium border-r border-slate-100">
                        {e.remarks || e.description || '-'}
                      </td>
                      <td className="p-2.5 text-right font-mono font-black text-rose-700 text-xs sm:text-sm border-r border-slate-100">
                        ₹ {parseFloat(e.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteOtherExpense(e.id)}
                          className="p-1 rounded text-rose-400 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Expense Entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              <tfoot className="bg-purple-100/90 border-t-2 border-purple-300 font-mono text-xs select-text">
                <tr>
                  <td colSpan="3" className="p-2.5 text-right font-black text-purple-950 uppercase font-sans border-r border-purple-300">
                    TOTAL OTHER EXPENSES:
                  </td>
                  <td className="p-2.5 text-right font-black text-purple-950 text-sm bg-purple-200/70 border-r border-purple-300">
                    ₹ {otherExpensesStats.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-2.5"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE NEW USHINA ACCOUNT */}
      {showNewAccountModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-text">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-orange-600" />
                <h3 className="text-base font-extrabold text-slate-900">Create New Ushina Khata Account</h3>
              </div>
              <button type="button" onClick={() => setShowNewAccountModal(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleCreateUshinaAccount(e); }} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Account Name / Title *</label>
                <input
                  type="text" required placeholder="e.g. Electrician Patel, Generator Fuel Khata"
                  value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Account Category *</label>
                <select
                  value={newAccount.category} onChange={(e) => setNewAccount({ ...newAccount, category: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold focus:border-blue-500"
                >
                  {ACCOUNT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Phone / Mobile Number</label>
                <input
                  type="tel" maxLength={10} placeholder="e.g. 9876543210"
                  value={newAccount.phone} onChange={(e) => setNewAccount({ ...newAccount, phone: e.target.value.replace(/\D/g, '') })}
                  className="w-full bg-white text-slate-900 font-mono border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Opening Balance (₹) [Udhar Carryforward]</label>
                <input
                  type="number" placeholder="0.00"
                  value={newAccount.openingBalance || ''} onChange={(e) => setNewAccount({ ...newAccount, openingBalance: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white text-slate-900 font-mono border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-bold text-right focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowNewAccountModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white font-bold shadow-md cursor-pointer">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE NEW EXPENSE CATEGORY */}
      {showNewExpenseCatModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-text">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-extrabold text-slate-900">Add New Expense Category</h3>
              </div>
              <button type="button" onClick={() => setShowNewExpenseCatModal(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleCreateExpenseCategory(e); }} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Expense Title / Category Name *</label>
                <input
                  type="text" required placeholder="e.g. Tea & Refreshment, Cleaning Supplies"
                  value={newExpenseCat.name} onChange={(e) => setNewExpenseCat({ ...newExpenseCat, name: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category Type *</label>
                <select
                  value={newExpenseCat.category} onChange={(e) => setNewExpenseCat({ ...newExpenseCat, category: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold focus:border-rose-500"
                >
                  <option value="Daily Operations">Daily Operations</option>
                  <option value="Power & Fuel">Power & Fuel</option>
                  <option value="Utility Bills">Utility Bills</option>
                  <option value="Office Supplies">Office Supplies</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowNewExpenseCatModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md cursor-pointer">Add Category</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD JAMA ENTRY */}
      {showJamaModal && selectedUshina && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-text">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-extrabold text-slate-900">Add Jama — {selectedUshina.name}</h3>
              </div>
              <button type="button" onClick={() => setShowJamaModal(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleAddJamaEntry(e); }} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date *</label>
                <input type="date" required value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="w-full bg-white text-slate-900 font-mono border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Jama Amount (₹) *</label>
                <NumericInput required step="10" value={entryAmount} onChange={(v) => setEntryAmount(v)} placeholder="0.00" className="w-full bg-white text-emerald-950 font-mono font-extrabold border border-slate-300 rounded-xl px-3.5 py-2 text-base text-right" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Remarks / Bill / Payment Mode</label>
                <input type="text" placeholder="e.g. Cash payment cleared" value={entryRemarks} onChange={(e) => setEntryRemarks(e.target.value)} className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium" />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowJamaModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md cursor-pointer">Save Jama</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD UDHAR ENTRY */}
      {showUdharModal && selectedUshina && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-text">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-extrabold text-slate-900">Add Udhar — {selectedUshina.name}</h3>
              </div>
              <button type="button" onClick={() => setShowUdharModal(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleAddUdharEntry(e); }} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date *</label>
                <input type="date" required value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="w-full bg-white text-slate-900 font-mono border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Udhar Amount (₹) *</label>
                <NumericInput required step="10" value={entryAmount} onChange={(v) => setEntryAmount(v)} placeholder="0.00" className="w-full bg-white text-rose-950 font-mono font-extrabold border border-slate-300 rounded-xl px-3.5 py-2 text-base text-right" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Description / Reason</label>
                <input type="text" placeholder="e.g. Staff daily tea & breakfast" value={entryRemarks} onChange={(e) => setEntryRemarks(e.target.value)} className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium" />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowUdharModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md cursor-pointer">Save Udhar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: ADD DIRECT PUMP EXPENSE ENTRY */}
      {showAddExpenseModal && selectedExpenseCat && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-text">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-extrabold text-slate-900">Add Expense — {selectedExpenseCat.name}</h3>
              </div>
              <button type="button" onClick={() => setShowAddExpenseModal(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleAddDirectExpenseEntry(e); }} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Expense Date *</label>
                <input type="date" required value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="w-full bg-white text-slate-900 font-mono border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Expense Amount (₹) *</label>
                <NumericInput required step="10" value={entryAmount} onChange={(v) => setEntryAmount(v)} placeholder="0.00" className="w-full bg-white text-rose-950 font-mono font-extrabold border border-slate-300 rounded-xl px-3.5 py-2 text-base text-right" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Description / Reason *</label>
                <input type="text" required placeholder="e.g. Tea & breakfast, Generator diesel refill" value={entryRemarks} onChange={(e) => setEntryRemarks(e.target.value)} className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Payment Mode</label>
                <select value={entryPaymentMode} onChange={(e) => setEntryPaymentMode(e.target.value)} className="w-full bg-white text-slate-900 font-bold border border-slate-300 rounded-xl px-3.5 py-2 text-xs">
                  <option value="Cash">Cash</option>
                  <option value="Online UPI">Online UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowAddExpenseModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md cursor-pointer">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL 6: ADD OTHER EXPENSE */}
      {showOtherExpModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-text">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-extrabold text-slate-900">Record Other Expense</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOtherExpModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddOtherExpense} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Expense Date</label>
                <input
                  type="date"
                  value={otherExpDate}
                  onChange={(e) => setOtherExpDate(e.target.value)}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium focus:border-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Amount (₹) *</label>
                <NumericInput
                  placeholder="0.00"
                  value={otherExpAmount}
                  onChange={(val) => setOtherExpAmount(val)}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-black font-mono focus:border-purple-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Remarks / Description *</label>
                <input
                  type="text"
                  placeholder="e.g. Nagar Palika Tax, Printer Paper, Tea for Audit Team"
                  value={otherExpRemarks}
                  onChange={(e) => setOtherExpRemarks(e.target.value)}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium focus:border-purple-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowOtherExpModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md cursor-pointer"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
