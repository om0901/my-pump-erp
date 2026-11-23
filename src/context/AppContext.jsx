import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { db, seedSampleData } from '../db/database';
import { syncSectionBToLubricants, getShiftSnapshotForDate, getLatestPreviousShiftSnapshot, saveShiftSnapshotToArchive, syncDailyEntryToModules } from '../db/storageService';
import { getMasterBankAccounts, saveMasterBankAccounts, DEFAULT_PUMP_BANKS } from '../utils/bankMaster';
import { getMasterParties, saveMasterParties } from '../utils/partyMaster';
import { useAuth } from './AuthContext';
import { syncStationDataToCloud, pullStationDataFromCloud } from '../services/supabaseSyncService';
import { fetchUserStationData, upsertUserStationData } from '../services/dbStorageService';
import { supabase } from '../lib/supabaseClient';

const AppContext = createContext();

export const DEFAULT_STATION_PROFILE = {
  fuelStationName: 'SHITAL PETROL PUMP',
  gstin: '24AAAAA0000A1Z5',
  address: 'State Highway, Kheralu, Mehsana, Gujarat 384325',
  phone: '+91 98790 12345',
  email: 'station@mypump.com',
  ownerName: 'Owner',
  managerName: 'Shift Manager',
  openingShreeSilak: 50000
};

export const DEFAULT_PRODUCT_CATALOG = [
  {
    category: "Fuels (OMC)",
    items: [
      { id: "fuel-1", name: "Petrol (MS)", defaultUnit: "Liter", defaultTax: "VAT", defaultVat: 13.7, defaultGst: 0, defaultVolume: 1.0, defaultPrice: 94.48 },
      { id: "fuel-2", name: "Diesel (HSD)", defaultUnit: "Liter", defaultTax: "VAT", defaultVat: 14.9, defaultGst: 0, defaultVolume: 1.0, defaultPrice: 90.16 },
      { id: "fuel-3", name: "Speed / Power (Premium)", defaultUnit: "Liter", defaultTax: "VAT", defaultVat: 13.7, defaultGst: 0, defaultVolume: 1.0, defaultPrice: 104.50 },
      { id: "fuel-4", name: "CNG", defaultUnit: "KG", defaultTax: "VAT", defaultVat: 5.0, defaultGst: 0, defaultVolume: 1.0, defaultPrice: 75.80 }
    ]
  },
  {
    category: "Lubricants & Engine Oils",
    items: [
      { id: "lub-1", name: "2T Engine Oil (Pouches/Bottles)", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0, defaultVolume: 0.04, defaultPrice: 15 },
      { id: "lub-2", name: "4T 20W-40 Bike Oil", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0, defaultVolume: 1.0, defaultPrice: 380 },
      { id: "lub-3", name: "15W-40 Heavy Diesel Engine Oil", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0, defaultVolume: 1.0, defaultPrice: 420 },
      { id: "lub-4", name: "Gear Oil EP 90/140", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0, defaultVolume: 1.0, defaultPrice: 350 },
      { id: "lub-5", name: "Grease AP3 / MP", defaultUnit: "KG", defaultTax: "GST", defaultGst: 18, defaultVat: 0, defaultVolume: 1.0, defaultPrice: 280 },
      { id: "lub-6", name: "2T Oil Pouch 40ml", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0, defaultVolume: 0.04, defaultPrice: 15 },
      { id: "lub-7", name: "2T Oil 500ml Can", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0, defaultVolume: 0.50, defaultPrice: 180 },
      { id: "lub-8", name: "Servo Super 4T (1L)", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0, defaultVolume: 1.00, defaultPrice: 380 }
    ]
  },
  {
    category: "Additives & Specialties",
    items: [
      { id: "sp-1", name: "DEF / AdBlue (EcoClean)", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0, defaultVolume: 1.0, defaultPrice: 65 },
      { id: "sp-2", name: "Distilled Water", defaultUnit: "Bottle", defaultTax: "GST", defaultGst: 18, defaultVat: 0, defaultVolume: 1.0, defaultPrice: 20 }
    ]
  }
];

export const DEFAULT_BANK_ACCOUNTS = DEFAULT_PUMP_BANKS;

export const DEFAULT_USHINA_DIRECTORY = [
  { id: 'ush-1', name: 'Ramesh Patel (Staff)', category: 'Staff & Partner Upad', phone: '9879011223', openingBalance: 0, jamaEntries: [], udharEntries: [] },
  { id: 'ush-2', name: 'Chaganbhai Driver', category: 'Vendor / Supplier', phone: '9428055443', openingBalance: 0, jamaEntries: [], udharEntries: [] },
  { id: 'ush-3', name: 'Mahesh Service Station', category: 'Maintenance & Repairs', phone: '9825066778', openingBalance: 0, jamaEntries: [], udharEntries: [] }
];

export const DEFAULT_PUMP_EXPENSE_CATEGORIES = [
  { id: 'exp-cat-1', name: 'Tea & Refreshment', category: 'Daily Operations', entries: [] },
  { id: 'exp-cat-2', name: 'Generator Diesel', category: 'Power & Fuel', entries: [] },
  { id: 'exp-cat-3', name: 'Electricity & Utilities', category: 'Utility Bills', entries: [] },
  { id: 'exp-cat-4', name: 'Stationery & Office', category: 'Office Supplies', entries: [] },
  { id: 'exp-cat-5', name: 'Maintenance & Repairs', category: 'Maintenance', entries: [] },
  { id: 'exp-cat-6', name: 'Miscellaneous Staff Kharch', category: 'Miscellaneous', entries: [] }
];

export function AppProvider({ children }) {
  // AuthContext is available here because AppProvider is nested inside AuthProvider
  const { currentUser, setCurrentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('master-sheet');
  const isDarkMode = false;
  const getTodayDateStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const [selectedDate, setSelectedDate] = useState(getTodayDateStr);
  const [activeShift, setActiveShift] = useState('Day Shift (Morning 6am - 6pm)');
  const [dbReady, setDbReady] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [isLocked, setIsLocked] = useState(false);

  // --- IN-MEMORY FUEL STOCK PATRAK STATE & ADVANCEMENT SIMULATION ---
  const [fuelStockState, setFuelStockState] = useState(() => ({
    'PETROL (MS)': {
      openingStock: 10000,
      receivedStock: 0,
      salesLitres: 0,
      totalStock: 10000,
      closingStock: 10000
    },
    'DIESEL (HSD)': {
      openingStock: 10000,
      receivedStock: 0,
      salesLitres: 0,
      totalStock: 10000,
      closingStock: 10000
    },
    'SMART FUEL': {
      openingStock: 10000,
      receivedStock: 0,
      salesLitres: 0,
      totalStock: 10000,
      closingStock: 10000
    }
  }));

  const [stockLedgerHistory, setStockLedgerHistory] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      'PETROL (MS)': [
        { id: 'ms-init', date: today, openingStock: 10000, receiveStock: 0, totalStock: 10000, sellStock: 0, closingStock: 10000, isFinalized: false }
      ],
      'DIESEL (HSD)': [
        { id: 'hsd-init', date: today, openingStock: 10000, receiveStock: 0, totalStock: 10000, sellStock: 0, closingStock: 10000, isFinalized: false }
      ],
      'SMART FUEL': [
        { id: 'smart-init', date: today, openingStock: 10000, receiveStock: 0, totalStock: 10000, sellStock: 0, closingStock: 10000, isFinalized: false }
      ]
    };
  });

  const normalizeFuelKey = (name) => {
    const n = (name || '').toUpperCase();
    if (n.includes('PETROL') || n.includes('MS') || n.includes('MOTOR SPIRIT')) return 'PETROL (MS)';
    if (n.includes('DIESEL') || n.includes('HSD')) return 'DIESEL (HSD)';
    if (n.includes('SMART') || n.includes('SPEED') || n.includes('XP') || n.includes('POWER')) return 'SMART FUEL';
    return name;
  };

  const updateLiveFuelSales = useCallback((fuelTypeOrMap, netLitres) => {
    setFuelStockState(prev => {
      const next = { ...prev };
      if (typeof fuelTypeOrMap === 'object' && fuelTypeOrMap !== null) {
        Object.entries(fuelTypeOrMap).forEach(([rawType, val]) => {
          const k = normalizeFuelKey(rawType);
          if (next[k]) {
            const sales = Number((parseFloat(val) || 0).toFixed(2));
            const op = parseFloat(next[k].openingStock) || 0;
            const rec = parseFloat(next[k].receivedStock) || 0;
            const total = op + rec;
            const closing = total - sales;
            next[k] = {
              ...next[k],
              salesLitres: sales,
              totalStock: Number(total.toFixed(2)),
              closingStock: Number(closing.toFixed(2))
            };
          }
        });
      } else if (typeof fuelTypeOrMap === 'string') {
        const k = normalizeFuelKey(fuelTypeOrMap);
        if (next[k]) {
          const sales = Number((parseFloat(netLitres) || 0).toFixed(2));
          const op = parseFloat(next[k].openingStock) || 0;
          const rec = parseFloat(next[k].receivedStock) || 0;
          const total = op + rec;
          const closing = total - sales;
          next[k] = {
            ...next[k],
            salesLitres: sales,
            totalStock: Number(total.toFixed(2)),
            closingStock: Number(closing.toFixed(2))
          };
        }
      }
      return next;
    });

    setStockLedgerHistory(prev => {
      const next = { ...prev };
      const curDate = selectedDate;
      const volumes = typeof fuelTypeOrMap === 'object' && fuelTypeOrMap !== null
        ? fuelTypeOrMap
        : { [fuelTypeOrMap]: netLitres };

      Object.entries(volumes).forEach(([rawType, val]) => {
        const k = normalizeFuelKey(rawType);
        const rows = next[k] ? [...next[k]] : [];
        const sales = Number((parseFloat(val) || 0).toFixed(2));
        const idx = rows.findIndex(r => r.date === curDate);
        if (idx >= 0) {
          const r = rows[idx];
          const op = parseFloat(r.openingStock) || 0;
          const rec = parseFloat(r.receiveStock) || 0;
          const total = op + rec;
          const closing = total - sales;
          rows[idx] = {
            ...r,
            sellStock: sales,
            totalStock: Number(total.toFixed(2)),
            closingStock: Number(closing.toFixed(2))
          };
        } else {
          const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
          const op = lastRow ? (parseFloat(lastRow.closingStock) || 0) : 10000;
          const total = op;
          const closing = total - sales;
          rows.push({
            id: `${k}-${curDate}`,
            date: curDate,
            openingStock: op,
            receiveStock: 0,
            totalStock: Number(total.toFixed(2)),
            sellStock: sales,
            closingStock: Number(closing.toFixed(2)),
            isFinalized: false
          });
        }
        next[k] = rows;
      });
      return next;
    });
  }, [selectedDate]);

  const updateReceivedStock = useCallback((fuelType, receivedQty) => {
    const k = normalizeFuelKey(fuelType);
    const rec = Number((parseFloat(receivedQty) || 0).toFixed(2));
    setFuelStockState(prev => {
      const current = prev[k] || { openingStock: 10000, receivedStock: 0, salesLitres: 0, totalStock: 10000, closingStock: 10000 };
      const total = current.openingStock + rec;
      const closing = total - current.salesLitres;
      return {
        ...prev,
        [k]: {
          ...current,
          receivedStock: rec,
          totalStock: Number(total.toFixed(2)),
          closingStock: Number(closing.toFixed(2))
        }
      };
    });

    setStockLedgerHistory(prev => {
      const next = { ...prev };
      const rows = next[k] ? [...next[k]] : [];
      const idx = rows.findIndex(r => r.date === selectedDate);
      if (idx >= 0) {
        const r = rows[idx];
        const op = parseFloat(r.openingStock) || 0;
        const sell = parseFloat(r.sellStock) || 0;
        const total = op + rec;
        const closing = total - sell;
        rows[idx] = {
          ...r,
          receiveStock: rec,
          totalStock: Number(total.toFixed(2)),
          closingStock: Number(closing.toFixed(2))
        };
        next[k] = rows;
      }
      return next;
    });
  }, [selectedDate]);

  // --- IN-MEMORY CUSTOMER LEDGER (JAMA RECOVERY) STATE & SYNC ---
  const [customerLedgerState, setCustomerLedgerState] = useState([]);

  const syncCreditorPayment = useCallback((entries) => {
    if (!entries) {
      setCustomerLedgerState(prev => prev.length === 0 ? prev : []);
      return;
    }
    const list = Array.isArray(entries) ? entries : [entries];
    const formatted = list
      .filter(j => j && (parseFloat(j.amount) || 0) > 0 && (j.customerId || j.customerName))
      .map((j, idx) => {
        const mode = (j.paymentMode || 'Cash').toUpperCase();
        let displayMode = 'CASH IN HAND';
        if (mode.includes('CHEQUE')) displayMode = 'CHEQUE';
        else if (mode.includes('UPI')) displayMode = 'UPI';

        return {
          id: `live-jama-${j.customerId || j.customerName}-${idx}`,
          customerId: j.customerId,
          partyId: j.customerId,
          customerName: j.customerName,
          date: selectedDate,
          type: 'CREDIT',
          amount: parseFloat(j.amount) || 0,
          litres: 0,
          rate: 0,
          vehicleNo: displayMode,
          paymentMode: displayMode,
          notes: `${displayMode} - Shift Collection (${selectedDate})`,
          isLive: true
        };
      });

    setCustomerLedgerState(prev => {
      if (JSON.stringify(prev) === JSON.stringify(formatted)) return prev;
      try {
        window.dispatchEvent(new CustomEvent('live_customer_ledger_update', {
          detail: { date: selectedDate, entries: formatted }
        }));
      } catch (e) {}
      return formatted;
    });
  }, [selectedDate]);

  // --- IN-MEMORY SELL PATRAK BIFURCATION LIVE FEED ---
  const [sellPatrakLiveFeed, setSellPatrakLiveFeed] = useState(() => ({
    'PETROL (MS)': { totalDispensed: 0, debitLitres: 0, cashLitres: 0 },
    'DIESEL (HSD)': { totalDispensed: 0, debitLitres: 0, cashLitres: 0 },
    'SMART FUEL': { totalDispensed: 0, debitLitres: 0, cashLitres: 0 }
  }));

  const updateSellPatrakFeed = useCallback((feedData) => {
    if (!feedData) return;
    setSellPatrakLiveFeed(prev => {
      let hasChange = false;
      const next = { ...prev };
      Object.entries(feedData).forEach(([k, v]) => {
        const normKey = normalizeFuelKey(k);
        if (next[normKey]) {
          const newTotal = Number((parseFloat(v.totalDispensed) || 0).toFixed(2));
          const newDebit = Number((parseFloat(v.debitLitres) || 0).toFixed(2));
          const newCash = Number((parseFloat(v.cashLitres) || 0).toFixed(2));
          if (
            next[normKey].totalDispensed !== newTotal ||
            next[normKey].debitLitres !== newDebit ||
            next[normKey].cashLitres !== newCash
          ) {
            hasChange = true;
            next[normKey] = {
              totalDispensed: newTotal,
              debitLitres: newDebit,
              cashLitres: newCash
            };
          }
        }
      });
      if (!hasChange) return prev;
      try {
        window.dispatchEvent(new CustomEvent('live_sell_patrak_update', {
          detail: { date: selectedDate, feed: feedData }
        }));
      } catch (e) {}
      return next;
    });
  }, [selectedDate]);

  // --- SHARED LUBRICANTS PRODUCTS MASTER ---
  const [lubricantProducts, setLubricantProducts] = useState(() => {
    try {
      const saved = localStorage.getItem('pump_lubricant_monthly_matrix');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    const lubes = DEFAULT_PRODUCT_CATALOG.find(c => (c.category || '').toLowerCase().includes('lube'))?.items || [];
    return lubes.map(item => ({
      id: item.id || item.name,
      name: item.name,
      unit: item.defaultUnit || 'Liter',
      volume: item.defaultVolume || 1.0,
      price: item.defaultPrice || 0
    }));
  });

  const updateLubricantProducts = useCallback((newProducts) => {
    setLubricantProducts(newProducts);
    try {
      localStorage.setItem('pump_lubricant_monthly_matrix', JSON.stringify(newProducts));
      window.dispatchEvent(new Event('lubricant_matrix_updated'));
    } catch (e) {}
  }, []);

  const addLubricantProduct = useCallback((product) => {
    setLubricantProducts(prev => {
      const exists = prev.some(p => p.name.trim().toLowerCase() === (product.name || '').trim().toLowerCase());
      if (exists) return prev;
      const next = [...prev, product];
      try {
        localStorage.setItem('pump_lubricant_monthly_matrix', JSON.stringify(next));
        window.dispatchEvent(new Event('lubricant_matrix_updated'));
      } catch (e) {}
      return next;
    });
  }, []);

  const deleteLubricantProduct = useCallback((targetId, targetName) => {
    setLubricantProducts(prev => {
      const next = prev.filter(p => {
        const matchId = targetId && p.id === targetId;
        const matchName = targetName && p.name.trim().toLowerCase() === targetName.trim().toLowerCase();
        return !matchId && !matchName;
      });
      try {
        localStorage.setItem('pump_lubricant_monthly_matrix', JSON.stringify(next));
        window.dispatchEvent(new Event('lubricant_matrix_updated'));
      } catch (e) {}
      return next;
    });
  }, []);

  // Sync lubricantProducts changes across browser events
  useEffect(() => {
    let isMounted = true;
    const handleLubeSync = () => {
      if (!isMounted) return;
      try {
        const saved = localStorage.getItem('pump_lubricant_monthly_matrix');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setLubricantProducts(prev => (JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed));
          }
        }
      } catch (e) {}
    };
    window.addEventListener('lubricant_matrix_updated', handleLubeSync);
    window.addEventListener('storage', handleLubeSync);
    return () => {
      isMounted = false;
      window.removeEventListener('lubricant_matrix_updated', handleLubeSync);
      window.removeEventListener('storage', handleLubeSync);
    };
  }, []);

  // --- LIVE CNG DISPENSED VOLUME FROM ACTIVE NOZZLES ---
  const [cngDispensedLive, setCngDispensedLive] = useState(0);
  const updateCngDispensedLive = useCallback((val) => {
    const num = Number((parseFloat(val) || 0).toFixed(2));
    setCngDispensedLive(prev => prev === num ? prev : num);
    try {
      window.dispatchEvent(new CustomEvent('live_cng_sales_update', {
        detail: { date: selectedDate, volume: num }
      }));
    } catch (e) {}
  }, [selectedDate]);

  // --- SHARED OTHER ACCOUNTS MASTERS (USHINA KHATA & DAILY PUMP EXPENSES) ---
  const [ushinaDirectory, setUshinaDirectory] = useState(() => {
    try {
      const saved = localStorage.getItem('ushina_accounts') || localStorage.getItem('pump_ushina_directory');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((u, i) => ({
            id: u?.id || `ush-${i + 1}`,
            name: u?.name || '',
            category: u?.category || 'Staff & Partner Upad',
            phone: u?.phone || '',
            openingBalance: parseFloat(u?.openingBalance) || 0,
            jamaEntries: Array.isArray(u?.jamaEntries) ? u.jamaEntries : [],
            udharEntries: Array.isArray(u?.udharEntries) ? u.udharEntries : []
          }));
        }
      }
    } catch (e) {}
    return DEFAULT_USHINA_DIRECTORY;
  });

  const [pumpExpenseCategories, setPumpExpenseCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('expense_categories') || localStorage.getItem('pump_expense_categories');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((e, i) => ({
            id: e?.id || `exp-cat-${i + 1}`,
            name: e?.name || '',
            category: e?.category || 'Daily Operations',
            entries: Array.isArray(e?.entries) ? e.entries : []
          }));
        }
      }
    } catch (e) {}
    return DEFAULT_PUMP_EXPENSE_CATEGORIES;
  });

  const updateUshinaDirectory = useCallback((newList) => {
    const list = Array.isArray(newList) ? newList.map((u, i) => ({
      id: u?.id || `ush-${i + 1}`,
      name: u?.name || '',
      category: u?.category || 'Staff & Partner Upad',
      phone: u?.phone || '',
      openingBalance: parseFloat(u?.openingBalance) || 0,
      jamaEntries: Array.isArray(u?.jamaEntries) ? u.jamaEntries : [],
      udharEntries: Array.isArray(u?.udharEntries) ? u.udharEntries : []
    })) : [];
    setUshinaDirectory(list);
    try {
      localStorage.setItem('ushina_accounts', JSON.stringify(list));
      localStorage.setItem('pump_ushina_directory', JSON.stringify(list));
      window.dispatchEvent(new Event('ushina_directory_updated'));
    } catch (e) {}
  }, []);

  const updatePumpExpenseCategories = useCallback((newList) => {
    const list = Array.isArray(newList) ? newList.map((e, i) => ({
      id: e?.id || `exp-cat-${i + 1}`,
      name: e?.name || '',
      category: e?.category || 'Daily Operations',
      entries: Array.isArray(e?.entries) ? e.entries : []
    })) : [];
    setPumpExpenseCategories(list);
    try {
      localStorage.setItem('expense_categories', JSON.stringify(list));
      localStorage.setItem('pump_expense_categories', JSON.stringify(list));
      window.dispatchEvent(new Event('pump_expense_categories_updated'));
    } catch (e) {}
  }, []);

  useEffect(() => {
    let isMounted = true;
    const handleOaSync = () => {
      if (!isMounted) return;
      try {
        const savedUsh = localStorage.getItem('ushina_accounts') || localStorage.getItem('pump_ushina_directory');
        if (savedUsh !== null) {
          const parsed = JSON.parse(savedUsh);
          if (Array.isArray(parsed)) {
            const sanitized = parsed.map((u, i) => ({
              id: u?.id || `ush-${i + 1}`,
              name: u?.name || '',
              category: u?.category || 'Staff & Partner Upad',
              phone: u?.phone || '',
              openingBalance: parseFloat(u?.openingBalance) || 0,
              jamaEntries: Array.isArray(u?.jamaEntries) ? u.jamaEntries : [],
              udharEntries: Array.isArray(u?.udharEntries) ? u.udharEntries : []
            }));
            setUshinaDirectory(prev => (JSON.stringify(prev) === JSON.stringify(sanitized) ? prev : sanitized));
          }
        }
        const savedExp = localStorage.getItem('expense_categories') || localStorage.getItem('pump_expense_categories');
        if (savedExp !== null) {
          const parsed = JSON.parse(savedExp);
          if (Array.isArray(parsed)) {
            const sanitized = parsed.map((e, i) => ({
              id: e?.id || `exp-cat-${i + 1}`,
              name: e?.name || '',
              category: e?.category || 'Daily Operations',
              entries: Array.isArray(e?.entries) ? e.entries : []
            }));
            setPumpExpenseCategories(prev => (JSON.stringify(prev) === JSON.stringify(sanitized) ? prev : sanitized));
          }
        }
      } catch (e) {}
    };
    window.addEventListener('ushina_directory_updated', handleOaSync);
    window.addEventListener('pump_expense_categories_updated', handleOaSync);
    window.addEventListener('storage', handleOaSync);
    return () => {
      isMounted = false;
      window.removeEventListener('ushina_directory_updated', handleOaSync);
      window.removeEventListener('pump_expense_categories_updated', handleOaSync);
      window.removeEventListener('storage', handleOaSync);
    };
  }, []);

  // --- GLOBAL PRODUCT CATALOG STATE ---
  const [productCatalog, setProductCatalog] = useState(DEFAULT_PRODUCT_CATALOG);

  // --- GLOBAL BANK ACCOUNTS MASTER STATE ---
  const [bankAccountsMaster, setBankAccountsMaster] = useState(() => getMasterBankAccounts());

  // Listen for real-time bank update events across components and browser windows
  useEffect(() => {
    let isMounted = true;
    const handleSync = () => {
      if (!isMounted) return;
      const current = getMasterBankAccounts();
      setBankAccountsMaster(prev => (JSON.stringify(prev) === JSON.stringify(current) ? prev : current));
    };

    window.addEventListener('bank_accounts_updated', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      isMounted = false;
      window.removeEventListener('bank_accounts_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  // --- STATION PROFILE & BUSINESS SETTINGS ---
  const [stationProfile, setStationProfile] = useState(() => {
    try {
      const activeUser = localStorage.getItem('mypump_current_user');
      const userId = activeUser ? JSON.parse(activeUser)?.id : null;
      const userScoped = userId ? localStorage.getItem(`mypump_${userId}_station_profile`) : null;
      const saved = userScoped || localStorage.getItem('station_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_STATION_PROFILE, ...parsed };
        }
      }
    } catch (e) {}
    return DEFAULT_STATION_PROFILE;
  });

  // Load Station Profile, Product Catalog & Bank Accounts from IndexedDB on DB Ready
  useEffect(() => {
    const loadDbSettings = async () => {
      try {
        const rec = await db.settings.get('station_profile');
        if (rec) {
          const { id, key, ...cleanProfile } = rec;
          setStationProfile(prev => ({ ...prev, ...cleanProfile }));
          localStorage.setItem('station_profile', JSON.stringify(cleanProfile));
        }

        const catRec = await db.settings.get('pump_product_catalog');
        if (catRec && catRec.data && Array.isArray(catRec.data) && catRec.data.length > 0) {
          setProductCatalog(catRec.data);
        } else {
          setProductCatalog(DEFAULT_PRODUCT_CATALOG);
          await db.settings.put({
            key: 'pump_product_catalog',
            data: DEFAULT_PRODUCT_CATALOG,
            updatedAt: new Date().toISOString()
          });
        }

        const currentMaster = getMasterBankAccounts();
        const bankRec = await db.settings.get('bank_accounts_master');
        const bankHisabRec = await db.settings.get('bank_hisab_store');

        let finalBankAccounts = currentMaster;
        if (bankRec && bankRec.data && Array.isArray(bankRec.data)) {
          finalBankAccounts = bankRec.data;
        } else if (bankHisabRec && bankHisabRec.data && Array.isArray(bankHisabRec.data.bank_accounts)) {
          finalBankAccounts = bankHisabRec.data.bank_accounts;
        }

        setBankAccountsMaster(finalBankAccounts);
        await saveMasterBankAccounts(finalBankAccounts);

        // Load Ushina Directory from DB if available
        const ushRec = (await db.settings.get('other_accounts_ushina')) || (await db.settings.get('vividh_khata_accounts'));
        if (ushRec && Array.isArray(ushRec.data)) {
          setUshinaDirectory(ushRec.data);
          localStorage.setItem('pump_ushina_directory', JSON.stringify(ushRec.data));
          localStorage.setItem('ushina_accounts', JSON.stringify(ushRec.data));
        }

        // Load Direct Expenses Categories from DB if available
        const expRec = await db.settings.get('pump_direct_expenses');
        if (expRec && Array.isArray(expRec.data)) {
          setPumpExpenseCategories(expRec.data);
          localStorage.setItem('pump_expense_categories', JSON.stringify(expRec.data));
          localStorage.setItem('expense_categories', JSON.stringify(expRec.data));
        }

        // Load Other Expenses from DB if available
        const otherExpRec = await db.settings.get('pump_other_expenses');
        if (otherExpRec && Array.isArray(otherExpRec.data)) {
          localStorage.setItem('pump_other_expenses', JSON.stringify(otherExpRec.data));
        }

        // Load Last Fuel Rates from DB if available
        const lastRatesRec = await db.settings.get('pump_last_fuel_rates');
        if (lastRatesRec && lastRatesRec.data && typeof lastRatesRec.data === 'object') {
          setRates(prev => ({ ...prev, ...lastRatesRec.data }));
          localStorage.setItem('pump_last_fuel_rates', JSON.stringify(lastRatesRec.data));
        }

        // Load Master Nozzle Config from DB if available
        const nozzleCfgRec = await db.settings.get('pump_nozzle_master_config');
        if (nozzleCfgRec && Array.isArray(nozzleCfgRec.data) && nozzleCfgRec.data.length > 0) {
          localStorage.setItem('pump_nozzle_master_config', JSON.stringify(nozzleCfgRec.data));
        }
      } catch (err) {
        console.error('Error loading settings from DB:', err);
      }
    };
    if (dbReady) {
      loadDbSettings();
    }
  }, [dbReady]);

  const updateProductCatalog = async (newCatalog) => {
    setProductCatalog(newCatalog);
    try {
      await db.settings.put({
        key: 'pump_product_catalog',
        data: newCatalog,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error saving product catalog to DB:', err);
    }
  };

  const updateBankAccountsMaster = async (newAccounts) => {
    setBankAccountsMaster(newAccounts);
    await saveMasterBankAccounts(newAccounts);
  };

  // Update window document title dynamically whenever fuel station name changes
  useEffect(() => {
    const name = stationProfile?.fuelStationName || 'SHITAL PETROL PUMP';
    document.title = `${name} - MY PUMP ERP`;
  }, [stationProfile]);

  // Enterprise Supabase Cloud Data Hydration on Sign-In
  useEffect(() => {
    if (!currentUser?.id) return;

    // 1. First check user-scoped local cache to avoid overwriting with stale signup metadata
    let hasLocalUserConfig = false;
    try {
      const userScoped = localStorage.getItem(`mypump_${currentUser.id}_station_profile`);
      if (userScoped) {
        const parsed = JSON.parse(userScoped);
        if (parsed && typeof parsed === 'object') {
          setStationProfile(prev => ({ ...prev, ...parsed }));
          hasLocalUserConfig = true;
        }
      }
    } catch (e) {}

    // Only apply currentUser metadata if no user-scoped local config was found
    if (!hasLocalUserConfig) {
      const meta = currentUser || {};
      if (meta.fuelStationName || meta.ownerName || meta.mobile || meta.gstin) {
        setStationProfile(prev => ({
          ...prev,
          fuelStationName: meta.fuelStationName || prev.fuelStationName,
          ownerName: meta.ownerName || prev.ownerName,
          mobile: meta.mobile || prev.mobile,
          gstin: meta.gstin || prev.gstin,
          address: meta.address || prev.address,
          openingShreeSilak: meta.openingShreeSilak !== undefined ? meta.openingShreeSilak : prev.openingShreeSilak
        }));
      }
    }

    // 2. Fetch account-wise station data from Supabase Cloud (pump_station_data) with local namespaced caching
    const loadCloudSnapshot = async () => {
      try {
        const { data: stationRow, isNew } = await fetchUserStationData(currentUser.id, {
          fuelStationName: currentUser.fuelStationName,
          ownerName: currentUser.ownerName,
          mobile: currentUser.mobile,
          email: currentUser.email
        });

        if (stationRow && typeof stationRow === 'object') {
          if (stationRow.station_profile) {
            setStationProfile(prev => ({ ...prev, ...stationRow.station_profile }));
            try {
              localStorage.setItem('station_profile', JSON.stringify(stationRow.station_profile));
              localStorage.setItem(`mypump_${currentUser.id}_station_profile`, JSON.stringify(stationRow.station_profile));
            } catch (e) {}
          }
          if (stationRow.fuel_rates) {
            setRates(prev => ({ ...prev, ...stationRow.fuel_rates }));
            localStorage.setItem('pump_last_fuel_rates', JSON.stringify(stationRow.fuel_rates));
          }
          if (stationRow.nozzle_config && Array.isArray(stationRow.nozzle_config) && stationRow.nozzle_config.length > 0) {
            setNozzles(stationRow.nozzle_config);
            localStorage.setItem('pump_nozzle_master_config', JSON.stringify(stationRow.nozzle_config));
          }
          if (stationRow.dip_levels) {
            setDips(prev => ({ ...prev, ...stationRow.dip_levels }));
            localStorage.setItem('pump_last_dip_levels', JSON.stringify(stationRow.dip_levels));
          }
          if (stationRow.other_accounts?.ushinaDirectory && Array.isArray(stationRow.other_accounts.ushinaDirectory)) {
            setUshinaDirectory(stationRow.other_accounts.ushinaDirectory);
            localStorage.setItem('pump_ushina_directory', JSON.stringify(stationRow.other_accounts.ushinaDirectory));
          }
          if (stationRow.bank_hisab && Array.isArray(stationRow.bank_hisab) && stationRow.bank_hisab.length > 0) {
            setBankAccountsMaster(stationRow.bank_hisab);
          }
        } else {
          // Fallback to metadata snapshot if Postgres row not yet available
          const cloudData = await pullStationDataFromCloud(currentUser);
          if (cloudData && typeof cloudData === 'object') {
            if (cloudData.stationProfile) {
              setStationProfile(prev => ({ ...prev, ...cloudData.stationProfile }));
              try {
                localStorage.setItem('station_profile', JSON.stringify(cloudData.stationProfile));
                localStorage.setItem(`mypump_${currentUser.id}_station_profile`, JSON.stringify(cloudData.stationProfile));
              } catch (e) {}
            }
            if (cloudData.rates) setRates(prev => ({ ...prev, ...cloudData.rates }));
            if (cloudData.nozzles) setNozzles(cloudData.nozzles);
            if (cloudData.dips) setDips(prev => ({ ...prev, ...cloudData.dips }));
            if (cloudData.ushinaDirectory) setUshinaDirectory(cloudData.ushinaDirectory);
          }
        }
      } catch (err) {
        console.warn('Could not hydrate cloud data:', err);
      }
    };

    loadCloudSnapshot();
  }, [currentUser]);

  const updateStationProfile = async (newProfile) => {
    const updated = {
      ...stationProfile,
      ...newProfile,
      fuelStationName: (newProfile.fuelStationName || newProfile.stationName || stationProfile.fuelStationName || '').trim(),
      ownerName: (newProfile.ownerName || stationProfile.ownerName || '').trim(),
      phone: (newProfile.phone || newProfile.mobile || stationProfile.phone || '').trim(),
      gstin: (newProfile.gstin || stationProfile.gstin || '').trim(),
      address: (newProfile.address || stationProfile.address || '').trim(),
      email: (newProfile.email || stationProfile.email || '').trim(),
      openingShreeSilak: newProfile.openingShreeSilak !== undefined ? parseFloat(newProfile.openingShreeSilak) || 0 : stationProfile.openingShreeSilak
    };
    setStationProfile(updated);
    try {
      localStorage.setItem('station_profile', JSON.stringify(updated));
      if (currentUser?.id) {
        localStorage.setItem(`mypump_${currentUser.id}_station_profile`, JSON.stringify(updated));
      }
      await db.settings.put({ key: 'station_profile', id: 'station_profile', ...updated });
    } catch (e) {}

    // Sync to Supabase Cloud strictly scoped to authenticated user
    if (currentUser?.id) {
      try {
        await upsertUserStationData(currentUser.id, { stationProfile: updated, rates, nozzles, dips });
      } catch (err) {
        console.warn('upsertUserStationData error:', err);
      }
      try {
        await syncStationDataToCloud(currentUser.id, { stationProfile: updated });
      } catch (err) {
        console.warn('syncStationDataToCloud error:', err);
      }
      try {
        await supabase.auth.updateUser({
          data: {
            fuelStationName: updated.fuelStationName,
            station_name: updated.fuelStationName,
            ownerName: updated.ownerName,
            owner_name: updated.ownerName,
            mobile: updated.phone,
            gstin: updated.gstin,
            address: updated.address,
            openingShreeSilak: updated.openingShreeSilak
          }
        });
      } catch (err) {
        console.warn('supabase.auth.updateUser error:', err);
      }

      // Sync React AuthContext state (currentUser) so header badge updates immediately without reload
      try {
        const savedUser = localStorage.getItem('mypump_current_user');
        const baseUser = savedUser ? JSON.parse(savedUser) : {};
        const syncedUser = {
          ...baseUser,
          ownerName: updated.ownerName || '',
          fuelStationName: updated.fuelStationName || baseUser.fuelStationName || '',
          mobile: updated.phone || baseUser.mobile || '',
          gstin: updated.gstin || baseUser.gstin || '',
          address: updated.address || baseUser.address || '',
          openingShreeSilak: updated.openingShreeSilak
        };
        localStorage.setItem('mypump_current_user', JSON.stringify(syncedUser));
        if (typeof setCurrentUser === 'function') {
          setCurrentUser(prev => ({ ...prev, ...syncedUser }));
        }
      } catch (e) {}
    }
    showToast('Fuel Station Profile saved & synced to cloud!', 'success');
    return updated;
  };

  // --- GLOBAL REACTIVE SHIFT STATE ---
  const [dips, setDips] = useState({
    msDipCm: 145,
    msDipLiters: 10875,
    hsdDipCm: 160,
    hsdDipLiters: 16000,
    speedDipCm: 120,
    speedDipLiters: 9000
  });
  const [rates, setRates] = useState(() => {
    try {
      const saved = localStorage.getItem('pump_last_fuel_rates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            'Motor Spirit (Petrol)': parseFloat(parsed['Motor Spirit (Petrol)']) || 94.48,
            'High Speed Diesel': parseFloat(parsed['High Speed Diesel']) || 90.16,
            'Speed Petrol': parseFloat(parsed['Speed Petrol'] || parsed['XP Premium Petrol']) || 104.50,
            'CNG': parseFloat(parsed['CNG']) || 75.80
          };
        }
      }
    } catch (e) {}
    return {
      'Motor Spirit (Petrol)': 94.48,
      'High Speed Diesel': 90.16,
      'Speed Petrol': 104.50,
      'CNG': 75.80,
    };
  });

  const [nozzles, setNozzles] = useState(() => {
    try {
      const saved = localStorage.getItem('pump_nozzle_master_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // Automatically keep pump_last_fuel_rates and pump_nozzle_master_config synchronized
  useEffect(() => {
    if (rates && typeof rates === 'object') {
      try {
        localStorage.setItem('pump_last_fuel_rates', JSON.stringify(rates));
        if (dbReady) {
          db.settings.put({
            key: 'pump_last_fuel_rates',
            data: rates,
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        }
      } catch (e) {}
    }
  }, [rates, dbReady]);

  useEffect(() => {
    if (Array.isArray(nozzles) && nozzles.length > 0) {
      try {
        localStorage.setItem('pump_nozzle_master_config', JSON.stringify(nozzles));
        if (dbReady) {
          db.settings.put({
            key: 'pump_nozzle_master_config',
            data: nozzles,
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        }
      } catch (e) {}
    }
  }, [nozzles, dbReady]);
  const [lubricants, setLubricants] = useState([
    { productName: '2T Engine Oil (Pouches/Bottles)', litreVolume: 0.04, volume: 0.04, soldQty: 0, soldCount: 0, unitPrice: 15, rate: 15, totalAmount: 0 }
  ]);

  const [expenseEntries, setExpenseEntries] = useState([]);
  const [otherIncomeEntries, setOtherIncomeEntries] = useState([]);
  const [debitEntries, setDebitEntries] = useState([]);
  const [jamaEntries, setJamaEntries] = useState([]);
  const [bankEntries, setBankEntries] = useState([]);
  const [smartBalanceEntries, setSmartBalanceEntries] = useState([]);

  const [digitalPayEntries, setDigitalPayEntries] = useState([
    { method: 'UPI', amount: 18500 },
    { method: 'CARD', amount: 14129 }
  ]);

  const [smartMoneyEntries, setSmartMoneyEntries] = useState([
    { program: 'PETRO CARD / FLEET CARD', amount: 8450 }
  ]);

  const [denominations, setDenominations] = useState({
    n2000: 0, n500: 380, n200: 120, n100: 200, n50: 100, n20: 100, n10: 150, coins: 850
  });

  const [customerList, setCustomerList] = useState(() => getMasterParties());

  // --- INITIAL SEED & RECTIFICATION ---
  useEffect(() => {
    seedSampleData()
      .then(() => {
        setDbReady(true);
        loadCustomerList();
      })
      .catch((err) => {
        console.error('DB Seed Error:', err);
        setDbReady(true);
      });
  }, []);

  const loadCustomerList = async () => {
    try {
      const dbCusts = await db.customers.toArray();
      const masterParties = getMasterParties();
      
      const mergedMap = new Map();
      for (const p of masterParties) {
        if (p && (p.id || p.name)) {
          mergedMap.set(p.name, p);
        }
      }
      for (const c of dbCusts) {
        if (c && (c.id || c.name)) {
          mergedMap.set(c.name, { ...mergedMap.get(c.name), ...c });
        }
      }
      const finalParties = Array.from(mergedMap.values());
      setCustomerList(finalParties);
      localStorage.setItem('my_pump_master_parties_list', JSON.stringify(finalParties));
    } catch (err) {
      setCustomerList(getMasterParties());
    }
  };

  useEffect(() => {
    let isMounted = true;
    const syncParties = () => {
      if (!isMounted) return;
      const current = getMasterParties();
      setCustomerList(prev => (JSON.stringify(prev) === JSON.stringify(current) ? prev : current));
    };

    window.addEventListener('storage', syncParties);
    window.addEventListener('pump_parties_updated', syncParties);
    return () => {
      isMounted = false;
      window.removeEventListener('storage', syncParties);
      window.removeEventListener('pump_parties_updated', syncParties);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.setItem('mypump_theme', 'light'); } catch (e) {}
  }, []);

  const showToast = (message, type = 'info') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const toggleTheme = () => {};

  // --- DATE-BASED HISTORICAL RETRIEVAL & CARRY-FORWARD ENGINE ---
  const loadDateSnapshot = useCallback(async (targetDate, targetShift) => {
    if (!dbReady) return;

    try {
      // 1. Check if archived snapshot exists for targetDate
      const { snapshot: rawSnapshot, isExact } = await getShiftSnapshotForDate(targetDate, targetShift);
      const exactSnapshot = rawSnapshot?.snapshot || rawSnapshot;

      if (isExact && exactSnapshot) {
        // Hydrate full state from exact archived shift snapshot with defensive schema merging
        const rawNozzles = exactSnapshot.sectionA_Nozzles || exactSnapshot.nozzles || exactSnapshot.nozzle_readings || [];
        if (Array.isArray(rawNozzles) && rawNozzles.length > 0) {
          const sanitizedNozzles = rawNozzles.map((n, idx) => {
            let safeMpdId = (n?.mpdId && typeof n.mpdId === 'string' && n.mpdId.startsWith('MPD-')) ? n.mpdId : null;
            if (!safeMpdId && n?.nozzleId) {
              const m = n.nozzleId.match(/N(\d+)/i);
              if (m) {
                const nNum = parseInt(m[1], 10);
                safeMpdId = `MPD-${Math.max(1, Math.ceil(nNum / 4))}`;
              }
            }
            if (!safeMpdId) safeMpdId = `MPD-${Math.max(1, Math.floor(idx / 4) + 1)}`;

            return {
              ...n,
              mpdId: safeMpdId,
              nozzleId: n?.nozzleId || n?.id || `N${idx + 1}`,
              productName: n?.productName || 'Motor Spirit (Petrol)',
              openingReading: parseFloat(n?.openingReading ?? n?.openingMeter) || 0,
              closingReading: parseFloat(n?.closingReading ?? n?.closingMeter) || 0,
              testingLitres: parseFloat(n?.testingLitres) || 0,
              salesLitres: parseFloat(n?.salesLitres) || 0,
              rate: parseFloat(n?.rate) || 0,
              totalAmount: parseFloat(n?.totalAmount) || 0
            };
          });
          setNozzles(sanitizedNozzles);
        } else {
          setNozzles([]);
        }

        const dipVal = exactSnapshot.tankDips || exactSnapshot.tank_stocks || exactSnapshot.dips;
        setDips({
          msDipCm: 145,
          msDipLiters: 10875,
          hsdDipCm: 160,
          hsdDipLiters: 16000,
          speedDipCm: 120,
          speedDipLiters: 9000,
          ...(typeof dipVal === 'object' && dipVal !== null ? dipVal : {})
        });

        const rateVal = exactSnapshot.fuelRates || exactSnapshot.fuel_rates || exactSnapshot.rates;
        setRates({
          'Motor Spirit (Petrol)': 94.48,
          'High Speed Diesel': 90.16,
          'Speed Petrol': 104.50,
          'CNG': 75.80,
          ...(typeof rateVal === 'object' && rateVal !== null ? rateVal : {})
        });

        const lubeList = exactSnapshot.sectionB_Lubricants || exactSnapshot.lubricants || exactSnapshot.lubricants_sold || [];
        setLubricants(Array.isArray(lubeList) ? lubeList.map((l, idx) => ({
          id: l?.id || `lube-${idx}`,
          productName: l?.productName || '2T Engine Oil (Pouches/Bottles)',
          litreVolume: parseFloat(l?.litreVolume ?? l?.volume) || 0.04,
          volume: parseFloat(l?.volume ?? l?.litreVolume) || 0.04,
          soldQty: parseFloat(l?.soldQty ?? l?.soldCount) || 0,
          soldCount: parseFloat(l?.soldCount ?? l?.soldQty) || 0,
          unitPrice: parseFloat(l?.unitPrice ?? l?.rate) || 15,
          rate: parseFloat(l?.rate ?? l?.unitPrice) || 15,
          totalAmount: parseFloat(l?.totalAmount) || 0
        })) : []);

        const jamaList = exactSnapshot.sectionC_Crediters || exactSnapshot.jamaEntries || exactSnapshot.customer_transactions?.sectionC_jamaRecoveries;
        setJamaEntries(Array.isArray(jamaList) ? jamaList : []);

        const incList = exactSnapshot.sectionD_OtherIncome || exactSnapshot.otherIncomeEntries || exactSnapshot.digital_settlements?.otherIncomeEntries;
        setOtherIncomeEntries(Array.isArray(incList) ? incList : []);

        const debitList = exactSnapshot.sectionE_Debiters || exactSnapshot.debitEntries || exactSnapshot.customer_transactions?.sectionE_debitSlips;
        setDebitEntries(Array.isArray(debitList) ? debitList : []);

        const digitalList = exactSnapshot.sectionF_DigitalPay || exactSnapshot.digitalPayEntries || exactSnapshot.smartBalanceEntries || exactSnapshot.digital_settlements?.smartBalanceEntries;
        setSmartBalanceEntries(Array.isArray(digitalList) ? digitalList : []);

        const smList = exactSnapshot.smartMoneyEntries || exactSnapshot.digital_settlements?.smartMoneyEntries;
        setSmartMoneyEntries(Array.isArray(smList) ? smList : []);

        const expList = exactSnapshot.sectionG_Expenses || exactSnapshot.expenseEntries || exactSnapshot.expense_records;
        setExpenseEntries(Array.isArray(expList) ? expList : []);

        const bankList = exactSnapshot.sectionH_BankHisab || exactSnapshot.bankEntries || exactSnapshot.bank_records;
        setBankEntries(Array.isArray(bankList) ? bankList : []);

        const denoms = exactSnapshot.denominations || exactSnapshot.cash_denominations;
        setDenominations({
          n2000: 0, n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, coins: 0,
          ...(typeof denoms === 'object' && denoms !== null ? denoms : {})
        });

        setIsLocked(Boolean(exactSnapshot.status === 'LOCKED' || exactSnapshot.isLocked === true));
        return;
      }

      // 2. Check individual IndexedDB tables for direct targetDate records
      const nozzleRecs = await db.nozzleReadings.where('date').equals(targetDate).toArray();
      const dipRec = await db.tankDips.where('date').equals(targetDate).first();
      const expRecs = await db.expenses.where('date').equals(targetDate).toArray();
      const incRecs = await db.otherIncome.where('date').equals(targetDate).toArray();
      const bankRecs = await db.bankDeposits.where('date').equals(targetDate).toArray();
      const jamaRecs = await db.jamaEntries.where('date').equals(targetDate).toArray();
      const debitRecs = await db.debitEntries.where('date').equals(targetDate).toArray();
      const cashRec = await db.cashDenominations.where('date').equals(targetDate).first();

      const hasDirectDbData = (nozzleRecs && nozzleRecs.length > 0) || dipRec || (expRecs && expRecs.length > 0) || (debitRecs && debitRecs.length > 0) || (incRecs && incRecs.length > 0) || (jamaRecs && jamaRecs.length > 0);

      if (hasDirectDbData) {
        if (nozzleRecs && nozzleRecs.length > 0) {
          setNozzles(nozzleRecs.map((n, idx) => {
            let safeMpdId = (n?.mpdId && typeof n.mpdId === 'string' && n.mpdId.startsWith('MPD-')) ? n.mpdId : null;
            if (!safeMpdId && n?.nozzleId) {
              const m = n.nozzleId.match(/N(\d+)/i);
              if (m) {
                const nNum = parseInt(m[1], 10);
                safeMpdId = `MPD-${Math.max(1, Math.ceil(nNum / 4))}`;
              }
            }
            if (!safeMpdId) safeMpdId = `MPD-${Math.max(1, Math.floor(idx / 4) + 1)}`;

            return {
              ...n,
              mpdId: safeMpdId,
              nozzleId: n?.nozzleId || `N${idx + 1}`,
              productName: n?.productName || 'Motor Spirit (Petrol)',
              openingReading: parseFloat(n?.openingReading) || 0,
              closingReading: parseFloat(n?.closingReading) || 0,
              testingLitres: parseFloat(n?.testingLitres) || 0,
              salesLitres: parseFloat(n?.salesLitres) || 0,
              rate: parseFloat(n?.rate) || 0,
              totalAmount: parseFloat(n?.totalAmount) || 0
            };
          }));
        }
        if (dipRec) {
          setDips({
            msDipCm: dipRec.msDipCm !== undefined ? dipRec.msDipCm : 145,
            msDipLiters: dipRec.msDipLiters !== undefined ? dipRec.msDipLiters : 10875,
            hsdDipCm: dipRec.hsdDipCm !== undefined ? dipRec.hsdDipCm : 160,
            hsdDipLiters: dipRec.hsdDipLiters !== undefined ? dipRec.hsdDipLiters : 16000,
            speedDipCm: dipRec.speedDipCm !== undefined ? dipRec.speedDipCm : 120,
            speedDipLiters: dipRec.speedDipLiters !== undefined ? dipRec.speedDipLiters : 9000,
          });
        }
        setExpenseEntries(Array.isArray(expRecs) ? expRecs : []);
        setOtherIncomeEntries(Array.isArray(incRecs) ? incRecs : []);
        setBankEntries(Array.isArray(bankRecs) ? bankRecs : []);
        setJamaEntries(Array.isArray(jamaRecs) ? jamaRecs : []);
        setDebitEntries(Array.isArray(debitRecs) ? debitRecs : []);
        if (cashRec) {
          setDenominations({
            n2000: cashRec.n2000 || 0,
            n500: cashRec.n500 || 0,
            n200: cashRec.n200 || 0,
            n100: cashRec.n100 || 0,
            n50: cashRec.n50 || 0,
            n20: cashRec.n20 || 0,
            n10: cashRec.n10 || 0,
            coins: cashRec.coins || 0,
          });
        }
        const masterRec = await db.masterShifts.where({ date: targetDate, shiftId: targetShift }).first();
        // Only lock if snapshot indicates LOCKED
        setIsLocked(masterRec ? (masterRec.status === 'LOCKED' || masterRec.isLocked === true) : false);
        return;
      }

      // 3. Fresh / New Date with no saved snapshot -> Carry Forward opening values from previous shift
      const prevSnapshot = await getLatestPreviousShiftSnapshot(targetDate, targetShift);

      // Check master configured nozzles first
      let masterConfigNozzles = [];
      try {
        const savedCfg = localStorage.getItem('pump_nozzle_master_config');
        if (savedCfg) {
          const parsedCfg = JSON.parse(savedCfg);
          if (Array.isArray(parsedCfg) && parsedCfg.length > 0) masterConfigNozzles = parsedCfg;
        }
      } catch (e) {}

      // Carry forward nozzle opening readings
      const allDbNozzles = await db.nozzleReadings.toArray();
      const prevNozzles = (prevSnapshot && Array.isArray(prevSnapshot.sectionA_Nozzles) && prevSnapshot.sectionA_Nozzles.length > 0)
        ? prevSnapshot.sectionA_Nozzles
        : (masterConfigNozzles.length > 0 ? masterConfigNozzles : (allDbNozzles.length > 0 ? allDbNozzles.slice(-masterConfigNozzles.length || -4) : []));

      if (prevNozzles.length > 0) {
        const carriedNozzles = prevNozzles.map(n => {
          const closing = parseFloat(n.closingReading) || parseFloat(n.openingReading) || 0;
          return {
            ...n,
            date: targetDate,
            openingReading: closing,
            closingReading: 0,
            testingLitres: 0,
            salesLitres: 0,
            totalAmount: 0
          };
        });
        setNozzles(carriedNozzles);
      } else if (masterConfigNozzles.length > 0) {
        setNozzles(masterConfigNozzles.map(n => ({
          ...n,
          date: targetDate,
          openingReading: parseFloat(n.openingReading) || 0,
          closingReading: 0,
          testingLitres: 0,
          salesLitres: 0,
          totalAmount: 0
        })));
      } else {
        const msRate = rates['Motor Spirit (Petrol)'] || 94.48;
        const hsdRate = rates['High Speed Diesel'] || 90.16;
        const default4 = [
          { date: targetDate, mpdId: 'MPD-1', nozzleId: 'N1 (MS)', productName: 'Motor Spirit (Petrol)', openingReading: 0, closingReading: 0, testingLitres: 0, salesLitres: 0, rate: msRate, totalAmount: 0 },
          { date: targetDate, mpdId: 'MPD-1', nozzleId: 'N2 (MS)', productName: 'Motor Spirit (Petrol)', openingReading: 0, closingReading: 0, testingLitres: 0, salesLitres: 0, rate: msRate, totalAmount: 0 },
          { date: targetDate, mpdId: 'MPD-1', nozzleId: 'N3 (HSD)', productName: 'High Speed Diesel', openingReading: 0, closingReading: 0, testingLitres: 0, salesLitres: 0, rate: hsdRate, totalAmount: 0 },
          { date: targetDate, mpdId: 'MPD-1', nozzleId: 'N4 (HSD)', productName: 'High Speed Diesel', openingReading: 0, closingReading: 0, testingLitres: 0, salesLitres: 0, rate: hsdRate, totalAmount: 0 }
        ];
        setNozzles(default4);
      }

      // Carry forward tank dips
      if (prevSnapshot && prevSnapshot.tankDips) {
        setDips(prevSnapshot.tankDips);
      }

      // Carry forward fuel rates: check prevSnapshot, then pump_last_fuel_rates
      if (prevSnapshot && prevSnapshot.fuelRates) {
        setRates(prevSnapshot.fuelRates);
      } else {
        try {
          const savedRates = localStorage.getItem('pump_last_fuel_rates');
          if (savedRates) {
            const parsedRates = JSON.parse(savedRates);
            if (parsedRates && typeof parsedRates === 'object') {
              setRates(prev => ({ ...prev, ...parsedRates }));
            }
          }
        } catch (e) {}
      }

      // Operational Tables reset to fresh 1 blank default row each
      setLubricants([
        { productName: '2T Engine Oil (Pouches/Bottles)', litreVolume: 0.04, volume: 0.04, soldQty: 0, soldCount: 0, unitPrice: 15, rate: 15, totalAmount: 0 }
      ]);
      setJamaEntries([
        { customerName: '', paymentMode: 'Cash', amount: 0, notes: '' }
      ]);
      let defaultPartyName = ushinaDirectory[0]?.name || '';
      let defaultPartyId = ushinaDirectory[0]?.id || null;
      if (!defaultPartyName) {
        try {
          const savedUsh = localStorage.getItem('ushina_accounts') || localStorage.getItem('pump_ushina_directory');
          if (savedUsh) {
            const parsed = JSON.parse(savedUsh);
            if (Array.isArray(parsed) && parsed.length > 0) {
              defaultPartyName = parsed[0]?.name || '';
              defaultPartyId = parsed[0]?.id || null;
            }
          }
        } catch (e) {}
      }
      setOtherIncomeEntries([
        { accountId: defaultPartyId, partyName: defaultPartyName || 'om', category: defaultPartyName || 'om', description: '', amount: 0 }
      ]);
      const fallbackMsRate = 94.48;
      const firstCustName = 'Mukeshbhai Charada';
      setDebitEntries([
        { customerId: 1, customerName: firstCustName, vehicleNo: '', billNo: '', billType: 'Debit Bill', fuelProduct: 'MS Petrol', fuelType: 'MS Petrol', litres: 0, slipNo: '', rate: fallbackMsRate, amount: 0 }
      ]);
      setSmartBalanceEntries([
        { provider: 'PhonePe QR', txnId: '', txnCount: 0, settledAmount: 0, feeDeduction: 0, netReceived: 0 }
      ]);
      setExpenseEntries([
        { category: 'Cha / Refreshments', description: '', amount: 0 }
      ]);
      const firstBank = Array.isArray(bankAccountsMaster) && bankAccountsMaster.length > 0 ? bankAccountsMaster[0] : null;
      setBankEntries(firstBank ? [
        { bankAccountId: firstBank.id, bankName: firstBank.name, accountNumber: firstBank.accountNumber || '', slipNo: '', amount: 0, depositedBy: 'Shift Manager' }
      ] : []);
      setDenominations({ n2000: 0, n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, coins: 0 });
      setIsLocked(false);

    } catch (err) {
      console.error('Error loading date snapshot:', err);
    }
  }, [dbReady]);

  const currentLoadedShiftKeyRef = useRef('');

  useEffect(() => {
    if (!dbReady) return;
    const shiftKey = `${selectedDate}_${activeShift}`;
    if (currentLoadedShiftKeyRef.current === shiftKey) return;
    currentLoadedShiftKeyRef.current = shiftKey;
    loadDateSnapshot(selectedDate, activeShift);
  }, [dbReady, selectedDate, activeShift, loadDateSnapshot]);

  // --- AUTO-SAVE DEBOUNCER TO INDEXEDDB (0ms UI Latency) ---
  const saveTimeoutRef = useRef(null);

  const triggerAutoSave = useCallback(() => {
    if (!dbReady) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await db.transaction('rw', [
          db.nozzleReadings,
          db.expenses,
          db.bankDeposits,
          db.jamaEntries,
          db.cashDenominations,
          db.tankDips,
          db.lubricants
        ], async () => {
          // Auto-sync nozzles
          const oldN = await db.nozzleReadings.where('date').equals(selectedDate).toArray();
          for (const o of oldN) await db.nozzleReadings.delete(o.id);
          for (const n of nozzles) {
            const { id, _localId, ...clean } = n;
            await db.nozzleReadings.add({ ...clean, date: selectedDate, shiftId: activeShift });
          }

          // Auto-sync tank dips
          if (dips) {
            const oldD = await db.tankDips.where('date').equals(selectedDate).toArray();
            for (const od of oldD) await db.tankDips.delete(od.id);
            await db.tankDips.add({ date: selectedDate, shiftId: activeShift, ...dips });
          }

          // Auto-sync expenses
          const oldE = await db.expenses.where('date').equals(selectedDate).toArray();
          for (const oe of oldE) await db.expenses.delete(oe.id);
          for (const e of expenseEntries) {
            if (parseFloat(e.amount) > 0) {
              await db.expenses.add({
                date: selectedDate,
                shiftId: activeShift,
                category: e.category,
                description: e.description || e.category,
                amount: parseFloat(e.amount) || 0,
                paymentMode: 'Cash Drawer',
                recordedBy: 'Shift Manager'
              });
            }
          }

          // Auto-sync other income (Section D - Ushina / Misc Income)
          const oldInc = await db.otherIncome.where('date').equals(selectedDate).toArray();
          for (const oi of oldInc) await db.otherIncome.delete(oi.id);
          for (const inc of (otherIncomeEntries || [])) {
            if (parseFloat(inc.amount) > 0) {
              await db.otherIncome.add({
                date: selectedDate,
                shiftId: activeShift,
                category: inc.category || inc.partyName || '',
                description: inc.description || 'Other Income',
                amount: parseFloat(inc.amount) || 0
              });
            }
          }

          // Auto-sync bank deposits
          const oldB = await db.bankDeposits.where('date').equals(selectedDate).toArray();
          for (const ob of oldB) await db.bankDeposits.delete(ob.id);
          for (const b of bankEntries) {
            if (parseFloat(b.amount) > 0) {
              await db.bankDeposits.add({
                date: selectedDate,
                bankName: b.bankName,
                accountNumber: b.accountNumber || '13495',
                slipNo: b.slipNo || 'DEP-AUTO',
                amount: parseFloat(b.amount) || 0,
                depositedBy: b.depositedBy || 'Shift Manager'
              });
            }
          }

          // Auto-sync lubricants to central lubricants register
          await syncSectionBToLubricants(selectedDate, lubricants);
        });

        // Auto-save shift snapshot to Day-Wise Shift Archive
        await saveShiftSnapshotToArchive({
          date: selectedDate,
          shiftType: activeShift,
          status: isLocked ? 'LOCKED' : 'DRAFT',
          dips,
          rates,
          nozzles,
          lubricants,
          expenseEntries,
          otherIncomeEntries,
          debitEntries,
          jamaEntries,
          bankEntries,
          smartBalanceEntries,
          digitalPayEntries,
          smartMoneyEntries,
          denominations,
          savedAt: new Date().toISOString()
        });

        // Auto-trigger cross-module calculation pipelines (Stock Patrak, Sell Patrak & Ledger)
        await syncDailyEntryToModules(selectedDate, activeShift, {
          lubricants,
          nozzles,
          debitEntries,
          jamaEntries,
          otherIncomeEntries,
          expenseEntries,
          smartBalanceEntries,
          digitalPayEntries,
          smartMoneyEntries,
          bankEntries,
          customerList,
          rates
        });

        // Supabase Cloud Sync (Account-isolated background sync into pump_station_data)
        if (currentUser?.id) {
          upsertUserStationData(currentUser.id, {
            stationProfile,
            nozzles,
            rates,
            dips,
            dailyShifts: [
              {
                date: selectedDate,
                shiftType: activeShift,
                status: isLocked ? 'LOCKED' : 'DRAFT',
                savedAt: new Date().toISOString()
              }
            ],
            otherAccounts: {
              ushinaDirectory,
              pumpExpenses: pumpExpenseCategories
            },
            bankEntries,
            staffAttendance: {}
          }).catch(err => console.warn('[AutoSave] Cloud upsert skipped/failed:', err));

          syncStationDataToCloud(currentUser.id, {
            date: selectedDate,
            shiftId: activeShift,
            fuelRates: rates,
            nozzles,
            dips,
            stationProfile,
            lastSavedAt: new Date().toISOString()
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Auto-save error:', err);
      }
    }, 400); // 400ms debounce
  }, [dbReady, selectedDate, activeShift, nozzles, lubricants, expenseEntries, bankEntries, dips, debitEntries, jamaEntries, digitalPayEntries, smartMoneyEntries, otherIncomeEntries, customerList, rates, currentUser, stationProfile]);

  // Trigger auto-save whenever core arrays update
  useEffect(() => {
    triggerAutoSave();
  }, [nozzles, lubricants, expenseEntries, bankEntries, dips, debitEntries, jamaEntries, digitalPayEntries, smartMoneyEntries, otherIncomeEntries, triggerAutoSave]);

  // --- PURE IN-MEMORY SHIFT ADVANCEMENT SIMULATION ---
  const simulateSaveToNextShift = useCallback(() => {
    const currentDate = selectedDate;
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    const nextDate = d.toISOString().split('T')[0];

    // 1. Shift Handover in StockManagement:
    // Freeze current day's row with closing stock; create next day's row where:
    // openingStock = previousDay.closingStock, receivedStock = 0, salesLitres = 0, closingStock = previousDay.closingStock.
    setStockLedgerHistory(prev => {
      const next = { ...prev };
      ['PETROL (MS)', 'DIESEL (HSD)', 'SMART FUEL'].forEach(k => {
        const rows = next[k] ? [...next[k]] : [];
        let curRow = rows.find(r => r.date === currentDate);
        if (!curRow && rows.length > 0) {
          curRow = rows[rows.length - 1];
        }
        const closingVal = curRow ? (parseFloat(curRow.closingStock) || 0) : (fuelStockState[k]?.closingStock || 10000);

        if (curRow) {
          curRow.isFinalized = true;
        }

        const nextRowData = {
          id: `${k}-${nextDate}`,
          date: nextDate,
          openingStock: closingVal, // Pure carry forward!
          receiveStock: 0,
          totalStock: closingVal,
          sellStock: 0,
          closingStock: closingVal,
          isFinalized: false
        };

        const nextIdx = rows.findIndex(r => r.date === nextDate);
        if (nextIdx >= 0) {
          rows[nextIdx] = nextRowData;
        } else {
          rows.push(nextRowData);
        }
        next[k] = rows;
      });
      return next;
    });

    setFuelStockState(prev => {
      const next = { ...prev };
      ['PETROL (MS)', 'DIESEL (HSD)', 'SMART FUEL'].forEach(k => {
        const prevClosing = prev[k]?.closingStock || 10000;
        next[k] = {
          openingStock: prevClosing,
          receivedStock: 0,
          salesLitres: 0,
          totalStock: prevClosing,
          closingStock: prevClosing
        };
      });
      return next;
    });

    // 2. Rollover Section A Nozzle Readings in MasterDailySheet:
    setNozzles(prevNozzles => {
      return prevNozzles.map(nz => {
        const prevClosing = parseFloat(nz.closingReading) || 0;
        const prevOpening = parseFloat(nz.openingReading) || 0;
        const newOpening = prevClosing > 0 ? prevClosing : prevOpening;
        return {
          ...nz,
          openingReading: newOpening,
          closingReading: 0,
          testingLitres: 0,
          salesLitres: 0,
          totalAmount: 0
        };
      });
    });

    // Reset operational entries smoothly
    setLubricants([
      { productName: '2T Engine Oil (Pouches/Bottles)', litreVolume: 0.04, volume: 0.04, soldQty: 0, soldCount: 0, unitPrice: 15, rate: 15, totalAmount: 0 }
    ]);
    setJamaEntries([{ customerName: '', paymentMode: 'Cash', amount: 0, notes: '' }]);
    setCustomerLedgerState([]);
    setSellPatrakLiveFeed({
      'PETROL (MS)': { totalDispensed: 0, debitLitres: 0, cashLitres: 0 },
      'DIESEL (HSD)': { totalDispensed: 0, debitLitres: 0, cashLitres: 0 },
      'SMART FUEL': { totalDispensed: 0, debitLitres: 0, cashLitres: 0 }
    });
    let nextPartyName = ushinaDirectory[0]?.name || '';
    if (!nextPartyName) {
      try {
        const savedUsh = localStorage.getItem('ushina_accounts') || localStorage.getItem('pump_ushina_directory');
        if (savedUsh) {
          const parsed = JSON.parse(savedUsh);
          if (Array.isArray(parsed) && parsed.length > 0) nextPartyName = parsed[0]?.name || '';
        }
      } catch (e) {}
    }
    setOtherIncomeEntries([{ category: nextPartyName || 'om', description: '', amount: 0 }]);
    setDebitEntries([]);
    setDigitalPayEntries([]);
    setSmartMoneyEntries([]);
    setSmartBalanceEntries([{ provider: 'PhonePe QR', txnId: '', txnCount: 0, settledAmount: 0, feeDeduction: 0, netReceived: 0 }]);
    setExpenseEntries([]);
    setBankEntries([]);
    setDenominations({ n2000: 0, n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, coins: 0 });

    // 3. Visually advance the date
    setSelectedDate(nextDate);

    // 4. Show confirmation toast
    showToast(`Shift Saved Successfully! Data committed for ${currentDate}.`, 'success');

    // 5. Safely bypass DB sync errors
    try {
      window.dispatchEvent(new Event('stock_patrak_updated'));
      window.dispatchEvent(new Event('pump_product_catalog_updated'));
      window.dispatchEvent(new Event('lubricant_matrix_updated'));
      window.dispatchEvent(new Event('sell_patrak_updated'));
      window.dispatchEvent(new Event('ledger_updated'));
    } catch (e) {}
  }, [selectedDate, fuelStockState, showToast]);

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        isDarkMode,
        toggleTheme,
        selectedDate,
        setSelectedDate,
        activeShift,
        setActiveShift,
        dbReady,
        showToast,
        toastMessage,
        isLocked,
        setIsLocked,
        // In-Memory Stock Patrak State & Simulation
        fuelStockState,
        setFuelStockState,
        stockLedgerHistory,
        setStockLedgerHistory,
        updateLiveFuelSales,
        updateReceivedStock,
        simulateSaveToNextShift,
        // In-Memory Customer Ledger State & Sync
        customerLedgerState,
        setCustomerLedgerState,
        syncCreditorPayment,
        // In-Memory Sell Patrak Live Feed
        sellPatrakLiveFeed,
        setSellPatrakLiveFeed,
        updateSellPatrakFeed,
        // Global Bank Accounts Master State
        bankAccountsMaster,
        setBankAccountsMaster,
        updateBankAccountsMaster,
        bankAccounts: bankAccountsMaster,
        setBankAccounts: updateBankAccountsMaster,
        // Station Profile & Business Settings
        stationProfile,
        setStationProfile: updateStationProfile,
        updateStationProfile,
        // Global Product Catalog
        productCatalog,
        setProductCatalog,
        updateProductCatalog,
        // Shared Lubricants Master
        lubricantProducts,
        setLubricantProducts,
        updateLubricantProducts,
        addLubricantProduct,
        deleteLubricantProduct,
        // Live CNG Volume Sync
        cngDispensedLive,
        setCngDispensedLive,
        updateCngDispensedLive,
        // Shared Other Accounts Masters
        ushinaDirectory,
        setUshinaDirectory,
        updateUshinaDirectory,
        ushinaDirectoryList: ushinaDirectory,
        setUshinaDirectoryList: setUshinaDirectory,
        updateUshinaDirectoryList: updateUshinaDirectory,
        pumpExpenseCategories,
        setPumpExpenseCategories,
        updatePumpExpenseCategories,
        // Reactive Shift State
        dips, setDips,
        rates, setRates,
        nozzles, setNozzles,
        lubricants, setLubricants,
        expenseEntries, setExpenseEntries,
        otherIncomeEntries, setOtherIncomeEntries,
        debitEntries, setDebitEntries,
        jamaEntries, setJamaEntries,
        bankEntries, setBankEntries,
        smartBalanceEntries, setSmartBalanceEntries,
        digitalPayEntries, setDigitalPayEntries,
        smartMoneyEntries, setSmartMoneyEntries,
        denominations, setDenominations,
        customerList, setCustomerList,
        loadDateSnapshot
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    console.warn('useApp must be used within an AppProvider context');
    return {
      stationProfile: DEFAULT_STATION_PROFILE,
      setStationProfile: async () => {},
      updateStationProfile: async () => {},
      productCatalog: DEFAULT_PRODUCT_CATALOG,
      setProductCatalog: () => {},
      updateProductCatalog: async () => {},
      lubricantProducts: [],
      setLubricantProducts: () => {},
      updateLubricantProducts: () => {},
      addLubricantProduct: () => {},
      deleteLubricantProduct: () => {},
      cngDispensedLive: 0,
      setCngDispensedLive: () => {},
      updateCngDispensedLive: () => {},
      ushinaDirectory: DEFAULT_USHINA_DIRECTORY,
      ushinaDirectoryList: DEFAULT_USHINA_DIRECTORY,
      setUshinaDirectory: () => {},
      setUshinaDirectoryList: () => {},
      updateUshinaDirectory: () => {},
      updateUshinaDirectoryList: () => {},
      pumpExpenseCategories: DEFAULT_PUMP_EXPENSE_CATEGORIES,
      setPumpExpenseCategories: () => {},
      updatePumpExpenseCategories: () => {},
      bankAccountsMaster: DEFAULT_BANK_ACCOUNTS,
      setBankAccountsMaster: () => {},
      updateBankAccountsMaster: async () => {},
      bankAccounts: DEFAULT_BANK_ACCOUNTS,
      setBankAccounts: () => {},
      showToast: () => {},
      isDarkMode: false,
      toggleTheme: () => {},
      selectedDate: new Date().toISOString().split('T')[0],
      setSelectedDate: () => {},
      activeShift: 'Day Shift (Morning 6am - 6pm)',
      setActiveShift: () => {},
      dbReady: true,
      isLocked: false,
      setIsLocked: () => {},
      fuelStockState: {
        'PETROL (MS)': { openingStock: 10000, receivedStock: 0, salesLitres: 0, totalStock: 10000, closingStock: 10000 },
        'DIESEL (HSD)': { openingStock: 10000, receivedStock: 0, salesLitres: 0, totalStock: 10000, closingStock: 10000 },
        'SMART FUEL': { openingStock: 10000, receivedStock: 0, salesLitres: 0, totalStock: 10000, closingStock: 10000 }
      },
      setFuelStockState: () => {},
      stockLedgerHistory: {},
      setStockLedgerHistory: () => {},
      updateLiveFuelSales: () => {},
      updateReceivedStock: () => {},
      simulateSaveToNextShift: () => {},
      customerLedgerState: [],
      setCustomerLedgerState: () => {},
      syncCreditorPayment: () => {},
      sellPatrakLiveFeed: {
        'PETROL (MS)': { totalDispensed: 0, debitLitres: 0, cashLitres: 0 },
        'DIESEL (HSD)': { totalDispensed: 0, debitLitres: 0, cashLitres: 0 },
        'SMART FUEL': { totalDispensed: 0, debitLitres: 0, cashLitres: 0 }
      },
      setSellPatrakLiveFeed: () => {},
      updateSellPatrakFeed: () => {},
      dips: { msDipCm: 145, hsdDipCm: 160, speedDipCm: 120 },
      setDips: () => {},
      rates: { 'Motor Spirit (Petrol)': 94.48, 'High Speed Diesel': 90.16, 'Speed Petrol': 104.50, 'CNG': 75.80 },
      setRates: () => {},
      nozzles: [],
      setNozzles: () => {},
      lubricants: [],
      setLubricants: () => {},
      expenseEntries: [],
      setExpenseEntries: () => {},
      otherIncomeEntries: [],
      setOtherIncomeEntries: () => {},
      debitEntries: [],
      setDebitEntries: () => {},
      jamaEntries: [],
      setJamaEntries: () => {},
      bankEntries: [],
      setBankEntries: () => {},
      smartBalanceEntries: [],
      setSmartBalanceEntries: () => {},
      digitalPayEntries: [],
      setDigitalPayEntries: () => {},
      smartMoneyEntries: [],
      setSmartMoneyEntries: () => {},
      denominations: { n2000: 0, n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, coins: 0 },
      setDenominations: () => {},
      customerList: [],
      setCustomerList: () => {},
      loadDateSnapshot: async () => {}
    };
  }
  return context;
}
