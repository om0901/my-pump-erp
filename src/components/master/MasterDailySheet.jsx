import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { syncStationDataToCloud } from '../../services/supabaseSyncService';
import { upsertUserStationData } from '../../services/dbStorageService';
import { db } from '../../db/database';
import { syncSectionBToLubricants, syncDailyEntryToModules, syncNozzlesToStockPatrak, calculateLubricantRowTotal, saveShiftSnapshotToArchive, getShiftSnapshotForDate } from '../../db/storageService';
import { processShiftSave } from '../../services/shiftPipelineService';
import { getMasterBankAccounts } from '../../utils/bankMaster';
import { getMasterParties } from '../../utils/partyMaster';
import {
  calculateNozzleSales,
  calculateAstm53bDensity,
  checkAstmDensityVariance,
  checkOmcStatutoryLossThreshold,
  calculateCashierSettlement
} from '../../utils/petroleumMath';
import {
  Layers,
  Fuel,
  Database,
  Droplet,
  Users,
  Receipt,
  Smartphone,
  Calculator,
  Building2,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ArrowRightCircle,
  ArrowDownRight,
  ArrowUpRight,
  FileSpreadsheet,
  IndianRupee,
  Calendar,
  Clock,
  Printer,
  Zap,
  Coins,
  X,
  FolderArchive,
  FileText,
  Unlock
} from 'lucide-react';
import NumericInput from '../common/NumericInput';
import CashDenominationModal from '../common/CashDenominationModal';
import HistoricalBanner from '../common/HistoricalBanner';
import { persistShiftClosure } from '../../services/dbStorageService';

export default function MasterDailySheet() {
  const { currentUser } = useAuth();
  const {
    selectedDate,
    setSelectedDate,
    activeShift,
    showToast,
    setActiveTab,
    isLocked,
    setIsLocked,
    dips, setDips,
    rates, setRates,
    lockFuelRates,
    nozzles, setNozzles,
    lubricants, setLubricants,
    expenseEntries, setExpenseEntries,
    otherIncomeEntries = [], setOtherIncomeEntries,
    debitEntries, setDebitEntries,
    jamaEntries, setJamaEntries,
    bankEntries, setBankEntries,
    smartBalanceEntries = [], setSmartBalanceEntries,
    digitalPayEntries = [], setDigitalPayEntries,
    smartMoneyEntries = [], setSmartMoneyEntries,
    denominations, setDenominations,
    customerList = [],
    stationProfile,
    productCatalog = [],
    bankAccountsMaster = [],
    dbReady,
    updateLiveFuelSales,
    simulateSaveToNextShift,
    syncCreditorPayment,
    updateSellPatrakFeed,
    lubricantProducts = [],
    updateCngDispensedLive = () => {},
    ushinaDirectory = [],
    ushinaDirectoryList = ushinaDirectory,
    pumpExpenseCategories = []
  } = useApp();

  const [isArchivedView, setIsArchivedView] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const checkArchived = async () => {
      try {
        const { snapshot } = await getShiftSnapshotForDate(selectedDate, activeShift);
        if (isMounted) {
          setIsArchivedView(Boolean(snapshot && (snapshot.status === 'LOCKED' || snapshot.isLocked === true)));
        }
      } catch (e) {
        if (isMounted) setIsArchivedView(false);
      }
    };
    checkArchived();
    window.addEventListener('daily_shift_archived', checkArchived);
    return () => {
      isMounted = false;
      window.removeEventListener('daily_shift_archived', checkArchived);
    };
  }, [selectedDate, activeShift]);

  const getTodayDateStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const todayStr = getTodayDateStr();
  const isHistoricalView = selectedDate < todayStr;
  const isShiftArchived = Boolean(isArchivedView || isLocked);

  const [bankOptions, setBankOptions] = useState(() => getMasterBankAccounts());

  useEffect(() => {
    let isMounted = true;
    const syncBanks = () => {
      if (!isMounted) return;
      const current = getMasterBankAccounts();
      setBankOptions(prev => (JSON.stringify(prev) === JSON.stringify(current) ? prev : current));
    };

    window.addEventListener('storage', syncBanks);
    window.addEventListener('bank_master_updated', syncBanks);
    window.addEventListener('bank_accounts_updated', syncBanks);
    syncBanks();
    return () => {
      isMounted = false;
      window.removeEventListener('storage', syncBanks);
      window.removeEventListener('bank_master_updated', syncBanks);
      window.removeEventListener('bank_accounts_updated', syncBanks);
    };
  }, []);

  const activeBankList = Array.isArray(bankAccountsMaster) ? bankAccountsMaster : bankOptions;

  const [masterParties, setMasterParties] = useState(() => getMasterParties());

  useEffect(() => {
    let isMounted = true;
    const syncParties = () => {
      if (!isMounted) return;
      const current = getMasterParties();
      setMasterParties(prev => (JSON.stringify(prev) === JSON.stringify(current) ? prev : current));
    };

    window.addEventListener('storage', syncParties);
    window.addEventListener('pump_parties_updated', syncParties);
    syncParties();
    return () => {
      isMounted = false;
      window.removeEventListener('storage', syncParties);
      window.removeEventListener('pump_parties_updated', syncParties);
    };
  }, []);

  const activePartiesList = (masterParties && masterParties.length > 0)
    ? masterParties
    : ((customerList && customerList.length > 0) ? customerList : getMasterParties());

  const findCatalogItem = (productName, catalog) => {
    if (!productName || !Array.isArray(catalog)) return null;
    for (const group of catalog) {
      if (Array.isArray(group.items)) {
        const match = group.items.find(item => item.name === productName || item.id === productName);
        if (match) return match;
      }
    }
    return null;
  };

  const [matrixProducts, setMatrixProducts] = useState(() => {
    try {
      const saved = localStorage.getItem('pump_lubricant_monthly_matrix');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [removedLubes, setRemovedLubes] = useState(() => {
    try {
      const saved = localStorage.getItem('lube_removed_products');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  useEffect(() => {
    let isMounted = true;
    const syncMatrixProducts = () => {
      if (!isMounted) return;
      try {
        const saved = localStorage.getItem('pump_lubricant_monthly_matrix');
        if (saved) {
          const parsed = JSON.parse(saved);
          setMatrixProducts(prev => (JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed));
        }
        const savedRemoved = localStorage.getItem('lube_removed_products');
        if (savedRemoved) {
          const parsedRemoved = JSON.parse(savedRemoved);
          setRemovedLubes(prev => (JSON.stringify(prev) === JSON.stringify(parsedRemoved) ? prev : parsedRemoved));
        }
      } catch (e) {}
    };

    window.addEventListener('pump_product_catalog_updated', syncMatrixProducts);
    window.addEventListener('lubricant_matrix_updated', syncMatrixProducts);
    window.addEventListener('storage', syncMatrixProducts);
    syncMatrixProducts();

    return () => {
      isMounted = false;
      window.removeEventListener('pump_product_catalog_updated', syncMatrixProducts);
      window.removeEventListener('lubricant_matrix_updated', syncMatrixProducts);
      window.removeEventListener('storage', syncMatrixProducts);
    };
  }, []);

  // Combined Active Lubricant Products for Section B Dropdown
  const activeLubricantOptions = React.useMemo(() => {
    const map = new Map();

    // 1. Primary Source: shared lubricantProducts master from AppContext
    if (Array.isArray(lubricantProducts) && lubricantProducts.length > 0) {
      lubricantProducts.forEach(p => {
        if (p && p.name && !removedLubes.includes(p.id) && !removedLubes.includes(p.name)) {
          map.set(p.name.toLowerCase(), {
            id: p.id || p.name,
            name: p.name,
            volume: p.volume || p.packVolume || 1.0,
            price: p.price || 0
          });
        }
      });
    }

    // 2. Add products registered in Lubricants Monthly Matrix sheet
    if (Array.isArray(matrixProducts)) {
      matrixProducts.forEach(p => {
        if (p && p.name && !removedLubes.includes(p.id) && !removedLubes.includes(p.name)) {
          if (!map.has(p.name.toLowerCase())) {
            map.set(p.name.toLowerCase(), {
              id: p.id || p.name,
              name: p.name,
              volume: p.packVolume || p.volume || 1.0,
              price: p.price || 0
            });
          }
        }
      });
    }

    // 3. Add products registered in AppContext product catalog
    if (Array.isArray(productCatalog)) {
      productCatalog.forEach(group => {
        const c = (group.category || '').toLowerCase();
        if (c.includes('lube') || c.includes('oil') || c.includes('additive') || c.includes('specialt') || !c.includes('fuel')) {
          if (Array.isArray(group.items)) {
            group.items.forEach(item => {
              if (item && item.name && !removedLubes.includes(item.id) && !removedLubes.includes(item.name)) {
                if (!map.has(item.name.toLowerCase())) {
                  map.set(item.name.toLowerCase(), {
                    id: item.id || item.name,
                    name: item.name,
                    volume: item.defaultVolume || 1.0,
                    price: item.defaultPrice || 0
                  });
                }
              }
            });
          }
        }
      });
    }

    if (map.size === 0) {
      return [
        { id: '1', name: '2T Engine Oil (Pouches/Bottles)', volume: 0.04, price: 15 },
        { id: '2', name: '4T 20W-40 Bike Oil', volume: 1.0, price: 380 },
        { id: '3', name: '15W-40 Heavy Diesel Engine Oil', volume: 1.0, price: 420 },
        { id: '4', name: 'Gear Oil EP 90/140', volume: 1.0, price: 350 },
        { id: '5', name: 'Grease AP3 / MP', volume: 1.0, price: 280 },
        { id: '6', name: 'DEF / AdBlue (EcoClean)', volume: 1.0, price: 65 }
      ];
    }

    return Array.from(map.values());
  }, [lubricantProducts, matrixProducts, productCatalog, removedLubes]);

  const getFirstValidLubricant = (index = 0) => {
    if (activeLubricantOptions.length > index && activeLubricantOptions[index]?.name) {
      return activeLubricantOptions[index].name;
    }
    if (activeLubricantOptions.length > 0 && activeLubricantOptions[0]?.name) {
      return activeLubricantOptions[0].name;
    }
    return '2T Engine Oil (Pouches/Bottles)';
  };

  const createDefaultLubricantRow = (index = 0) => {
    const pName = getFirstValidLubricant(index);
    const match = activeLubricantOptions.find(opt => opt.name === pName);
    const defaultVol = match ? match.volume : 1.0;
    const defaultPrice = match ? match.price : 0;

    return {
      id: Date.now() + Math.random(),
      syncId: `lube-${Date.now()}-${Math.random()}`,
      productName: pName,
      litreVolume: defaultVol,
      volume: defaultVol,
      soldQty: 0,
      soldCount: 0,
      unitPrice: defaultPrice,
      rate: defaultPrice,
      totalAmount: 0
    };
  };

  const updateLubricantItem = (index, field, value) => {
    const updated = [...lubricants];
    const item = { ...updated[index] };

    if (field === 'productName') {
      item.productName = value;
      const match = activeLubricantOptions.find(opt => opt.name === value);
      if (match) {
        item.litreVolume = match.volume || 1.0;
        item.volume = match.volume || 1.0;
        item.unitPrice = match.price || 0;
        item.rate = match.price || 0;
      }
    } else if (field === 'litreVolume' || field === 'volume') {
      const v = value === '' ? '' : (parseFloat(value) || 0);
      item.litreVolume = v;
      item.volume = v;
    } else if (field === 'soldQty' || field === 'soldCount') {
      const q = value === '' ? '' : (parseFloat(value) || 0);
      item.soldQty = q;
      item.soldCount = q;
    } else if (field === 'unitPrice' || field === 'rate') {
      const p = value === '' ? '' : (parseFloat(value) || 0);
      item.unitPrice = p;
      item.rate = p;
    } else {
      item[field] = value;
    }

    item.totalAmount = calculateLubricantRowTotal(item);
    updated[index] = item;
    setLubricants(updated);
  };

  useEffect(() => {
    if (!lubricants || lubricants.length === 0) return;
    let needsFix = false;
    const fixed = lubricants.map((l, idx) => {
      if (!l.productName || l.productName === 'Select Product / Lubricant') {
        needsFix = true;
        const defaultProd = getFirstValidLubricant(idx);
        const match = activeLubricantOptions.find(opt => opt.name === defaultProd);
        const defaultVol = match ? match.volume : 1.0;
        const defaultPrice = match ? match.price : 0;
        return {
          ...l,
          productName: defaultProd,
          litreVolume: l.litreVolume || defaultVol,
          volume: l.volume || defaultVol,
          unitPrice: l.unitPrice || defaultPrice,
          rate: l.rate || defaultPrice
        };
      }
      return l;
    });
    if (needsFix) {
      setLubricants(fixed);
    }
  }, [lubricants, activeLubricantOptions]);

  // --- Cash Calculator Modal State ---
  const [isCashCalcOpen, setIsCashCalcOpen] = useState(false);
  // --- Shift Summary PDF Auto-Prompt State ---
  const [shiftPdfSnapshot, setShiftPdfSnapshot] = useState(null);
  const [showShiftPdfModal, setShowShiftPdfModal] = useState(false);
  const [calcDenoms, setCalcDenoms] = useState({
    n500: 0,
    n200: 0,
    n100: 0,
    n50: 0,
    n20: 0,
    n10: 0,
    n5: 0,
    coins: 0
  });

  const calcTotalCash = (
    (parseFloat(calcDenoms.n500) || 0) * 500 +
    (parseFloat(calcDenoms.n200) || 0) * 200 +
    (parseFloat(calcDenoms.n100) || 0) * 100 +
    (parseFloat(calcDenoms.n50) || 0) * 50 +
    (parseFloat(calcDenoms.n20) || 0) * 20 +
    (parseFloat(calcDenoms.n10) || 0) * 10 +
    (parseFloat(calcDenoms.n5) || 0) * 5 +
    (parseFloat(calcDenoms.coins) || 0) * 1
  );

  // --- Tank Dip Manual Litres (100% Manual Entry - No Automatic Clamping or Calculation) ---
  const msEffectiveLitres = dips.msDipLiters !== undefined && dips.msDipLiters !== '' ? (parseFloat(dips.msDipLiters) || 0) : 0;
  const hsdEffectiveLitres = dips.hsdDipLiters !== undefined && dips.hsdDipLiters !== '' ? (parseFloat(dips.hsdDipLiters) || 0) : 0;
  const speedEffectiveLitres = dips.speedDipLiters !== undefined && dips.speedDipLiters !== '' ? (parseFloat(dips.speedDipLiters) || 0) : 0;

  // --- Strict Normalized Fuel Product Schema ---
  const FUEL_PRODUCTS = [
    { id: 'petrol', label: 'Petrol (MS)', fullName: 'Motor Spirit (Petrol)', defaultRateKey: 'msRate' },
    { id: 'diesel', label: 'Diesel (HSD)', fullName: 'High Speed Diesel', defaultRateKey: 'hsdRate' },
    { id: 'speed', label: 'Speed Petrol (XP)', fullName: 'XP Premium Petrol', defaultRateKey: 'speedRate' },
    { id: 'cng', label: 'CNG', fullName: 'CNG', defaultRateKey: 'cngRate' }
  ];

  const getNormalizedProductName = (rawName) => {
    const p = (rawName || '').trim().toLowerCase();
    if (p.includes('diesel') || p.includes('hsd')) {
      return 'High Speed Diesel';
    }
    if (p.includes('xp') || p.includes('speed') || p.includes('power')) {
      return 'XP Premium Petrol';
    }
    if (p.includes('cng')) {
      return 'CNG';
    }
    return 'Motor Spirit (Petrol)';
  };

  // --- Core Formulas Math ---
  const totalFuelSalesAmount = nozzles.reduce((acc, n) => acc + (n.totalAmount || 0), 0);
  const totalFuelSalesLitres = nozzles.reduce((acc, n) => acc + (n.salesLitres || 0), 0);

  // --- Product-wise Volume & Revenue Aggregations ---
  const nozzleTotals = React.useMemo(() => {
    return nozzles.reduce(
      (acc, n) => {
        const norm = getNormalizedProductName(n.productName);
        const litres = parseFloat(n.salesLitres) || 0;
        const amt = parseFloat(n.totalAmount) || 0;

        if (norm === 'High Speed Diesel') {
          acc.dieselLitres += litres;
          acc.dieselAmount += amt;
        } else if (norm === 'XP Premium Petrol') {
          acc.speedLitres += litres;
          acc.speedAmount += amt;
        } else if (norm === 'CNG') {
          acc.cngKg += litres;
          acc.cngAmount += amt;
        } else {
          acc.petrolLitres += litres;
          acc.petrolAmount += amt;
        }
        return acc;
      },
      {
        petrolLitres: 0, petrolAmount: 0,
        dieselLitres: 0, dieselAmount: 0,
        speedLitres: 0, speedAmount: 0,
        cngKg: 0, cngAmount: 0,
        otherLitres: 0, otherAmount: 0
      }
    );
  }, [nozzles]);

  // Real-Time Live Fuel Sales Broadcast Pipeline to Stock Patrak
  useEffect(() => {
    if (!selectedDate) return;
    const pLitres = Number((nozzleTotals.petrolLitres || 0).toFixed(2));
    const dLitres = Number((nozzleTotals.dieselLitres || 0).toFixed(2));
    const sLitres = Number((nozzleTotals.speedLitres || 0).toFixed(2));

    window.dispatchEvent(new CustomEvent('live_fuel_sales_update', {
      detail: {
        date: selectedDate,
        volumes: {
          'PETROL (MS)': pLitres,
          'DIESEL (HSD)': dLitres,
          'SMART FUEL': sLitres
        }
      }
    }));
  }, [selectedDate, nozzleTotals.petrolLitres, nozzleTotals.dieselLitres, nozzleTotals.speedLitres]);

  const cngLubricantItem = lubricants.find(l => (l.productName || '').toLowerCase().includes('cng'));
  const cngFromLubricantKg = cngLubricantItem ? (parseFloat(cngLubricantItem.soldCount) || 0) : 0;
  const cngFromLubricantAmt = cngLubricantItem ? (parseFloat(cngLubricantItem.totalAmount) || 0) : 0;

  const totalCngKgCombined = nozzleTotals.cngKg + cngFromLubricantKg;
  const totalCngAmtCombined = nozzleTotals.cngAmount + cngFromLubricantAmt;

  // Live Sync Total CNG Volume from Active Nozzles into AppContext
  useEffect(() => {
    const cngVol = Number((totalCngKgCombined || nozzleTotals.cngKg || 0).toFixed(2));
    if (updateCngDispensedLive) {
      updateCngDispensedLive(cngVol);
    }
    try {
      window.dispatchEvent(new CustomEvent('live_cng_sales_update', {
        detail: { date: selectedDate, volume: cngVol }
      }));
    } catch (e) {}
  }, [totalCngKgCombined, nozzleTotals.cngKg, selectedDate, updateCngDispensedLive]);

  const sumOfTotalVolume = lubricants.reduce((acc, l) => {
    const vol = parseFloat(l.litreVolume ?? l.volume) || 0;
    const qty = parseFloat(l.soldQty ?? l.soldCount) || 0;
    return acc + (vol > 0 && qty > 0 ? (vol * qty) : 0);
  }, 0);

  const sumOfSoldQty = lubricants.reduce((acc, l) => acc + (parseFloat(l.soldQty ?? l.soldCount) || 0), 0);

  const grandTotalSellAmount = lubricants.reduce((acc, l) => acc + calculateLubricantRowTotal(l), 0);

  const [openingShreeSilak, setOpeningShreeSilak] = useState(() => {
    if (stationProfile && stationProfile.openingShreeSilak !== undefined && stationProfile.openingShreeSilak !== '') {
      return parseFloat(stationProfile.openingShreeSilak) || 0;
    }
    return 50000;
  });

  useEffect(() => {
    if (stationProfile && stationProfile.openingShreeSilak !== undefined && stationProfile.openingShreeSilak !== '') {
      setOpeningShreeSilak(parseFloat(stationProfile.openingShreeSilak) || 0);
    }
  }, [stationProfile]);

  const totalOilCngAmount = grandTotalSellAmount;
  const totalFuelAndOilRevenue = totalFuelSalesAmount + totalOilCngAmount;

  const totalDigitalPay = digitalPayEntries.reduce((acc, d) => acc + (parseFloat(d.amount) || 0), 0);
  const totalSmartMoney = smartMoneyEntries.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
  const totalSmartBalance = totalDigitalPay + totalSmartMoney;

  const totalOtherIncome = otherIncomeEntries.reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
  const totalJamaRecovered = jamaEntries.reduce((acc, j) => acc + (parseFloat(j.amount) || 0), 0);

  // Financial Engine Logic (Final Shree Silak)
  const totalInflowGrossCashIn = 
    (parseFloat(openingShreeSilak) || 0) +
    totalFuelSalesAmount +
    totalOilCngAmount +
    totalJamaRecovered +
    totalOtherIncome;

  const totalCustomerDebits = debitEntries.reduce((acc, d) => acc + (parseFloat(d.amount) || 0), 0);
  const totalExpensesKharch = expenseEntries.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
  const totalBankDeposits = bankEntries.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);

  const totalOutflowDeductions = 
    totalCustomerDebits +
    totalSmartBalance +
    totalExpensesKharch +
    totalBankDeposits;

  const closingShreeSilak = totalInflowGrossCashIn - totalOutflowDeductions;
  const closingDrawerCashShreeSilak = closingShreeSilak;
  const grossCashInflow = totalInflowGrossCashIn;
  const netCashInHand = closingShreeSilak + totalBankDeposits;

  const actualPhysicalCash = (
    (denominations.n2000 * 2000) +
    (denominations.n500 * 500) +
    (denominations.n200 * 200) +
    (denominations.n100 * 100) +
    (denominations.n50 * 50) +
    (denominations.n20 * 20) +
    (denominations.n10 * 10) +
    (denominations.coins * 1)
  );

  const cashVariance = actualPhysicalCash - closingShreeSilak;

  // --- Rate Lookup Helper ---
  const getProductRate = (pName) => {
    const norm = getNormalizedProductName(pName);
    const r = rates || {};
    if (norm === 'High Speed Diesel') {
      const val = r['High Speed Diesel'];
      return val !== undefined && val !== '' && !Number.isNaN(Number(val)) ? Number(val) : 0;
    }
    if (norm === 'XP Premium Petrol') {
      const val = r['Speed Petrol'] !== undefined && r['Speed Petrol'] !== '' ? r['Speed Petrol'] : r['XP Premium Petrol'];
      return val !== undefined && val !== '' && !Number.isNaN(Number(val)) ? Number(val) : 0;
    }
    if (norm === 'CNG') {
      const val = r['CNG'];
      return val !== undefined && val !== '' && !Number.isNaN(Number(val)) ? Number(val) : 0;
    }
    const val = r['Motor Spirit (Petrol)'];
    return val !== undefined && val !== '' && !Number.isNaN(Number(val)) ? Number(val) : 0;
  };

  const normalizeFuelProduct = (val) => {
    if (!val) return 'MS Petrol';
    const norm = val.toLowerCase();
    if (norm.includes('hsd') || norm.includes('diesel')) return 'HSD Diesel';
    if (norm.includes('speed') || norm.includes('xp') || norm.includes('premium')) return 'Speed Petrol';
    if (norm.includes('cng')) return 'CNG';
    return 'MS Petrol';
  };

  const getFuelRate = (fuelProduct) => {
    const norm = normalizeFuelProduct(fuelProduct);
    const r = rates || {};
    if (norm === 'HSD Diesel') {
      const val = r['High Speed Diesel'];
      return val !== undefined && val !== '' && !Number.isNaN(Number(val)) ? Number(val) : 0;
    }
    if (norm === 'Speed Petrol') {
      const val = r['Speed Petrol'] !== undefined && r['Speed Petrol'] !== '' ? r['Speed Petrol'] : r['XP Premium Petrol'];
      return val !== undefined && val !== '' && !Number.isNaN(Number(val)) ? Number(val) : 0;
    }
    if (norm === 'CNG') {
      const val = r['CNG'];
      return val !== undefined && val !== '' && !Number.isNaN(Number(val)) ? Number(val) : 0;
    }
    const val = r['Motor Spirit (Petrol)'];
    return val !== undefined && val !== '' && !Number.isNaN(Number(val)) ? Number(val) : 0;
  };

  const handleRateChange = (fuelKey, rawValue) => {
    // Allow empty string while typing so user can clear and type 0
    if (rawValue === '') {
      setRates(prev => ({ ...prev, [fuelKey]: '' }));
      return;
    }
    const numVal = parseFloat(rawValue);
    const cleanVal = Number.isNaN(numVal) ? 0 : Math.max(0, numVal);
    setRates(prev => {
      const updated = { ...prev, [fuelKey]: cleanVal };
      try {
        localStorage.setItem('pump_last_fuel_rates', JSON.stringify(updated));
        const activeUser = localStorage.getItem('mypump_current_user');
        const userId = activeUser ? JSON.parse(activeUser)?.id : null;
        if (userId) {
          localStorage.setItem(`mypump_${userId}_pump_last_fuel_rates`, JSON.stringify(updated));
          localStorage.setItem(`mypump_${userId}_locked_fuel_rates`, JSON.stringify(updated));
        }
      } catch (e) {}
      return updated;
    });
  };

  const handleRateBlur = (fuelKey) => {
    setRates(prev => {
      const currentVal = prev[fuelKey];
      if (currentVal === '' || currentVal === null || currentVal === undefined || Number.isNaN(Number(currentVal))) {
        const updated = { ...prev, [fuelKey]: 0 };
        try {
          localStorage.setItem('pump_last_fuel_rates', JSON.stringify(updated));
          const activeUser = localStorage.getItem('mypump_current_user');
          const userId = activeUser ? JSON.parse(activeUser)?.id : null;
          if (userId) {
            localStorage.setItem(`mypump_${userId}_pump_last_fuel_rates`, JSON.stringify(updated));
            localStorage.setItem(`mypump_${userId}_locked_fuel_rates`, JSON.stringify(updated));
          }
        } catch (e) {}
        return updated;
      }
      return prev;
    });
  };

  // --- Section E Real-time Dynamic Breakdown Accumulators ---
  const sectionETotals = React.useMemo(() => {
    let msDebitLitres = 0;
    let hsdDebitLitres = 0;
    let speedDebitLitres = 0;
    let cngDebitLitres = 0;

    let msLocalLitres = 0;
    let hsdLocalLitres = 0;
    let speedLocalLitres = 0;
    let cngLocalLitres = 0;

    let totalDebitBillAmount = 0;
    let totalLocalBillAmount = 0;

    (debitEntries || []).forEach(d => {
      const norm = normalizeFuelProduct(d.fuelProduct || d.fuelType);
      const billType = d.billType || 'Debit Bill';
      const l = parseFloat(d.litres) || 0;
      const amt = parseFloat(d.amount) || 0;

      if (billType === 'Debit Bill') {
        totalDebitBillAmount += amt;
        if (norm === 'HSD Diesel') hsdDebitLitres += l;
        else if (norm === 'Speed Petrol') speedDebitLitres += l;
        else if (norm === 'CNG') cngDebitLitres += l;
        else msDebitLitres += l;
      } else if (billType === 'Local Bill') {
        totalLocalBillAmount += amt;
        if (norm === 'HSD Diesel') hsdLocalLitres += l;
        else if (norm === 'Speed Petrol') speedLocalLitres += l;
        else if (norm === 'CNG') cngLocalLitres += l;
        else msLocalLitres += l;
      }
    });

    return {
      msDebitLitres: Number(msDebitLitres.toFixed(2)),
      hsdDebitLitres: Number(hsdDebitLitres.toFixed(2)),
      speedDebitLitres: Number(speedDebitLitres.toFixed(2)),
      cngDebitLitres: Number(cngDebitLitres.toFixed(2)),
      msLocalLitres: Number(msLocalLitres.toFixed(2)),
      hsdLocalLitres: Number(hsdLocalLitres.toFixed(2)),
      speedLocalLitres: Number(speedLocalLitres.toFixed(2)),
      cngLocalLitres: Number(cngLocalLitres.toFixed(2)),
      totalDebitBillAmount: Number(totalDebitBillAmount.toFixed(2)),
      totalLocalBillAmount: Number(totalLocalBillAmount.toFixed(2)),
      grandTotalAmount: Number((totalDebitBillAmount + totalLocalBillAmount).toFixed(2))
    };
  }, [debitEntries]);

  // Synchronize Section C Creditors Recovery with Customer Ledger Live State
  const lastJamaSyncRef = React.useRef('');
  useEffect(() => {
    if (!syncCreditorPayment || !Array.isArray(jamaEntries)) return;
    const jsonStr = JSON.stringify(jamaEntries);
    if (lastJamaSyncRef.current !== jsonStr) {
      lastJamaSyncRef.current = jsonStr;
      syncCreditorPayment(jamaEntries);
    }
  }, [jamaEntries, syncCreditorPayment]);

  // Synchronize Section A + Section E with Sell Patrak Live Feed
  useEffect(() => {
    if (!updateSellPatrakFeed) return;
    const pLitres = nozzleTotals.petrolLitres || 0;
    const dLitres = nozzleTotals.dieselLitres || 0;
    const sLitres = nozzleTotals.speedLitres || 0;

    const msDebit = sectionETotals.msDebitLitres || 0;
    const hsdDebit = sectionETotals.hsdDebitLitres || 0;
    const speedDebit = sectionETotals.speedDebitLitres || 0;

    updateSellPatrakFeed({
      'PETROL (MS)': {
        totalDispensed: Number(pLitres.toFixed(2)),
        debitLitres: Number(msDebit.toFixed(2)),
        cashLitres: Number(Math.max(0, pLitres - msDebit).toFixed(2))
      },
      'DIESEL (HSD)': {
        totalDispensed: Number(dLitres.toFixed(2)),
        debitLitres: Number(hsdDebit.toFixed(2)),
        cashLitres: Number(Math.max(0, dLitres - hsdDebit).toFixed(2))
      },
      'SMART FUEL': {
        totalDispensed: Number(sLitres.toFixed(2)),
        debitLitres: Number(speedDebit.toFixed(2)),
        cashLitres: Number(Math.max(0, sLitres - speedDebit).toFixed(2))
      }
    });
  }, [
    nozzleTotals.petrolLitres,
    nozzleTotals.dieselLitres,
    nozzleTotals.speedLitres,
    sectionETotals.msDebitLitres,
    sectionETotals.hsdDebitLitres,
    sectionETotals.speedDebitLitres,
    updateSellPatrakFeed
  ]);

  const updateDebitEntry = (index, field, val) => {
    const updated = [...debitEntries];
    const item = { ...updated[index] };

    if (field === 'customer') {
      const selectedVal = val;
      const cust = activePartiesList.find(c => String(c.id) === String(selectedVal) || c.name === selectedVal);
      item.customerId = cust ? cust.id : selectedVal;
      item.customerName = cust ? cust.name : selectedVal;
    } else if (field === 'vehicleNo') {
      item.vehicleNo = val;
    } else if (field === 'slipNo' || field === 'billNo') {
      item.slipNo = val;
      item.billNo = val;
    } else if (field === 'fuelProduct' || field === 'fuelType') {
      const normFuel = normalizeFuelProduct(val);
      item.fuelProduct = normFuel;
      item.fuelType = normFuel;
      const l = parseFloat(item.litres) || 0;
      const r = getFuelRate(normFuel);
      item.rate = r;
      item.amount = Number((l * r).toFixed(2));
      item.isManualAmount = false;
    } else if (field === 'litres') {
      const l = val === '' ? '' : (parseFloat(val) || 0);
      item.litres = l;
      const lNum = parseFloat(l) || 0;
      const normFuel = normalizeFuelProduct(item.fuelProduct || item.fuelType);
      const r = getFuelRate(normFuel);
      item.rate = r;
      item.amount = Number((lNum * r).toFixed(2));
      item.isManualAmount = false;
    } else if (field === 'billType') {
      item.billType = val;
    } else if (field === 'amount') {
      item.amount = val === '' ? '' : (parseFloat(val) || 0);
      item.isManualAmount = true;
    }

    updated[index] = item;
    setDebitEntries(updated);
  };

  const handleSectionEKeyDown = (e) => {
    const key = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) {
      const target = e.target;
      const rowContainer = target.closest('.grid-row');
      const container = target.closest('[data-grid-container]');
      if (!rowContainer || !container) return;

      const rows = Array.from(container.querySelectorAll('.grid-row'));
      const rowIndex = rows.indexOf(rowContainer);
      if (rowIndex === -1) return;

      const inputsInRow = Array.from(rowContainer.querySelectorAll('input, select'));
      const colIndex = inputsInRow.indexOf(target);
      if (colIndex === -1) return;

      let nextRow = rowIndex;
      let nextCol = colIndex;

      if (key === 'ArrowUp') {
        nextRow = rowIndex - 1;
      } else if (key === 'ArrowDown' || key === 'Enter') {
        nextRow = rowIndex + 1;
      } else if (key === 'ArrowLeft') {
        if (target.selectionStart === 0 || target.selectionStart === undefined || target.tagName === 'SELECT') {
          nextCol = colIndex - 1;
        } else return;
      } else if (key === 'ArrowRight') {
        if (target.selectionEnd === target.value?.length || target.selectionEnd === undefined || target.tagName === 'SELECT') {
          nextCol = colIndex + 1;
        } else return;
      }

      if (nextRow >= 0 && nextRow < rows.length) {
        const targetRowInputs = Array.from(rows[nextRow].querySelectorAll('input, select'));
        const targetInput = targetRowInputs[Math.min(nextCol, targetRowInputs.length - 1)];
        if (targetInput) {
          e.preventDefault();
          targetInput.focus();
          if (typeof targetInput.select === 'function') targetInput.select();
        }
      }
    }
  };

  useEffect(() => {
    if (!debitEntries || debitEntries.length === 0) return;
    let changed = false;
    const updated = debitEntries.map(d => {
      if (d.isManualAmount) return d;
      const normFuel = normalizeFuelProduct(d.fuelProduct || d.fuelType);
      const r = getFuelRate(normFuel);
      const l = parseFloat(d.litres) || 0;
      const expectedAmount = Number((l * r).toFixed(2));
      if (d.amount !== expectedAmount && l > 0) {
        changed = true;
        return { ...d, fuelProduct: normFuel, fuelType: normFuel, rate: r, amount: expectedAmount };
      }
      return d;
    });
    if (changed) {
      setDebitEntries(updated);
    }
  }, [rates]);

  // Self-heal any stale nozzle sales (e.g. cl <= op with non-zero sales or legacy testingLitres = 20)
  useEffect(() => {
    if (!Array.isArray(nozzles) || nozzles.length === 0) return;
    let changed = false;
    const sanitized = nozzles.map(n => {
      const op = parseFloat(n.openingReading) || 0;
      const cl = parseFloat(n.closingReading) || 0;
      const ts = parseFloat(n.testingLitres) || 0;
      const rt = parseFloat(n.rate) || 0;

      let fixedTesting = n.testingLitres;
      if (ts === 20 && cl === 0) {
        fixedTesting = 0;
      }

      const { net, totalAmount } = calculateNozzleSales(op, cl, fixedTesting, rt);
      const curSales = parseFloat(n.salesLitres) || 0;
      const curTotal = parseFloat(n.totalAmount) || 0;

      if (curSales !== net || curTotal !== totalAmount || fixedTesting !== n.testingLitres) {
        changed = true;
        return {
          ...n,
          testingLitres: fixedTesting,
          salesLitres: net,
          totalAmount: totalAmount
        };
      }
      return n;
    });

    if (changed) {
      setNozzles(sanitized);
    }
  }, [nozzles]);

  // --- Handlers ---
  const handleNozzleChange = (index, field, value) => {
    const updated = [...nozzles];
    if (index < 0 || index >= updated.length) return;
    const item = { ...updated[index] };
    if (field === 'nozzleId') {
      item[field] = value;
    } else if (field === 'productName') {
      item[field] = value;
      item.rate = getProductRate(value);
    } else {
      item[field] = value === '' ? '' : (parseFloat(value) || 0);
    }
    const op = parseFloat(item.openingReading) || 0;
    const cl = parseFloat(item.closingReading) || 0;
    const ts = parseFloat(item.testingLitres) || 0;
    const rt = parseFloat(item.rate) || 0;

    const { gross, net, totalAmount } = calculateNozzleSales(op, cl, ts, rt);

    item.salesLitres = net;
    item.totalAmount = totalAmount;

    updated[index] = item;
    setNozzles(updated);

    // Instant Zero-Latency Broadcast to Stock Patrak
    let liveP = 0;
    let liveD = 0;
    let liveS = 0;
    updated.forEach(nz => {
      const norm = getNormalizedProductName(nz.productName);
      const l = parseFloat(nz.salesLitres) || 0;
      if (norm === 'High Speed Diesel') liveD += l;
      else if (norm === 'XP Premium Petrol') liveS += l;
      else if (norm !== 'CNG') liveP += l;
    });

    if (updateLiveFuelSales) {
      updateLiveFuelSales({
        'PETROL (MS)': Number(liveP.toFixed(2)),
        'DIESEL (HSD)': Number(liveD.toFixed(2)),
        'SMART FUEL': Number(liveS.toFixed(2))
      });
    }

    if (updateSellPatrakFeed) {
      updateSellPatrakFeed({
        'PETROL (MS)': {
          totalDispensed: Number(liveP.toFixed(2)),
          debitLitres: Number((sectionETotals?.msDebitLitres || 0).toFixed(2)),
          cashLitres: Number(Math.max(0, liveP - (sectionETotals?.msDebitLitres || 0)).toFixed(2))
        },
        'DIESEL (HSD)': {
          totalDispensed: Number(liveD.toFixed(2)),
          debitLitres: Number((sectionETotals?.hsdDebitLitres || 0).toFixed(2)),
          cashLitres: Number(Math.max(0, liveD - (sectionETotals?.hsdDebitLitres || 0)).toFixed(2))
        },
        'SMART FUEL': {
          totalDispensed: Number(liveS.toFixed(2)),
          debitLitres: Number((sectionETotals?.speedDebitLitres || 0).toFixed(2)),
          cashLitres: Number(Math.max(0, liveS - (sectionETotals?.speedDebitLitres || 0)).toFixed(2))
        }
      });
    }

    window.dispatchEvent(new CustomEvent('live_fuel_sales_update', {
      detail: {
        date: selectedDate,
        volumes: {
          'PETROL (MS)': Number(liveP.toFixed(2)),
          'DIESEL (HSD)': Number(liveD.toFixed(2)),
          'SMART FUEL': Number(liveS.toFixed(2))
        }
      }
    }));
  };

  const handleApplyGlobalRates = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      const cleanRate = (v) => {
        if (v === undefined || v === null || v === '') return 0;
        const n = parseFloat(v);
        return Number.isNaN(n) ? 0 : Math.max(0, n);
      };
      const lockedRates = {
        'Motor Spirit (Petrol)': cleanRate(rates['Motor Spirit (Petrol)']),
        'High Speed Diesel': cleanRate(rates['High Speed Diesel']),
        'Speed Petrol': cleanRate(rates['Speed Petrol'] !== undefined && rates['Speed Petrol'] !== '' ? rates['Speed Petrol'] : rates['XP Premium Petrol']),
        'CNG': cleanRate(rates['CNG'])
      };

      if (lockFuelRates) {
        await lockFuelRates(lockedRates);
      } else {
        setRates(lockedRates);
      }

      if (Array.isArray(nozzles)) {
        const updated = nozzles.map(n => {
          const norm = getNormalizedProductName(n?.productName);
          let newRate = 0;
          if (norm === 'High Speed Diesel') newRate = lockedRates['High Speed Diesel'];
          else if (norm === 'XP Premium Petrol') newRate = lockedRates['Speed Petrol'];
          else if (norm === 'CNG') newRate = lockedRates['CNG'];
          else newRate = lockedRates['Motor Spirit (Petrol)'];

          const sales = parseFloat(n?.salesLitres) || 0;
          return {
            ...n,
            rate: newRate,
            totalAmount: Number((sales * newRate).toFixed(2))
          };
        });
        setNozzles(updated);

        try {
          localStorage.setItem('pump_nozzle_master_config', JSON.stringify(updated));
          const activeUser = localStorage.getItem('mypump_current_user');
          const userId = activeUser ? JSON.parse(activeUser)?.id : null;
          if (userId) {
            localStorage.setItem(`mypump_${userId}_pump_nozzle_master_config`, JSON.stringify(updated));
          }
        } catch (err) {}
      }
      showToast('Fuel Rates Locked & Applied to All Nozzles!', 'success');
    } catch (err) {
      console.error('Handled action error without reloading in handleApplyGlobalRates:', err);
      showToast('Error applying rates: ' + err.message, 'error');
    }
  };

  const handleClearAllNozzles = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      if (isShiftArchived) {
        showToast('Cannot reset nozzles on an archived/locked shift.', 'warning');
        return;
      }
      if (!Array.isArray(nozzles) || nozzles.length === 0) return;
      if (window.confirm('Are you sure you want to reset all current nozzle closing readings?')) {
        const reset = nozzles.map(n => {
          const op = parseFloat(n?.openingReading) || 0;
          return {
            ...n,
            closingReading: op,
            testingLitres: 0,
            salesLitres: 0,
            totalAmount: 0
          };
        });
        setNozzles(reset);

        if (updateLiveFuelSales) {
          updateLiveFuelSales({
            'PETROL (MS)': 0,
            'DIESEL (HSD)': 0,
            'SMART FUEL': 0
          });
        }

        if (updateSellPatrakFeed) {
          updateSellPatrakFeed({
            'PETROL (MS)': {
              totalDispensed: 0,
              debitLitres: Number((sectionETotals?.msDebitLitres || 0).toFixed(2)),
              cashLitres: 0
            },
            'DIESEL (HSD)': {
              totalDispensed: 0,
              debitLitres: Number((sectionETotals?.hsdDebitLitres || 0).toFixed(2)),
              cashLitres: 0
            },
            'SMART FUEL': {
              totalDispensed: 0,
              debitLitres: Number((sectionETotals?.speedDebitLitres || 0).toFixed(2)),
              cashLitres: 0
            }
          });
        }

        window.dispatchEvent(new CustomEvent('live_fuel_sales_update', {
          detail: {
            date: selectedDate,
            volumes: {
              'PETROL (MS)': 0,
              'DIESEL (HSD)': 0,
              'SMART FUEL': 0
            }
          }
        }));

        showToast('Reset all nozzle closing readings to opening readings.', 'info');
      }
    } catch (err) {
      console.error('Handled action error without reloading in handleClearAllNozzles:', err);
    }
  };
  const handleResetNozzles = handleClearAllNozzles;

  const handleSaveToNextShift = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      // Capture a snapshot copy of the just-completed shift's full data for the PDF generator
      const completedShiftSnapshot = {
        stationName: stationProfile?.fuelStationName || 'SHITAL PETROL PUMP',
        gstin: stationProfile?.gstin || '24AAAAA0000A1Z5',
        address: stationProfile?.address || 'State Highway, Kheralu',
        date: selectedDate,
        shiftType: activeShift,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
        rates: { ...rates },
        dips: { ...dips },
        nozzles: (Array.isArray(nozzles) ? nozzles : []).map((n, idx) => ({
          ...n,
          mpdId: n.mpdId || getMpdIdForNozzle(n, idx),
          productName: getNormalizedProductName(n.productName)
        })),
        nozzleTotals: { ...nozzleTotals },
        totalCngKgCombined,
        totalCngAmtCombined,
        totalFuelSalesAmount,
        lubricants: (Array.isArray(lubricants) ? lubricants : []).map(l => ({
          ...l,
          rowTotal: calculateLubricantRowTotal(l)
        })),
        totalOilCngAmount,
        jamaEntries: (Array.isArray(jamaEntries) ? jamaEntries : []).map(j => ({ ...j })),
        totalJamaRecovered,
        otherIncomeEntries: (Array.isArray(otherIncomeEntries) ? otherIncomeEntries : []).map(i => ({ ...i })),
        totalOtherIncome,
        openingShreeSilak: parseFloat(openingShreeSilak) || 0,
        totalInflowGrossCashIn,
        debitEntries: (Array.isArray(debitEntries) ? debitEntries : []).map(d => ({ ...d })),
        totalCustomerDebits,
        sectionETotals: { ...sectionETotals },
        digitalPayEntries: (Array.isArray(digitalPayEntries) ? digitalPayEntries : []).map(d => ({ ...d })),
        smartMoneyEntries: (Array.isArray(smartMoneyEntries) ? smartMoneyEntries : []).map(s => ({ ...s })),
        totalDigitalPay,
        totalSmartMoney,
        totalSmartBalance,
        expenseEntries: (Array.isArray(expenseEntries) ? expenseEntries : []).map(e => ({ ...e })),
        totalExpensesKharch,
        bankEntries: (Array.isArray(bankEntries) ? bankEntries : []).map(b => ({ ...b })),
        totalBankDeposits,
        totalOutflowDeductions,
        closingShreeSilak,
        savedAt: new Date().toISOString()
      };

      setShiftPdfSnapshot(completedShiftSnapshot);
      setShowShiftPdfModal(true);

      // 1. STEP A: Compile & Save Today's Complete Snapshot into my_pump_daily_shifts_archive
      const shiftSnapshot = {
        date: selectedDate,
        shiftType: activeShift,
        dips,
        tankDips: dips,
        rates,
        fuelRates: rates,
        nozzles,
        sectionA_Nozzles: nozzles,
        lubricants,
        sectionB_Lubricants: lubricants,
        expenseEntries,
        sectionG_Expenses: expenseEntries,
        otherIncomeEntries,
        sectionD_OtherIncome: otherIncomeEntries,
        debitEntries,
        sectionE_Debiters: debitEntries,
        jamaEntries,
        sectionC_Crediters: jamaEntries,
        bankEntries,
        sectionH_BankHisab: bankEntries,
        smartBalanceEntries,
        digitalPayEntries,
        smartMoneyEntries,
        sectionF_DigitalPay: [...(Array.isArray(digitalPayEntries) ? digitalPayEntries : []), ...(Array.isArray(smartMoneyEntries) ? smartMoneyEntries : [])],
        denominations,
        openingShreeSilak,
        closingShreeSilak,
        savedAt: new Date().toISOString()
      };
      // 2. Trigger Simulation Shift Handover immediately for instant, smooth, zero-error UI advancement
      if (simulateSaveToNextShift) {
        simulateSaveToNextShift();
      }

      // 3. Background permanent local database, archives/ & rolling safety backup persistence
      try {
        persistShiftClosure({
          date: selectedDate,
          shiftType: activeShift,
          nozzles: Array.isArray(nozzles) ? nozzles : [],
          dips: dips || {},
          rates: rates || {},
          lubricants: Array.isArray(lubricants) ? lubricants : [],
          expenseEntries: Array.isArray(expenseEntries) ? expenseEntries : [],
          otherIncomeEntries: Array.isArray(otherIncomeEntries) ? otherIncomeEntries : [],
          debitEntries: Array.isArray(debitEntries) ? debitEntries : [],
          jamaEntries: Array.isArray(jamaEntries) ? jamaEntries : [],
          bankEntries: Array.isArray(bankEntries) ? bankEntries : [],
          smartBalanceEntries: Array.isArray(smartBalanceEntries) ? smartBalanceEntries : [],
          smartMoneyEntries: Array.isArray(smartMoneyEntries) ? smartMoneyEntries : [],
          denominations: denominations || {},
          stationProfile: stationProfile || {},
          totals: {
            grossInflow: totalInflowGrossCashIn,
            totalDeductions: totalOutflowDeductions
          },
          closingShreeSilak,
          openingShreeSilak: parseFloat(openingShreeSilak) || 0
        }).catch(err => console.warn('Background local archive persistence bypassed:', err));
      } catch (err) {
        console.warn('Local archive save skipped:', err);
      }

      // 4. Background async save (bypasses any DB error so UI transitions remain instantaneous)
      try {
        processShiftSave({
          selectedDate,
          activeShift,
          shiftData: {
            ...shiftSnapshot,
            nozzleTotals,
            nozzles: Array.isArray(nozzles) ? nozzles : [],
            lubricants: Array.isArray(lubricants) ? lubricants : [],
            debitEntries: Array.isArray(debitEntries) ? debitEntries : [],
            jamaEntries: Array.isArray(jamaEntries) ? jamaEntries : [],
            smartBalanceEntries: Array.isArray(smartBalanceEntries) ? smartBalanceEntries : [],
            digitalPayEntries: Array.isArray(digitalPayEntries) ? digitalPayEntries : [],
            smartMoneyEntries: Array.isArray(smartMoneyEntries) ? smartMoneyEntries : [],
            bankEntries: Array.isArray(bankEntries) ? bankEntries : [],
            customerList: Array.isArray(customerList) ? customerList : [],
            rates: rates || {}
          }
        }).catch(err => console.warn('Background shift persistence bypassed:', err));
      } catch (err) {
        console.warn('Background shift save skipped in simulation mode:', err);
      }

      // 3. STEP C: In-Place Workspace Reset (Stay on Active Shift Context - DO NOT jump date to tomorrow)
      const refreshedNozzles = (Array.isArray(nozzles) ? nozzles : []).map(nz => {
        const prevClosing = parseFloat(nz.closingReading) || 0;
        const newOpening = prevClosing > 0 ? prevClosing : (parseFloat(nz.openingReading) || 0);
        return {
          ...nz,
          openingReading: newOpening,
          closingReading: 0,
          testingLitres: 0,
          salesLitres: 0,
          totalAmount: 0
        };
      });

      // Rollover Closing Shree Silak -> New Opening Shree Silak
      const nextOpeningCash = closingShreeSilak;
      setOpeningShreeSilak(nextOpeningCash);

      // Preserve locked fuel rates across shifts
      try {
        localStorage.setItem('pump_last_fuel_rates', JSON.stringify(rates));
        const activeUser = localStorage.getItem('mypump_current_user');
        const userId = activeUser ? JSON.parse(activeUser)?.id : null;
        if (userId) {
          localStorage.setItem(`mypump_${userId}_pump_last_fuel_rates`, JSON.stringify(rates));
          localStorage.setItem(`mypump_${userId}_locked_fuel_rates`, JSON.stringify(rates));
        }
      } catch (e) {}

      // Apply In-Place Reset States for Sections A through H (Clean Zero State)
      setNozzles(refreshedNozzles);
      setLubricants([]);
      setJamaEntries([]);
      setOtherIncomeEntries([]);
      setDebitEntries([]);
      setDigitalPayEntries([]);
      setSmartMoneyEntries([]);
      setSmartBalanceEntries([]);
      setExpenseEntries([]);
      setBankEntries([]);
      setDenominations({ n2000: 0, n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, coins: 0 });

      showToast(`Shift data for ${selectedDate} saved & synced to all modules successfully! Entry workspace is refreshed and ready for the next shift.`, 'success');
    } catch (err) {
      console.error('Handled action error without reloading in handleSaveToNextShift:', err);
      showToast('Error saving shift: ' + err.message, 'error');
    }
  };
  const handleSaveShift = handleSaveToNextShift;

  // --- MPD Dispenser Grouped Architecture (Fully Dynamic Multi-MPD & Multi-Nozzle) ---
  const [mpdList, setMpdList] = useState(() => {
    try {
      const saved = localStorage.getItem('mypump_mpd_list');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return ['MPD-1', 'MPD-2', 'MPD-3', 'MPD-4'];
  });

  const getMpdIdForNozzle = (n, index) => {
    if (n?.mpdId && typeof n.mpdId === 'string' && n.mpdId.startsWith('MPD-')) {
      const num = parseInt(n.mpdId.replace('MPD-', ''), 10);
      if (num >= 1) return `MPD-${num}`;
    }
    const match = (n?.nozzleId || '').match(/N(\d+)/i);
    if (match) {
      const nozzleNum = parseInt(match[1], 10);
      const mpdNum = Math.ceil(nozzleNum / 4);
      return `MPD-${Math.max(1, mpdNum)}`;
    }
    const autoNum = typeof index === 'number' ? Math.floor(index / 4) + 1 : 1;
    return `MPD-${Math.max(1, autoNum)}`;
  };

  const activeMpdIds = Array.from(new Set([
    ...mpdList,
    ...(Array.isArray(nozzles) ? nozzles : []).map((n, idx) => getMpdIdForNozzle(n, idx))
  ]))
  .filter(id => {
    const num = parseInt(id.replace('MPD-', ''), 10) || 0;
    return num >= 1;
  })
  .sort((a, b) => {
    const numA = parseInt(a.replace('MPD-', ''), 10) || 0;
    const numB = parseInt(b.replace('MPD-', ''), 10) || 0;
    return numA - numB;
  });

  const getMpdTitle = (mpdId) => {
    const num = parseInt(mpdId.replace('MPD-', ''), 10) || 1;
    return `MPD ${num} (DISPENSER UNIT ${num})`;
  };

  const getMpdTotals = (mpdNozzles) => {
    if (!Array.isArray(mpdNozzles)) {
      return { petrolLitres: 0, petrolAmount: 0, dieselLitres: 0, dieselAmount: 0, speedLitres: 0, speedAmount: 0, cngKg: 0, cngAmount: 0, grandTotal: 0 };
    }
    return mpdNozzles.reduce((acc, n) => {
      const norm = getNormalizedProductName(n?.productName);
      const litres = parseFloat(n?.salesLitres) || 0;
      const amt = parseFloat(n?.totalAmount) || 0;

      if (norm === 'High Speed Diesel') {
        acc.dieselLitres += litres;
        acc.dieselAmount += amt;
      } else if (norm === 'XP Premium Petrol') {
        acc.speedLitres += litres;
        acc.speedAmount += amt;
      } else if (norm === 'CNG') {
        acc.cngKg += litres;
        acc.cngAmount += amt;
      } else {
        acc.petrolLitres += litres;
        acc.petrolAmount += amt;
      }
      acc.grandTotal += amt;
      return acc;
    }, { petrolLitres: 0, petrolAmount: 0, dieselLitres: 0, dieselAmount: 0, speedLitres: 0, speedAmount: 0, cngKg: 0, cngAmount: 0, grandTotal: 0 });
  };

  const handleAddMpd = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      let nextNum = 1;
      while (activeMpdIds.includes(`MPD-${nextNum}`)) {
        nextNum++;
      }

      const newMpdId = `MPD-${nextNum}`;
      const startIdx = (nextNum - 1) * 4 + 1;
      const msRate = rates?.['Motor Spirit (Petrol)'] ?? 0;
      const hsdRate = rates?.['High Speed Diesel'] ?? 0;

      const nextMpdList = Array.from(new Set([...mpdList, newMpdId])).sort((a, b) => {
        return (parseInt(a.replace('MPD-', ''), 10) || 0) - (parseInt(b.replace('MPD-', ''), 10) || 0);
      });
      setMpdList(nextMpdList);
      try {
        localStorage.setItem('mypump_mpd_list', JSON.stringify(nextMpdList));
      } catch (err) {}

      const newNozzles = [
        { _localId: Date.now() + Math.random(), date: selectedDate, mpdId: newMpdId, nozzleId: `N${startIdx} (MS)`, productName: 'Motor Spirit (Petrol)', openingReading: 0, closingReading: 0, testingLitres: 0, salesLitres: 0, rate: msRate, totalAmount: 0, shiftId: activeShift },
        { _localId: Date.now() + Math.random(), date: selectedDate, mpdId: newMpdId, nozzleId: `N${startIdx + 1} (MS)`, productName: 'Motor Spirit (Petrol)', openingReading: 0, closingReading: 0, testingLitres: 0, salesLitres: 0, rate: msRate, totalAmount: 0, shiftId: activeShift },
        { _localId: Date.now() + Math.random(), date: selectedDate, mpdId: newMpdId, nozzleId: `N${startIdx + 2} (HSD)`, productName: 'High Speed Diesel', openingReading: 0, closingReading: 0, testingLitres: 0, salesLitres: 0, rate: hsdRate, totalAmount: 0, shiftId: activeShift },
        { _localId: Date.now() + Math.random(), date: selectedDate, mpdId: newMpdId, nozzleId: `N${startIdx + 3} (HSD)`, productName: 'High Speed Diesel', openingReading: 0, closingReading: 0, testingLitres: 0, salesLitres: 0, rate: hsdRate, totalAmount: 0, shiftId: activeShift }
      ];

      setNozzles(prev => {
        const next = [...(Array.isArray(prev) ? prev : []), ...newNozzles];
        try { localStorage.setItem('pump_nozzle_master_config', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      showToast(`Added ${newMpdId} (Dispenser Unit ${nextNum}) with 4 standard nozzles!`, 'success');
    } catch (err) {
      console.error('Handled action error in handleAddMpd:', err);
      showToast('Error adding MPD: ' + (err?.message || 'Unknown error'), 'error');
    }
  };

  const handleDeleteMpd = (targetMpdId, e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      const confirmed = typeof window !== 'undefined' && window.confirm
        ? window.confirm(`Are you sure you want to remove ${targetMpdId} and all its nozzles?`)
        : true;
      if (confirmed) {
        setNozzles(prev => {
          const next = (Array.isArray(prev) ? prev.filter((n, idx) => getMpdIdForNozzle(n, idx) !== targetMpdId) : []);
          try { localStorage.setItem('pump_nozzle_master_config', JSON.stringify(next)); } catch (e) {}
          return next;
        });
        const filteredMpds = mpdList.filter(id => id !== targetMpdId);
        setMpdList(filteredMpds);
        try {
          localStorage.setItem('mypump_mpd_list', JSON.stringify(filteredMpds));
        } catch (err) {}
        showToast(`Removed ${targetMpdId} from station configuration.`, 'info');
      }
    } catch (err) {
      console.error('Handled action error in handleDeleteMpd:', err);
      showToast('Error removing MPD: ' + (err?.message || 'Unknown error'), 'error');
    }
  };

  const handleAddNozzleToMpd = (targetMpdId, e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      const currentNozzles = Array.isArray(nozzles) ? nozzles : [];
      const mpdNozzles = currentNozzles.filter((n, idx) => getMpdIdForNozzle(n, idx) === targetMpdId);
      const numInMpd = mpdNozzles.length + 1;
      const mpdNum = parseInt(targetMpdId.replace('MPD-', ''), 10) || 1;

      // Find highest nozzle number currently used
      let maxN = 0;
      currentNozzles.forEach(nz => {
        const m = (nz?.nozzleId || '').match(/N(\d+)/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxN) maxN = num;
        }
      });
      const nextNozzleNum = maxN > 0 ? maxN + 1 : (mpdNum - 1) * 4 + numInMpd;
      const isDiesel = nextNozzleNum % 2 === 0;
      const defaultProduct = isDiesel ? 'High Speed Diesel' : 'Motor Spirit (Petrol)';
      const defaultRate = rates?.[defaultProduct] ?? 0;

      const newNozzle = {
        _localId: Date.now() + Math.random(),
        date: selectedDate,
        mpdId: targetMpdId,
        nozzleId: `N${nextNozzleNum} (${isDiesel ? 'HSD' : 'MS'})`,
        productName: defaultProduct,
        openingReading: 0,
        closingReading: 0,
        testingLitres: 0,
        salesLitres: 0,
        rate: defaultRate,
        totalAmount: 0,
        shiftId: activeShift
      };

      setNozzles(prev => {
        const next = [...(Array.isArray(prev) ? prev : []), newNozzle];
        try { localStorage.setItem('pump_nozzle_master_config', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      showToast(`Added new nozzle (${newNozzle.nozzleId}) to ${targetMpdId}`, 'success');
    } catch (err) {
      console.error('Handled action error in handleAddNozzleToMpd:', err);
      showToast('Error adding nozzle: ' + (err?.message || 'Unknown error'), 'error');
    }
  };

  // Section Row Actions shielded with try/catch & preventDefault
  const handleDeleteNozzle = (targetNozzle, realIdx, e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      if (targetNozzle?.id && typeof targetNozzle.id === 'number') {
        db.nozzleReadings.delete(targetNozzle.id).catch(err => console.warn('DB delete nozzle skipped:', err));
      }
      setNozzles(prev => {
        if (!Array.isArray(prev)) return [];
        let next = prev;
        if (targetNozzle) {
          const filtered = prev.filter(item => item !== targetNozzle);
          if (filtered.length !== prev.length) next = filtered;
        } else if (typeof realIdx === 'number' && realIdx >= 0) {
          next = prev.filter((_, i) => i !== realIdx);
        }
        try { localStorage.setItem('pump_nozzle_master_config', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      showToast('Nozzle deleted successfully', 'info');
    } catch (err) {
      console.error('Handled action error in handleDeleteNozzle:', err);
      showToast('Error deleting nozzle: ' + (err?.message || 'Unknown error'), 'error');
    }
  };

  const handleAddLubricantRow = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setLubricants(prev => [
        ...(Array.isArray(prev) ? prev : []),
        createDefaultLubricantRow(Array.isArray(prev) ? prev.length : 0)
      ]);
    } catch (err) {
      console.error('Handled action error without reloading in handleAddLubricantRow:', err);
    }
  };

  const handleDeleteLubricantRow = (idx, e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setLubricants(prev => (Array.isArray(prev) ? prev.filter((_, i) => i !== idx) : []));
    } catch (err) {
      console.error('Handled action error without reloading in handleDeleteLubricantRow:', err);
    }
  };

  const handleAddJamaRow = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      const pList = Array.isArray(activePartiesList) ? activePartiesList : [];
      setJamaEntries(prev => [
        ...(Array.isArray(prev) ? prev : []),
        {
          id: Date.now() + Math.random(),
          syncId: `jama-${Date.now()}-${Math.random()}`,
          customerId: pList[0]?.id || 1,
          customerName: pList[0]?.name || 'BK Patel Kheralu',
          paymentMode: 'Cash',
          amount: 0,
          notes: 'Credit recovery'
        }
      ]);
    } catch (err) {
      console.error('Handled action error without reloading in handleAddJamaRow:', err);
    }
  };

  const handleDeleteJamaRow = (idx, e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setJamaEntries(prev => (Array.isArray(prev) ? prev.filter((_, i) => i !== idx) : []));
    } catch (err) {
      console.error('Handled action error without reloading in handleDeleteJamaRow:', err);
    }
  };

  const handleAddOtherIncomeRow = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      const uList = (Array.isArray(ushinaDirectoryList) && ushinaDirectoryList.length > 0)
        ? ushinaDirectoryList
        : (Array.isArray(ushinaDirectory) && ushinaDirectory.length > 0 ? ushinaDirectory : []);
      const defaultParty = uList[0] || { id: 'ush-1', name: 'om' };
      setOtherIncomeEntries(prev => [
        ...(Array.isArray(prev) ? prev : []),
        {
          id: Date.now() + Math.random(),
          accountId: defaultParty.id,
          partyName: defaultParty.name,
          category: defaultParty.name,
          description: '',
          amount: 0
        }
      ]);
    } catch (err) {
      console.error('Handled action error without reloading in handleAddOtherIncomeRow:', err);
    }
  };

  const handleDeleteOtherIncomeRow = (idx, e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setOtherIncomeEntries(prev => (Array.isArray(prev) ? prev.filter((_, i) => i !== idx) : []));
    } catch (err) {
      console.error('Handled action error without reloading in handleDeleteOtherIncomeRow:', err);
    }
  };

  const handleAddDebitRow = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      const pList = Array.isArray(activePartiesList) ? activePartiesList : [];
      setDebitEntries(prev => [
        ...(Array.isArray(prev) ? prev : []),
        {
          id: Date.now() + Math.random(),
          syncId: `debit-${Date.now()}-${Math.random()}`,
          customerId: pList[0]?.id || '',
          customerName: pList[0]?.name || '',
          vehicleNo: '',
          billNo: '',
          billType: 'Debit Bill',
          fuelProduct: 'MS Petrol',
          fuelType: 'MS Petrol',
          litres: 0,
          slipNo: '',
          rate: rates['Motor Spirit (Petrol)'] ?? 0,
          amount: 0
        }
      ]);
    } catch (err) {
      console.error('Handled action error without reloading in handleAddDebitRow:', err);
    }
  };

  const handleDeleteDebitRow = (idx, e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setDebitEntries(prev => (Array.isArray(prev) ? prev.filter((_, i) => i !== idx) : []));
    } catch (err) {
      console.error('Handled action error without reloading in handleDeleteDebitRow:', err);
    }
  };

  const handleAddDigitalPayRow = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setDigitalPayEntries(prev => [
        ...(Array.isArray(prev) ? prev : []),
        { id: Date.now() + Math.random(), method: 'UPI', amount: 0 }
      ]);
    } catch (err) {
      console.error('Handled action error without reloading in handleAddDigitalPayRow:', err);
    }
  };

  const handleDeleteDigitalPayRow = (idx, e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setDigitalPayEntries(prev => (Array.isArray(prev) ? prev.filter((_, i) => i !== idx) : []));
    } catch (err) {
      console.error('Handled action error without reloading in handleDeleteDigitalPayRow:', err);
    }
  };

  const handleAddSmartMoneyRow = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setSmartMoneyEntries(prev => [
        ...(Array.isArray(prev) ? prev : []),
        { id: Date.now() + Math.random(), program: 'PETRO CARD / FLEET CARD', amount: 0 }
      ]);
    } catch (err) {
      console.error('Handled action error without reloading in handleAddSmartMoneyRow:', err);
    }
  };

  const handleDeleteSmartMoneyRow = (idx, e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setSmartMoneyEntries(prev => (Array.isArray(prev) ? prev.filter((_, i) => i !== idx) : []));
    } catch (err) {
      console.error('Handled action error without reloading in handleDeleteSmartMoneyRow:', err);
    }
  };

  const handleAddExpenseRow = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      const expCats = Array.isArray(pumpExpenseCategories) ? pumpExpenseCategories : [];
      setExpenseEntries(prev => [
        ...(Array.isArray(prev) ? prev : []),
        {
          id: Date.now() + Math.random(),
          category: 'Daily Pump Expenses',
          description: expCats[0]?.name || 'Cha / Refreshments',
          amount: 0
        }
      ]);
    } catch (err) {
      console.error('Handled action error without reloading in handleAddExpenseRow:', err);
    }
  };

  const handleDeleteExpenseRow = (idx, e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setExpenseEntries(prev => (Array.isArray(prev) ? prev.filter((_, i) => i !== idx) : []));
    } catch (err) {
      console.error('Handled action error without reloading in handleDeleteExpenseRow:', err);
    }
  };

  const handleAddBankRow = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      const bList = Array.isArray(activeBankList) && activeBankList.length > 0 ? activeBankList : [];
      setBankEntries(prev => [
        ...(Array.isArray(prev) ? prev : []),
        {
          id: Date.now() + Math.random(),
          bankAccountId: bList[0]?.id || '',
          bankName: bList[0]?.name || '',
          accountNumber: bList[0]?.accountNumber || '',
          slipNo: '',
          amount: 0,
          depositedBy: 'Shift Manager'
        }
      ]);
    } catch (err) {
      console.error('Handled action error without reloading in handleAddBankRow:', err);
    }
  };

  const handleDeleteBankRow = (idx, e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      setBankEntries(prev => (Array.isArray(prev) ? prev.filter((_, i) => i !== idx) : []));
    } catch (err) {
      console.error('Handled action error without reloading in handleDeleteBankRow:', err);
    }
  };

  // --- PDF Generation Engine (A4 DSR Statement) ---
  const generateDsrPdf = () => {
    try {
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const stationName = stationProfile?.fuelStationName || 'SHITAL PETROL PUMP';
      const cleanName = stationName.replace(/[^\w-]/g, '_');
      const cleanDate = (selectedDate || '').replace(/\//g, '-');
      const cleanShift = (activeShift || 'Shift').replace(/[^\w-]/g, '_');
      const filename = `DSR_${cleanName}_${cleanDate}_${cleanShift}.pdf`;

      // Header Banner
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 24, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`${stationName.toUpperCase()} - DAILY SALES REGISTER (DSR)`, 14, 10);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(203, 213, 225);
      doc.text(`Shift Date: ${selectedDate}   |   Shift: ${activeShift}   |   GSTIN: ${stationProfile?.gstin || '24AAAAA0000A1Z5'}`, 14, 16);
      doc.text(`Address: ${stationProfile?.address || 'State Highway, Kheralu'}`, 14, 21);

      let startY = 29;

      // Section 1: Underground Tank Dips & Station Fuel Rates
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('1. UNDERGROUND TANK DIPS & STATION FUEL RATES', 14, startY);
      startY += 3;

      const tankRows = [
        ['MS Petrol Tank', `${dips.msDipCm || 0} cm`, `${msEffectiveLitres.toLocaleString()} L`, `₹${rates['Motor Spirit (Petrol)'] ?? 0}`],
        ['HSD Diesel Tank', `${dips.hsdDipCm || 0} cm`, `${hsdEffectiveLitres.toLocaleString()} L`, `₹${rates['High Speed Diesel'] ?? 0}`],
        ['Speed Petrol Tank', `${dips.speedDipCm || 0} cm`, `${speedEffectiveLitres.toLocaleString()} L`, `₹${rates['Speed Petrol'] ?? rates['XP Premium Petrol'] ?? 0}`],
        ['CNG Rate Matrix', 'N/A', 'N/A', `₹${rates['CNG'] ?? 0}`]
      ];

      autoTable(doc, {
        startY: startY,
        head: [['Fuel Tank / Product', 'Dip Reading', 'Calculated Volume', 'Active Rate (₹/Unit)']],
        body: tankRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7 },
        margin: { left: 14, right: 14 }
      });

      startY = doc.lastAutoTable.finalY + 5;

      // Section 2: Nozzle Readings & Fuel Sales (MPDs)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`2. SECTION A: NOZZLE READINGS (${activeMpdIds.length} MPDs | ${nozzles.length} Nozzles)`, 14, startY);
      startY += 3;

      const nozzleRows = nozzles.map(n => {
        const mpdId = getMpdIdForNozzle(n, nozzles.indexOf(n));
        return [
          mpdId,
          n.nozzleId || '-',
          getNormalizedProductName(n.productName),
          (n.openingReading || 0).toLocaleString(),
          (n.closingReading || 0).toLocaleString(),
          (n.testingLitres || 0).toString(),
          (n.salesLitres || 0).toFixed(2),
          `₹${(n.rate || 0).toFixed(2)}`,
          `₹${(n.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        ];
      });

      nozzleRows.push([
        { content: `MS Petrol: ${nozzleTotals.petrolLitres.toFixed(2)}L (₹${nozzleTotals.petrolAmount.toLocaleString()})  |  HSD Diesel: ${nozzleTotals.dieselLitres.toFixed(2)}L (₹${nozzleTotals.dieselAmount.toLocaleString()})  |  Speed: ${nozzleTotals.speedLitres.toFixed(2)}L (₹${nozzleTotals.speedAmount.toLocaleString()})  |  CNG: ${totalCngKgCombined.toFixed(2)}Kg (₹${totalCngAmtCombined.toLocaleString()})`, colSpan: 9, styles: { fillColor: [240, 253, 244], textColor: [4, 120, 87], fontStyle: 'bold', halign: 'center', fontSize: 7 } }
      ]);

      autoTable(doc, {
        startY: startY,
        head: [['MPD', 'Nozzle ID', 'Fuel Product', 'Opening', 'Closing', 'Testing', 'Net Sale (L)', 'Rate (₹)', 'Total Amount (₹)']],
        body: nozzleRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, fontStyle: 'bold' },
        bodyStyles: { fontSize: 6.5 },
        margin: { left: 14, right: 14 }
      });

      startY = doc.lastAutoTable.finalY + 5;

      if (startY > 230) {
        doc.addPage();
        startY = 15;
      }

      // Section 3: Lubricants & Inventory
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('3. SECTION B: LUBRICANTS & OIL INVENTORY SALES', 14, startY);
      startY += 3;

      const lubeRows = lubricants.filter(l => (parseFloat(l.soldQty ?? l.soldCount ?? 0)) > 0).map(l => [
        l.productName,
        `${parseFloat(l.litreVolume ?? l.volume) || 0} L`,
        (l.soldQty ?? l.soldCount ?? 0).toString(),
        `₹${(l.unitPrice || l.rate || 0).toFixed(2)}`,
        `₹${calculateLubricantRowTotal(l).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      ]);

      if (lubeRows.length === 0) {
        lubeRows.push([{ content: 'No lubricant items sold in this shift', colSpan: 5, styles: { halign: 'center', textColor: 120 } }]);
      }

      autoTable(doc, {
        startY: startY,
        head: [['Product Name', 'Volume/Pack', 'Sold Qty', 'Unit Price (₹)', 'Total Sale (₹)']],
        body: lubeRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, fontStyle: 'bold' },
        bodyStyles: { fontSize: 6.5 },
        margin: { left: 14, right: 14 }
      });

      startY = doc.lastAutoTable.finalY + 5;

      if (startY > 220) {
        doc.addPage();
        startY = 15;
      }

      // Section 4: Side-by-Side Financial Flow
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('4. TRANSACTION ACCOUNTS & RECONCILIATION SUMMARY', 14, startY);
      startY += 3;

      const summaryRows = [
        ['1. Opening Shree Silak (Previous Cash)', `+₹${(parseFloat(openingShreeSilak) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, '1. Debiters / Credit Slips (Sec E)', `-₹${totalCustomerDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
        ['2. Fuel Sales Revenue (Sec A)', `+₹${totalFuelSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, '2. Digital Payments / Smart Money (Sec F)', `-₹${totalSmartBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
        ['3. Lubricants / Oil Sales (Sec B)', `+₹${totalOilCngAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, '3. Expenses & Kharch Tracker (Sec G)', `-₹${totalExpensesKharch.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
        ['4. Crediters / Jama Recovery (Sec C)', `+₹${totalJamaRecovered.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, '4. Bank Accounts Deposit (Sec H)', `-₹${totalBankDeposits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
        ['5. Other Station Income (Sec D)', `+₹${totalOtherIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'TOTAL DEDUCTIONS (OUTFLOW)', `-₹${totalOutflowDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
        [
          { content: `TOTAL GROSS INFLOW: ₹${totalInflowGrossCashIn.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, colSpan: 2, styles: { fillColor: [240, 253, 244], textColor: [4, 120, 87], fontStyle: 'bold' } },
          { content: `TOTAL DEDUCTIONS: -₹${totalOutflowDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, colSpan: 2, styles: { fillColor: [255, 241, 242], textColor: [225, 29, 72], fontStyle: 'bold' } }
        ]
      ];

      autoTable(doc, {
        startY: startY,
        head: [['🟢 CASH INFLOW (AAVAJ)', 'AMOUNT (₹)', '🔴 DEDUCTIONS (UDHAR/NIKAS)', 'AMOUNT (₹)']],
        body: summaryRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, fontStyle: 'bold' },
        bodyStyles: { fontSize: 6.5 },
        margin: { left: 14, right: 14 }
      });

      startY = doc.lastAutoTable.finalY + 5;

      if (startY > 245) {
        doc.addPage();
        startY = 15;
      }

      // Section 5: Master Shree Silak Hero Box
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(14, startY, pageWidth - 28, 15, 2, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text('FINAL CLOSING SHREE SILAK (ACTUAL DRAWER CASH IN-HAND)', 18, startY + 6.5);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(`Math: (Gross Inflow ₹${totalInflowGrossCashIn.toLocaleString()}) - (Total Deductions ₹${totalOutflowDeductions.toLocaleString()})`, 18, startY + 11.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(52, 211, 153);
      doc.text(`₹${closingShreeSilak.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, pageWidth - 18, startY + 9.5, { align: 'right' });

      startY += 21;

      if (startY > 265) {
        doc.addPage();
        startY = 18;
      }

      // Footer & Signatures
      doc.setDrawColor(203, 213, 225);
      doc.line(14, startY, pageWidth - 14, startY);

      startY += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);

      doc.text('Shift Manager Signature: _______________________', 14, startY);
      doc.text('Cashier Signature: _______________________', pageWidth - 14, startY, { align: 'right' });

      startY += 7;
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('Developed By OM Raval And Instructed By Shaileshkumar Raval   |   MY PUMP System', 14, startY);

      doc.save(filename);
    } catch (pdfErr) {
      console.error('PDF Generation Error:', pdfErr);
      showToast('Shift saved, but PDF export failed: ' + pdfErr.message, 'warning');
    }
  };

  // --- Client-Side High-Density Shift Summary PDF Generator (Triggered After Save To Next Shift) ---
  const generateShiftSummaryPdf = (data) => {
    if (!data) return;
    try {
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const stationName = data.stationName || stationProfile?.fuelStationName || 'SHITAL PETROL PUMP';
      const cleanDate = (data.date || '').replace(/\//g, '-');
      const cleanShift = (data.shiftType || 'Shift').replace(/[^\w-]/g, '_');
      const filename = `Shift_Report_${cleanDate}_${cleanShift}.pdf`;

      // 1. HEADER SECTION (Clean Indigo / Slate Styling)
      doc.setFillColor(30, 41, 59); // slate-800
      doc.rect(0, 0, pageWidth, 25, 'F');

      // Accent strip
      doc.setFillColor(79, 70, 229); // indigo-600
      doc.rect(0, 23.5, pageWidth, 1.5, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(stationName.toUpperCase(), 14, 9.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(226, 232, 240); // slate-200
      doc.text('DAILY SHIFT CLOSING SUMMARY & SETTLEMENT REPORT', 14, 15);

      doc.setFontSize(7);
      doc.setTextColor(203, 213, 225); // slate-300
      doc.text(`Shift Date: ${data.date}   |   Shift: ${data.shiftType}   |   Generated: ${data.timestamp || new Date().toLocaleTimeString('en-IN')}`, 14, 20);
      doc.text(`GSTIN: ${data.gstin || '24AAAAA0000A1Z5'}   |   ${data.address || 'State Highway, Kheralu'}`, pageWidth - 14, 20, { align: 'right' });

      let currentY = 30;

      const checkPageBreak = (neededHeight) => {
        if (currentY + neededHeight > pageHeight - 18) {
          doc.addPage();
          currentY = 15;
          return true;
        }
        return false;
      };

      // 2. TABLE 1: FUEL NOZZLE DISPENSED SUMMARY (SECTION A)
      checkPageBreak(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text('1. FUEL NOZZLE DISPENSED SUMMARY (SECTION A)', 14, currentY);
      currentY += 3;

      const nozzleRows = (data.nozzles || []).map((n, idx) => {
        const mpdLabel = n.mpdId || `MPD-${Math.floor(idx / 4) + 1}`;
        const nozzleLabel = n.nozzleId || `N${idx + 1}`;
        return [
          `${mpdLabel} / ${nozzleLabel}`,
          n.productName || 'Fuel',
          (parseFloat(n.openingReading) || 0).toLocaleString(),
          (parseFloat(n.closingReading) || 0).toLocaleString(),
          (parseFloat(n.testingLitres) || 0).toString(),
          (parseFloat(n.salesLitres) || 0).toFixed(2),
          `₹${(parseFloat(n.rate) || 0).toFixed(2)}`,
          `₹${(parseFloat(n.totalAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ];
      });

      const pLitres = data.nozzleTotals?.petrolLitres || 0;
      const pAmt = data.nozzleTotals?.petrolAmount || 0;
      const dLitres = data.nozzleTotals?.dieselLitres || 0;
      const dAmt = data.nozzleTotals?.dieselAmount || 0;
      const sLitres = data.nozzleTotals?.speedLitres || 0;
      const sAmt = data.nozzleTotals?.speedAmount || 0;
      const cngKg = data.totalCngKgCombined || data.nozzleTotals?.cngKg || 0;
      const cngAmt = data.totalCngAmtCombined || data.nozzleTotals?.cngAmount || 0;
      const fuelTotalAmt = data.totalFuelSalesAmount || (pAmt + dAmt + sAmt + cngAmt);

      nozzleRows.push([
        {
          content: `MS: ${pLitres.toFixed(2)}L (₹${pAmt.toLocaleString('en-IN')}) | HSD: ${dLitres.toFixed(2)}L (₹${dAmt.toLocaleString('en-IN')}) | Speed: ${sLitres.toFixed(2)}L (₹${sAmt.toLocaleString('en-IN')}) | CNG: ${cngKg.toFixed(2)}Kg (₹${cngAmt.toLocaleString('en-IN')})`,
          colSpan: 6,
          styles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 6.5 }
        },
        {
          content: 'TOTAL:',
          styles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'right', fontSize: 7 }
        },
        {
          content: `₹${fuelTotalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          styles: { fillColor: [224, 231, 255], textColor: [67, 56, 202], fontStyle: 'bold', halign: 'right', fontSize: 7 }
        }
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['MPD / Nozzle', 'Product', 'Opening', 'Closing', 'Testing (L)', 'Net Sales (L)', 'Rate (₹)', 'Total Amount (₹)']],
        body: nozzleRows,
        theme: 'grid',
        headStyles: { fillColor: [49, 46, 129], textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 6.5 },
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 32 },
          2: { halign: 'right', cellWidth: 20 },
          3: { halign: 'right', cellWidth: 20 },
          4: { halign: 'right', cellWidth: 14 },
          5: { halign: 'right', cellWidth: 18 },
          6: { halign: 'right', cellWidth: 18 },
          7: { halign: 'right', cellWidth: 34 }
        },
        margin: { left: 14, right: 14 }
      });

      currentY = doc.lastAutoTable.finalY + 5;

      // 3. TABLE 2: COLLECTIONS & RECOVERIES (SECTIONS B, C, D)
      checkPageBreak(35);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text('2. COLLECTIONS & RECOVERIES (SECTIONS B, C, D)', 14, currentY);
      currentY += 3;

      const collectionsRows = [];

      // Section B: Lubricants
      const soldLubes = (data.lubricants || []).filter(l => (parseFloat(l.soldQty ?? l.soldCount ?? 0)) > 0);
      if (soldLubes.length > 0) {
        soldLubes.forEach(l => {
          collectionsRows.push([
            'Section B: Lubricants',
            `${l.productName} (${parseFloat(l.litreVolume ?? l.volume) || 0}L)`,
            `Qty: ${l.soldQty ?? l.soldCount ?? 0} @ ₹${l.unitPrice || l.rate || 0}`,
            `₹${(parseFloat(l.rowTotal ?? l.totalAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          ]);
        });
      } else {
        collectionsRows.push(['Section B: Lubricants', 'No lubricant items sold', '-', '₹0.00']);
      }

      // Section C: Creditors / Jama Recovery
      const activeJama = (data.jamaEntries || []).filter(j => (parseFloat(j.amount) || 0) > 0);
      if (activeJama.length > 0) {
        activeJama.forEach(j => {
          collectionsRows.push([
            'Section C: Creditor Jama',
            j.customerName || 'Customer Recovery',
            `Mode: ${j.paymentMode || 'Cash'} ${j.notes ? `(${j.notes})` : ''}`,
            `₹${(parseFloat(j.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          ]);
        });
      } else {
        collectionsRows.push(['Section C: Creditor Jama', 'No creditor recovery entries', '-', '₹0.00']);
      }

      // Section D: Other Income
      const activeOther = (data.otherIncomeEntries || []).filter(i => (parseFloat(i.amount) || 0) > 0);
      if (activeOther.length > 0) {
        activeOther.forEach(i => {
          collectionsRows.push([
            'Section D: Other Income',
            i.category || 'Other Source',
            i.description || 'Station Income',
            `₹${(parseFloat(i.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          ]);
        });
      } else {
        collectionsRows.push(['Section D: Other Income', 'No other income entries', '-', '₹0.00']);
      }

      const totalCollections = (parseFloat(data.totalOilCngAmount) || 0) + (parseFloat(data.totalJamaRecovered) || 0) + (parseFloat(data.totalOtherIncome) || 0);
      collectionsRows.push([
        {
          content: `Subtotals -> Lubes: ₹${(data.totalOilCngAmount || 0).toLocaleString('en-IN')} | Jama Recovery: ₹${(data.totalJamaRecovered || 0).toLocaleString('en-IN')} | Other Income: ₹${(data.totalOtherIncome || 0).toLocaleString('en-IN')}`,
          colSpan: 2,
          styles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 6.5 }
        },
        {
          content: 'TOTAL COLLECTIONS:',
          styles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'right', fontSize: 7 }
        },
        {
          content: `₹${totalCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          styles: { fillColor: [209, 250, 229], textColor: [4, 120, 87], fontStyle: 'bold', halign: 'right', fontSize: 7 }
        }
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Category / Section', 'Source / Party Name', 'Details / Mode / Remarks', 'Amount (₹)']],
        body: collectionsRows,
        theme: 'grid',
        headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 6.5 },
        columnStyles: {
          0: { cellWidth: 38 },
          1: { cellWidth: 56 },
          2: { cellWidth: 54 },
          3: { halign: 'right', cellWidth: 34 }
        },
        margin: { left: 14, right: 14 }
      });

      currentY = doc.lastAutoTable.finalY + 5;

      // 4. TABLE 3: DEDUCTIONS & SETTLEMENTS (SECTIONS E, F, G, H)
      checkPageBreak(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text('3. DEDUCTIONS & SETTLEMENTS (SECTIONS E, F, G, H)', 14, currentY);
      currentY += 3;

      const deductionsRows = [];

      // Section E: Customer Debits
      const activeDebits = (data.debitEntries || []).filter(d => (parseFloat(d.amount) || 0) > 0);
      const debitMs = data.sectionETotals?.msDebitLitres || 0;
      const debitHsd = data.sectionETotals?.hsdDebitLitres || 0;
      const debitSpeed = data.sectionETotals?.speedDebitLitres || 0;
      const debitCng = data.sectionETotals?.cngDebitLitres || 0;

      if (activeDebits.length > 0) {
        deductionsRows.push([
          'Section E: Customer Debits',
          `Total ${activeDebits.length} credit slips (MS: ${debitMs.toFixed(1)}L, HSD: ${debitHsd.toFixed(1)}L, Speed: ${debitSpeed.toFixed(1)}L, CNG: ${debitCng.toFixed(1)}Kg)`,
          `Customers: ${activeDebits.slice(0, 3).map(d => d.customerName).join(', ')}${activeDebits.length > 3 ? ` +${activeDebits.length - 3} more` : ''}`,
          `-₹${(parseFloat(data.totalCustomerDebits) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        ]);
      } else {
        deductionsRows.push(['Section E: Customer Debits', 'No credit slips issued', '-', '₹0.00']);
      }

      // Section F: Digital Settlements
      const upiAmt = (data.digitalPayEntries || []).filter(d => d.method === 'UPI').reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
      const cardAmt = (data.digitalPayEntries || []).filter(d => d.method === 'CARD').reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
      const smartAmt = (data.smartMoneyEntries || []).reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
      const totalDigital = upiAmt + cardAmt + smartAmt;

      deductionsRows.push([
        'Section F: Digital Settlements',
        `UPI/QR: ₹${upiAmt.toLocaleString('en-IN')} | Card/POS: ₹${cardAmt.toLocaleString('en-IN')}`,
        `Smart Fleet Cards: ₹${smartAmt.toLocaleString('en-IN')}`,
        `-₹${totalDigital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      ]);

      // Section G: Daily Expenses
      const activeExpenses = (data.expenseEntries || []).filter(e => (parseFloat(e.amount) || 0) > 0);
      if (activeExpenses.length > 0) {
        activeExpenses.forEach(e => {
          deductionsRows.push([
            `Section G: ${e.category || 'Expense'}`,
            e.description || 'Daily Expense',
            'Cash / Shift Outflow',
            `-₹${(parseFloat(e.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          ]);
        });
      } else {
        deductionsRows.push(['Section G: Daily Expenses', 'No expense kharch entries', '-', '₹0.00']);
      }

      // Section H: Bank Deposits
      const activeBanks = (data.bankEntries || []).filter(b => (parseFloat(b.amount) || 0) > 0);
      if (activeBanks.length > 0) {
        activeBanks.forEach(b => {
          deductionsRows.push([
            'Section H: Bank Deposit',
            b.bankName || 'Bank',
            `Slip: ${b.slipNo || 'DEP'} | A/C: ${b.accountNumber || '-'}`,
            `-₹${(parseFloat(b.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          ]);
        });
      } else {
        deductionsRows.push(['Section H: Bank Deposits', 'No bank deposit slips', '-', '₹0.00']);
      }

      deductionsRows.push([
        {
          content: `Debits: ₹${(data.totalCustomerDebits || 0).toLocaleString('en-IN')} | Digital: ₹${totalDigital.toLocaleString('en-IN')} | Kharch: ₹${(data.totalExpensesKharch || 0).toLocaleString('en-IN')} | Bank: ₹${(data.totalBankDeposits || 0).toLocaleString('en-IN')}`,
          colSpan: 2,
          styles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', fontSize: 6.5 }
        },
        {
          content: 'TOTAL DEDUCTIONS:',
          styles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'right', fontSize: 7 }
        },
        {
          content: `-₹${(parseFloat(data.totalOutflowDeductions) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          styles: { fillColor: [255, 228, 230], textColor: [190, 18, 60], fontStyle: 'bold', halign: 'right', fontSize: 7 }
        }
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['Section / Deduction Type', 'Particulars / Parties', 'Payment Mode / Details', 'Amount (₹)']],
        body: deductionsRows,
        theme: 'grid',
        headStyles: { fillColor: [159, 18, 57], textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 6.5 },
        columnStyles: {
          0: { cellWidth: 42 },
          1: { cellWidth: 54 },
          2: { cellWidth: 52 },
          3: { halign: 'right', cellWidth: 34 }
        },
        margin: { left: 14, right: 14 }
      });

      currentY = doc.lastAutoTable.finalY + 5;

      // 5. FOOTER BALANCE SHEET (FINAL SHREE SILAK SUMMARY)
      checkPageBreak(45);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text('4. FINAL SHREE SILAK (DRAWER CASH BALANCE SHEET)', 14, currentY);
      currentY += 3;

      const balanceSheetRows = [
        ['1. Opening Shree Silak (Previous Drawer Cash)', `+₹${(parseFloat(data.openingShreeSilak) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, '1. Customer Debits (Sec E)', `-₹${(parseFloat(data.totalCustomerDebits) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
        ['2. Fuel Sales Revenue (Sec A)', `+₹${(parseFloat(data.totalFuelSalesAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, '2. Digital & Smart Money (Sec F)', `-₹${totalDigital.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
        ['3. Lubricants / Oil Sales (Sec B)', `+₹${(parseFloat(data.totalOilCngAmount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, '3. Expenses Kharch (Sec G)', `-₹${(parseFloat(data.totalExpensesKharch) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
        ['4. Creditor Jama Recovery (Sec C)', `+₹${(parseFloat(data.totalJamaRecovered) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, '4. Bank Deposits (Sec H)', `-₹${(parseFloat(data.totalBankDeposits) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
        ['5. Other Station Income (Sec D)', `+₹${(parseFloat(data.totalOtherIncome) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'TOTAL OPERATIONAL DEDUCTIONS', `-₹${(parseFloat(data.totalOutflowDeductions) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
        [
          {
            content: `TOTAL GROSS INFLOW: ₹${(parseFloat(data.totalInflowGrossCashIn) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
            colSpan: 2,
            styles: { fillColor: [236, 253, 245], textColor: [4, 120, 87], fontStyle: 'bold', fontSize: 6.5 }
          },
          {
            content: `TOTAL DEDUCTIONS: -₹${(parseFloat(data.totalOutflowDeductions) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
            colSpan: 2,
            styles: { fillColor: [255, 241, 242], textColor: [225, 29, 72], fontStyle: 'bold', fontSize: 6.5 }
          }
        ]
      ];

      autoTable(doc, {
        startY: currentY,
        head: [['🟢 CASH INFLOW (AAVAJ)', 'AMOUNT (₹)', '🔴 DEDUCTIONS (UDHAR / NIKAS)', 'AMOUNT (₹)']],
        body: balanceSheetRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 6.5 },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 36, halign: 'right' },
          2: { cellWidth: 55 },
          3: { cellWidth: 36, halign: 'right' }
        },
        margin: { left: 14, right: 14 }
      });

      currentY = doc.lastAutoTable.finalY + 4;

      // Closing Shree Silak Hero Box
      checkPageBreak(25);
      doc.setFillColor(30, 41, 59); // slate-800
      doc.roundedRect(14, currentY, pageWidth - 28, 13, 2, 2, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('FINAL CLOSING SHREE SILAK (ACTUAL DRAWER CASH IN-HAND)', 18, currentY + 5);

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(203, 213, 225);
      doc.text(`Math: (Gross Inflow ₹${(data.totalInflowGrossCashIn || 0).toLocaleString()}) - (Total Deductions ₹${(data.totalOutflowDeductions || 0).toLocaleString()})`, 18, currentY + 9.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(52, 211, 153); // emerald-400
      doc.text(`₹${(parseFloat(data.closingShreeSilak) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, pageWidth - 18, currentY + 7.5, { align: 'right' });

      currentY += 17;

      // Signatures & Footer
      checkPageBreak(15);
      doc.setDrawColor(203, 213, 225);
      doc.line(14, currentY, pageWidth - 14, currentY);

      currentY += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text('Shift Manager Signature: _______________________', 14, currentY);
      doc.text('Cashier Signature: _______________________', pageWidth - 14, currentY, { align: 'right' });

      currentY += 5;
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text('MY PUMP ERP - Automated Shift Closing Register   |   Instructed by Shaileshkumar Raval & OM Raval', 14, currentY);

      doc.save(filename);
      showToast(`Downloaded: ${filename}`, 'success');
    } catch (err) {
      console.error('Shift Summary PDF Generation Error:', err);
      showToast('Error generating PDF: ' + err.message, 'error');
    }
  };

  // --- UNIFIED AUTOMATIC CROSS-MODULE SYNCHRONIZATION ENGINE ---
  const handleSaveMasterShift = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      const shiftSnapshot = {
        date: selectedDate,
        shiftType: activeShift,
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
        openingShreeSilak,
        closingShreeSilak,
        savedAt: new Date().toISOString()
      };
      await saveShiftSnapshotToArchive(shiftSnapshot);

      const activeTables = [
        db.tankDips,
        db.dailyRates,
        db.nozzleReadings,
        db.tanks,
        db.tankLedger,
        db.lubricants,
        db.debitEntries,
        db.jamaEntries,
        db.otherIncome,
        db.expenses,
        db.bankDeposits,
        db.cashDenominations,
        db.upiLogs,
        db.ledgerEntries,
        db.customers,
        db.masterShifts
      ].filter(Boolean);

      await db.transaction('rw', activeTables, async () => {
        // 1. Underground Tank Dips
        const existingDip = await db.tankDips.where('date').equals(selectedDate).first();
        if (existingDip) {
          await db.tankDips.update(existingDip.id, { ...dips, shiftId: activeShift });
        } else {
          await db.tankDips.add({ date: selectedDate, shiftId: activeShift, ...dips });
        }

        // 2. Today Fuel Rates
        const existingRates = await db.dailyRates.where('date').equals(selectedDate).first();
        if (existingRates) {
          await db.dailyRates.update(existingRates.id, { rates, shiftId: activeShift });
        } else {
          await db.dailyRates.add({ date: selectedDate, shiftId: activeShift, rates });
        }
        try {
          localStorage.setItem('pump_last_fuel_rates', JSON.stringify(rates));
          const activeUser = localStorage.getItem('mypump_current_user');
          const userId = activeUser ? JSON.parse(activeUser)?.id : null;
          if (userId) {
            localStorage.setItem(`mypump_${userId}_pump_last_fuel_rates`, JSON.stringify(rates));
            localStorage.setItem(`mypump_${userId}_locked_fuel_rates`, JSON.stringify(rates));
          }
          await db.settings.put({
            key: 'pump_last_fuel_rates',
            data: rates,
            updatedAt: new Date().toISOString()
          });
        } catch (e) {}

        // 3. SECTION A: NOZZLE READINGS & TANK LEDGER DEDUCTION
        const oldNozzles = await db.nozzleReadings.where('date').equals(selectedDate).toArray();
        for (const on of oldNozzles) await db.nozzleReadings.delete(on.id);

        for (const n of nozzles) {
          await db.nozzleReadings.add({
            date: selectedDate,
            shiftId: activeShift,
            mpdId: n.mpdId || getMpdIdForNozzle(n, nozzles.indexOf(n)),
            nozzleId: n.nozzleId,
            productName: getNormalizedProductName(n.productName),
            openingReading: parseFloat(n.openingReading) || 0,
            closingReading: parseFloat(n.closingReading) || 0,
            testingLitres: parseFloat(n.testingLitres) || 0,
            salesLitres: parseFloat(n.salesLitres) || 0,
            rate: parseFloat(n.rate) || 0,
            totalAmount: parseFloat(n.totalAmount) || 0
          });
        }

        // 3b. SECTION B: LUBRICANTS SALES REGISTER SYNC
        await syncSectionBToLubricants(selectedDate, lubricants);

        // 4. SECTION D: OTHER INCOME (USHINA JAMA / MISC)
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

        // 5. SECTION G: EXPENSES (USHINA UDHAR / PUMP DIRECT EXPENSES)
        const oldExp = await db.expenses.where('date').equals(selectedDate).toArray();
        for (const oe of oldExp) await db.expenses.delete(oe.id);
        for (const e of (expenseEntries || [])) {
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

        // 5b. Sync Other Expenses into pump_other_expenses store
        const otherExps = (expenseEntries || []).filter(e => 
          (e.category === 'Other Expenses' || e.category === 'Other Expense') && (parseFloat(e.amount) || 0) > 0
        );
        if (otherExps.length > 0) {
          try {
            let existingOther = [];
            const saved = localStorage.getItem('pump_other_expenses') || localStorage.getItem('other_expenses');
            if (saved) {
              try { existingOther = JSON.parse(saved); } catch (e) {}
            }
            if (!Array.isArray(existingOther)) existingOther = [];
            const filtered = existingOther.filter(e => !(e.date === selectedDate && e.shiftId === activeShift && e.fromDailyShift));
            const newItems = otherExps.map((e, idx) => ({
              id: `oe-shift-${selectedDate}-${activeShift}-${e.id || idx}`,
              date: selectedDate,
              shiftId: activeShift,
              remarks: e.description || 'Shift Expense',
              amount: parseFloat(e.amount) || 0,
              fromDailyShift: true
            }));
            const merged = [...newItems, ...filtered];
            localStorage.setItem('pump_other_expenses', JSON.stringify(merged));
            await db.settings.put({
              key: 'pump_other_expenses',
              data: merged,
              updatedAt: new Date().toISOString()
            });
            window.dispatchEvent(new Event('pump_oa_sync'));
          } catch (err) {
            console.error('Error saving other expenses during shift save:', err);
          }
        }

        // 5c. Sync Ushina Accounts: Section D (Other Income -> Ushina JAMA) & Section G (Ushina Khata -> Ushina UDHAR)
        try {
          let currentUshina = [];
          const savedUsh = localStorage.getItem('ushina_accounts') || localStorage.getItem('pump_ushina_directory');
          if (savedUsh) {
            try { currentUshina = JSON.parse(savedUsh); } catch (e) {}
          }
          if (!Array.isArray(currentUshina) || currentUshina.length === 0) {
            const dbUsh = (await db.settings.get('other_accounts_ushina')) || (await db.settings.get('vividh_khata_accounts'));
            if (dbUsh && Array.isArray(dbUsh.data)) currentUshina = dbUsh.data;
            else currentUshina = Array.isArray(ushinaDirectory) ? ushinaDirectory : [];
          }

          if (Array.isArray(currentUshina) && currentUshina.length > 0) {
            const updatedUshina = currentUshina.map((acc, aIdx) => {
              const accName = (acc.name || '').trim().toLowerCase();

              // Remove previous saved entries from this shift to ensure idempotency
              const cleanJama = (acc.jamaEntries || []).filter(j => !(j.fromDailyShift && j.date === selectedDate && j.shiftId === activeShift));
              const cleanUdhar = (acc.udharEntries || []).filter(u => !(u.fromDailyShift && u.date === selectedDate && u.shiftId === activeShift));

              // Find Section D matching entries (JAMA)
              const newJamaFromSecD = (otherIncomeEntries || [])
                .filter(inc => {
                  const amt = parseFloat(inc.amount) || 0;
                  if (amt <= 0) return false;
                  let cat = (inc.category || '').trim().toLowerCase();
                  const desc = (inc.description || '').trim().toLowerCase();
                  const pName = (inc.partyName || '').trim().toLowerCase();
                  const accId = (inc.accountId || '').trim().toLowerCase();
                  const currentAccId = (acc.id || '').trim().toLowerCase();

                  if (!cat && !pName && aIdx === 0) cat = accName;
                  return (
                    cat === accName ||
                    pName === accName ||
                    (accId && accId === currentAccId) ||
                    desc === accName ||
                    (cat === 'ushina khata' && desc === accName) ||
                    (cat === 'ushina' && desc === accName) ||
                    (cat === 'other income' && desc === accName) ||
                    currentUshina.length === 1
                  );
                })
                .map((inc, iIdx) => ({
                  id: `jama-shift-${selectedDate}-${activeShift}-${inc.id || iIdx}`,
                  date: selectedDate,
                  shiftId: activeShift,
                  amount: parseFloat(inc.amount) || 0,
                  remarks: inc.description ? `${inc.description} (Daily Entry Other Income)` : `Daily Entry Other Income (${selectedDate})`,
                  fromDailyShift: true
                }));

              // Find Section G matching entries (UDHAR)
              const newUdharFromSecG = (expenseEntries || [])
                .filter(exp => {
                  const amt = parseFloat(exp.amount) || 0;
                  if (amt <= 0) return false;
                  const cat = (exp.category || '').trim().toLowerCase();
                  const desc = (exp.description || '').trim().toLowerCase();
                  return (cat === 'ushina khata' || cat === 'ushina') && (desc === accName || (!desc && aIdx === 0));
                })
                .map((exp, eIdx) => ({
                  id: `udhar-shift-${selectedDate}-${activeShift}-${exp.id || eIdx}`,
                  date: selectedDate,
                  shiftId: activeShift,
                  amount: parseFloat(exp.amount) || 0,
                  description: exp.description ? `Daily Entry Shift Expense (${selectedDate}) - ${exp.description}` : `Daily Entry Shift Expense (${selectedDate})`,
                  fromDailyShift: true
                }));

              return {
                ...acc,
                jamaEntries: [...newJamaFromSecD, ...cleanJama],
                udharEntries: [...newUdharFromSecG, ...cleanUdhar]
              };
            });

            localStorage.setItem('ushina_accounts', JSON.stringify(updatedUshina));
            localStorage.setItem('pump_ushina_directory', JSON.stringify(updatedUshina));
            await db.settings.put({
              key: 'other_accounts_ushina',
              data: updatedUshina,
              updatedAt: new Date().toISOString()
            });
            await db.settings.put({
              key: 'vividh_khata_accounts',
              data: updatedUshina,
              updatedAt: new Date().toISOString()
            });
            window.dispatchEvent(new Event('pump_oa_sync'));
          }
        } catch (err) {
          console.error('Error syncing Ushina Jama/Udhar from Daily Entry:', err);
        }

        // 6. SECTION F: BANK DEPOSIT
        const oldDeposits = await db.bankDeposits.where('date').equals(selectedDate).toArray();
        for (const ob of oldDeposits) await db.bankDeposits.delete(ob.id);
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

        // 7. SECTION G: CASH DENOMINATIONS
        const existingCash = await db.cashDenominations.where('date').equals(selectedDate).first();
        if (existingCash) {
          await db.cashDenominations.update(existingCash.id, { ...denominations, totalCash: actualPhysicalCash });
        } else {
          await db.cashDenominations.add({ date: selectedDate, shiftId: activeShift, ...denominations, totalCash: actualPhysicalCash });
        }

        // Master Shift Record Archive
        await db.masterShifts.add({
          date: selectedDate,
          shiftId: activeShift,
          openingShreeSilak,
          totalFuelSales: totalFuelSalesAmount,
          totalOilCng: totalOilCngAmount,
          grossInflow: totalInflowGrossCashIn,
          totalCustomerDebits,
          totalExpensesKharch,
          totalDigitalPay: totalSmartBalance,
          totalBankDeposits,
          shreeSilak: closingShreeSilak,
          actualPhysicalCash,
          cashVariance,
          timestamp: new Date().toISOString()
        });
      });

      // Execute Master Cross-Module Synchronization Pipeline
      await syncDailyEntryToModules(selectedDate, activeShift, {
        lubricants,
        nozzles,
        nozzleTotals,
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

      await syncNozzlesToStockPatrak(selectedDate, {
        petrolLitres: nozzleTotals.petrolLitres,
        dieselLitres: nozzleTotals.dieselLitres,
        speedLitres: nozzleTotals.speedLitres
      }, true);

      // Non-Destructive Safeguard: Auto-create missing products in catalog/matrix with Opening Stock = 0
      if (Array.isArray(lubricants)) {
        let catalogCopy = JSON.parse(JSON.stringify(productCatalog || []));
        let catalogChanged = false;

        let lubeCategory = catalogCopy.find(g => {
          const c = (g.category || '').toLowerCase();
          return c.includes('lube') || c.includes('oil');
        });

        if (!lubeCategory) {
          lubeCategory = { category: 'Lubricants & Engine Oils', items: [] };
          catalogCopy.push(lubeCategory);
          catalogChanged = true;
        }

        const currentMonthKey = selectedDate ? selectedDate.slice(0, 7) : new Date().toISOString().slice(0, 7);
        let currentMatrix = {};
        try {
          const saved = localStorage.getItem(`lube_stock_matrix_${currentMonthKey}`);
          currentMatrix = saved ? JSON.parse(saved) : {};
        } catch (err) {}

        let matrixChanged = false;

        for (const item of lubricants) {
          if (item && item.productName && item.productName.trim()) {
            const pName = item.productName.trim();
            const qty = parseFloat(item.soldQty ?? item.soldCount) || 0;

            if (qty > 0) {
              const existsInCat = lubeCategory.items.some(i => i.name.toLowerCase() === pName.toLowerCase());
              if (!existsInCat) {
                const vol = parseFloat(item.litreVolume ?? item.volume) || 1.0;
                const price = parseFloat(item.unitPrice ?? item.rate) || 0;
                lubeCategory.items.push({
                  id: `lub-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                  name: pName,
                  defaultUnit: 'Liter',
                  defaultTax: 'GST',
                  defaultGst: 18,
                  defaultVat: 0,
                  defaultVolume: vol,
                  defaultPrice: price
                });
                catalogChanged = true;
              }

              if (!currentMatrix[pName]) {
                currentMatrix[pName] = { openingTins: 0, openingLiters: 0, receiptDate: '', receiptTins: 0 };
                matrixChanged = true;
              }
            }
          }
        }

        if (catalogChanged && updateProductCatalog) {
          await updateProductCatalog(catalogCopy);
        }

        if (matrixChanged) {
          try {
            localStorage.setItem(`lube_stock_matrix_${currentMonthKey}`, JSON.stringify(currentMatrix));
          } catch (err) {}
        }
      }

      window.dispatchEvent(new Event('pump_product_catalog_updated'));
      window.dispatchEvent(new Event('lubricant_matrix_updated'));

      // Supabase Cloud Shift Snapshot Sync (Account-isolated into pump_station_data)
      let cloudError = null;
      if (currentUser?.id) {
        try {
          localStorage.setItem(`mypump_${currentUser.id}_workspace`, JSON.stringify(shiftSnapshot));
        } catch (e) {}

        try {
          const res = await upsertUserStationData(currentUser.id, {
            stationProfile,
            nozzles,
            rates,
            dips,
            dailyShifts: [
              {
                date: selectedDate,
                shiftType: activeShift,
                totals: { grossInflow, totalDeductions, netCashInHand },
                savedAt: new Date().toISOString()
              }
            ],
            otherAccounts: { ushinaDirectory, pumpExpenses: pumpExpenseCategories },
            bankEntries,
            staffAttendance: {}
          });
          if (res?.error) {
            cloudError = res.error?.message || String(res.error);
          }
        } catch (err) {
          cloudError = err?.message || String(err);
        }

        syncStationDataToCloud(currentUser.id, {
          date: selectedDate,
          shiftId: activeShift,
          fuelRates: rates,
          nozzles,
          dips,
          stationProfile,
          lastSavedAt: new Date().toISOString()
        }).catch(err => console.warn('Supabase cloud shift sync error:', err));
      }

      if (cloudError) {
        showToast('Saved locally, but Cloud sync warning: ' + cloudError, 'warning');
      } else {
        showToast('All Station Data Saved to Your Account!', 'success');
      }
    } catch (err) {
      console.error('Handled action error without reloading:', err);
      showToast('Error saving Daily Shift: ' + (err?.message || String(err)), 'error');
    }
  };

  const handleSaveAllSections = handleSaveMasterShift;

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSaveMasterShift();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedDate, activeShift, dips, rates, nozzles, lubricants, expenseEntries, otherIncomeEntries, debitEntries, jamaEntries, bankEntries, denominations]);

  const goToToday = () => {
    if (setSelectedDate) setSelectedDate(todayStr);
  };

  if (!dbReady) return <div className="p-8 text-center text-sm font-semibold text-slate-300">Loading Shital Petrolium Daily Shift Sheet...</div>;

  return (
    <div className="p-3.5 space-y-3.5 animate-fadeIn pb-20 bg-[#0c121d] min-h-screen text-slate-200 font-sans">
      {/* HISTORICAL ARCHIVE READ-ONLY BANNER */}
      {(isArchivedView || isLocked || isHistoricalView) && (
        <HistoricalBanner
          date={selectedDate}
          shiftType={activeShift}
          savedAt={shiftPdfSnapshot?.savedAt || null}
          onReturnToToday={goToToday}
        />
      )}

      {/* 1. HEADER & GLOBAL BAR */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-[#121927] p-3 rounded-xl border border-[#1e293b] shadow-lg">
        <div className="flex items-center gap-2.5">
          <Fuel className="w-5 h-5 text-orange-400" />
          <div>
            <h2 className="text-[14px] font-semibold text-slate-100 tracking-wide">
              {stationProfile?.fuelStationName || "Shital Petroleum, Kheralu"}
            </h2>
          </div>
        </div>

        {/* Global Controls & Cash Calculator Button */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button"
            onClick={(e) => {
              if (e && e.preventDefault) e.preventDefault();
              if (e && e.stopPropagation) e.stopPropagation();
              try {
                setCalcDenoms({
                  n500: denominations?.n500 || 0,
                  n200: denominations?.n200 || 0,
                  n100: denominations?.n100 || 0,
                  n50: denominations?.n50 || 0,
                  n20: denominations?.n20 || 0,
                  n10: denominations?.n10 || 0,
                  n5: denominations?.n5 || 0,
                  coins: denominations?.coins || 0,
                });
                setIsCashCalcOpen(true);
              } catch (err) {
                console.error('Handled cash calc error:', err);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172033] hover:bg-[#1f2b45] text-slate-300 border border-[#23304a] text-xs font-semibold tracking-wide transition-all active:scale-95 cursor-pointer"
          >
            <Calculator className="w-3.5 h-3.5 text-emerald-400" />
            <span>💵 Cash Denomination (Kupan)</span>
          </button>

          <button type="button"
            onClick={handleSaveMasterShift}
            className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-md shadow-blue-900/30 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save (Ctrl+S)</span>
          </button>
        </div>
      </div>

      {/* SECTION A: NOZZLE METER READINGS & TANK DIP */}
      <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg p-3.5 space-y-3">
        {/* Top Controls: 2-Card Responsive Grid (Tank Dips + Daily Fuel Rates) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch pb-3 border-b border-slate-800">
          
          {/* 1. LEFT CARD: TANK DIP INPUTS (6 Columns) */}
          <div className="lg:col-span-6 bg-[#0e1420] border border-[#1b2537] rounded-lg p-2.5 flex flex-col justify-between space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-1.5">
              <h4 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 tracking-wide flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Underground Tank Reconciliation
              </h4>
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 font-mono">Tank Dip & Density</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* 1. MS Dip */}
              <div className="flex flex-col space-y-1.5 bg-white dark:bg-[#121927] border border-slate-200 dark:border-[#1e293b] p-2.5 rounded-lg shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/50 rounded-full px-2.5 py-0.5 text-[11px] inline-flex items-center justify-center">MS (Petrol)</span>
                  <span className="bg-emerald-700 text-white font-bold px-2 py-0.5 rounded text-xs shadow-sm dark:bg-emerald-800 font-mono">Tank 1</span>
                </div>
                
                <div>
                  <label className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-0.5">Dip Level (cm)</label>
                  <NumericInput
                    value={dips.msDipCm}
                    onChange={(val) => setDips({ ...dips, msDipCm: val })}
                    className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold focus:ring-2 focus:ring-blue-500 rounded-lg text-xs px-2 py-1 text-right font-mono outline-none transition-all tabular-nums"
                    placeholder="cm"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Volume (Litres)</label>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono font-medium">Manual Litres</span>
                  </div>
                  <div className="relative flex items-center">
                    <NumericInput
                      value={dips.msDipLiters !== undefined && dips.msDipLiters !== null ? dips.msDipLiters : ''}
                      onChange={(val) => setDips({ ...dips, msDipLiters: val })}
                      className="w-full bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 font-bold border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 rounded-lg text-xs px-2 py-1 pr-6 text-right font-mono outline-none transition-all tabular-nums"
                      placeholder="Litres"
                    />
                    <span className="absolute right-2 text-[10px] font-bold text-slate-600 dark:text-slate-400 pointer-events-none">L</span>
                  </div>
                </div>
              </div>

              {/* 2. HSD Dip */}
              <div className="flex flex-col space-y-1.5 bg-white dark:bg-[#121927] border border-slate-200 dark:border-[#1e293b] p-2.5 rounded-lg shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="bg-amber-50 text-amber-900 border border-amber-300 font-semibold dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/50 rounded-full px-2.5 py-0.5 text-[11px] inline-flex items-center justify-center">HSD (Diesel)</span>
                  <span className="bg-amber-700 text-white font-bold px-2 py-0.5 rounded text-xs shadow-sm dark:bg-amber-800 font-mono">Tank 2</span>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-0.5">Dip Level (cm)</label>
                  <NumericInput
                    value={dips.hsdDipCm}
                    onChange={(val) => setDips({ ...dips, hsdDipCm: val })}
                    className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold focus:ring-2 focus:ring-blue-500 rounded-lg text-xs px-2 py-1 text-right font-mono outline-none transition-all tabular-nums"
                    placeholder="cm"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Volume (Litres)</label>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono font-medium">Manual Litres</span>
                  </div>
                  <div className="relative flex items-center">
                    <NumericInput
                      value={dips.hsdDipLiters !== undefined && dips.hsdDipLiters !== null ? dips.hsdDipLiters : ''}
                      onChange={(val) => setDips({ ...dips, hsdDipLiters: val })}
                      className="w-full bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 font-bold border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 rounded-lg text-xs px-2 py-1 pr-6 text-right font-mono outline-none transition-all tabular-nums"
                      placeholder="Litres"
                    />
                    <span className="absolute right-2 text-[10px] font-bold text-slate-600 dark:text-slate-400 pointer-events-none">L</span>
                  </div>
                </div>
              </div>

              {/* 3. Speed Dip */}
              <div className="flex flex-col space-y-1.5 bg-white dark:bg-[#121927] border border-slate-200 dark:border-[#1e293b] p-2.5 rounded-lg shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="bg-purple-50 text-purple-900 border border-purple-300 font-semibold dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-700/50 rounded-full px-2.5 py-0.5 text-[11px] inline-flex items-center justify-center">XP (Speed)</span>
                  <span className="bg-purple-700 text-white font-bold px-2 py-0.5 rounded text-xs shadow-sm dark:bg-purple-800 font-mono">Tank 3</span>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-0.5">Dip Level (cm)</label>
                  <NumericInput
                    value={dips.speedDipCm}
                    onChange={(val) => setDips({ ...dips, speedDipCm: val })}
                    className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold focus:ring-2 focus:ring-blue-500 rounded-lg text-xs px-2 py-1 text-right font-mono outline-none transition-all tabular-nums"
                    placeholder="cm"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Volume (Litres)</label>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono font-medium">Manual Litres</span>
                  </div>
                  <div className="relative flex items-center">
                    <NumericInput
                      value={dips.speedDipLiters !== undefined && dips.speedDipLiters !== null ? dips.speedDipLiters : ''}
                      onChange={(val) => setDips({ ...dips, speedDipLiters: val })}
                      className="w-full bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 font-bold border border-slate-300 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 rounded-lg text-xs px-2 py-1 pr-6 text-right font-mono outline-none transition-all tabular-nums"
                      placeholder="Litres"
                    />
                    <span className="absolute right-2 text-[10px] font-bold text-slate-600 dark:text-slate-400 pointer-events-none">L</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Real-Time Nozzle Sales Volume Aggregation Sub-Bar */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80">
              <div className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300 tracking-wider mb-1 flex items-center justify-between">
                <span>Shift Dispensed Volume (Active Nozzles):</span>
                <span className="text-[9px] font-mono text-slate-600 dark:text-slate-400 font-medium">Live Dispensed</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
                {/* Petrol Sold */}
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300">MS Petrol</span>
                  <span className="text-[12px] font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    {nozzleTotals.petrolLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
                  </span>
                </div>

                {/* Diesel Sold */}
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300">HSD Diesel</span>
                  <span className="text-[12px] font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    {nozzleTotals.dieselLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
                  </span>
                </div>

                {/* Speed Sold */}
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-purple-800 dark:text-purple-300">Speed Petrol</span>
                  <span className="text-[12px] font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    {nozzleTotals.speedLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
                  </span>
                </div>

                {/* CNG Sold */}
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-sky-800 dark:text-sky-300">CNG Total</span>
                  <span className="text-[12px] font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    {totalCngKgCombined.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Kg
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. RIGHT CARD: DAILY FUEL RATES (6 Columns) */}
          <div className="lg:col-span-6 bg-[#0e1420] border border-[#1b2537] rounded-lg p-2.5 flex flex-col justify-between space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-1.5">
              <h4 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 tracking-wide flex items-center gap-1.5">
                ⛽ Current Fuel Rates (₹/Ltr)
              </h4>
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 font-mono">Daily Price Master</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* MS Petrol Rate */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-slate-900 dark:text-slate-100 font-medium">
                <span className="bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/50 rounded-full px-2 py-0.5 text-[11px] inline-flex items-center justify-center">MS Petrol</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-700 dark:text-slate-300 text-xs font-mono font-bold">₹</span>
                  <NumericInput
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={rates['Motor Spirit (Petrol)'] !== undefined ? rates['Motor Spirit (Petrol)'] : 0}
                    onChange={(val) => handleRateChange('Motor Spirit (Petrol)', val)}
                    onBlur={() => handleRateBlur('Motor Spirit (Petrol)')}
                    className="w-16 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs px-1.5 py-0.5 rounded text-right font-mono outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                  />
                </div>
              </div>

              {/* HSD Diesel Rate */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-slate-900 dark:text-slate-100 font-medium">
                <span className="bg-amber-50 text-amber-900 border border-amber-300 font-semibold dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/50 rounded-full px-2 py-0.5 text-[11px] inline-flex items-center justify-center">HSD Diesel</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-700 dark:text-slate-300 text-xs font-mono font-bold">₹</span>
                  <NumericInput
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={rates['High Speed Diesel'] !== undefined ? rates['High Speed Diesel'] : 0}
                    onChange={(val) => handleRateChange('High Speed Diesel', val)}
                    onBlur={() => handleRateBlur('High Speed Diesel')}
                    className="w-16 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs px-1.5 py-0.5 rounded text-right font-mono outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                  />
                </div>
              </div>

              {/* Speed Rate */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-slate-900 dark:text-slate-100 font-medium">
                <span className="bg-purple-50 text-purple-900 border border-purple-300 font-semibold dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-700/50 rounded-full px-2 py-0.5 text-[11px] inline-flex items-center justify-center">XP Speed</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-700 dark:text-slate-300 text-xs font-mono font-bold">₹</span>
                  <NumericInput
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={(rates['Speed Petrol'] !== undefined && rates['Speed Petrol'] !== '') ? rates['Speed Petrol'] : (rates['XP Premium Petrol'] !== undefined ? rates['XP Premium Petrol'] : 0)}
                    onChange={(val) => handleRateChange('Speed Petrol', val)}
                    onBlur={() => handleRateBlur('Speed Petrol')}
                    className="w-16 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs px-1.5 py-0.5 rounded text-right font-mono outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                  />
                </div>
              </div>

              {/* CNG Rate */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-slate-900 dark:text-slate-100 font-medium">
                <span className="bg-sky-50 text-sky-900 border border-sky-300 font-semibold dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-700/50 rounded-full px-2 py-0.5 text-[11px] inline-flex items-center justify-center">CNG (/kg)</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-700 dark:text-slate-300 text-xs font-mono font-bold">₹</span>
                  <NumericInput
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={rates['CNG'] !== undefined ? rates['CNG'] : 0}
                    onChange={(val) => handleRateChange('CNG', val)}
                    onBlur={() => handleRateBlur('CNG')}
                    className="w-16 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 font-bold text-xs px-1.5 py-0.5 rounded text-right font-mono outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Apply Rates Button */}
            <button type="button"
              onClick={handleApplyGlobalRates}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md shadow-blue-900/30 flex items-center justify-center gap-1.5 transition-colors cursor-pointer w-full mt-1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Apply Rates to Active Nozzles</span>
            </button>
          </div>
        </div>

        {/* Section Title & Action Buttons Header */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-2.5">
          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 tracking-wide flex items-center gap-2">
            <Fuel className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Daily Shift Entry (Fuel grid) - {activeMpdIds.length} MPDs | {nozzles.length} Nozzles</span>
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            {activeMpdIds.length < 24 && (
              <button type="button"
                onClick={handleAddMpd}
                className="bg-[#192438] hover:bg-[#202f4a] text-blue-400 border border-blue-500/40 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all flex items-center cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span>+ Add MPD</span>
              </button>
            )}
          </div>
        </div>

        {/* MPD Cards List */}
        <div className="space-y-3">
          {activeMpdIds.map((mpdId) => {
            const mpdNozzles = nozzles.filter((n, idx) => getMpdIdForNozzle(n, idx) === mpdId);
            const mpdTotals = getMpdTotals(mpdNozzles);
            const mpdTitle = getMpdTitle(mpdId);

            return (
              <div key={mpdId} className="bg-[#0e1420] border border-[#1b2537] rounded-lg p-2.5 space-y-2">
                {/* MPD Card Header */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">⛽</span>
                    <h4 className="text-[12px] font-medium text-slate-300 uppercase tracking-wide">
                      {mpdTitle}
                    </h4>
                    <span className="bg-[#192438] text-blue-400 border border-blue-800/40 text-[10px] font-mono px-2 py-0.5 rounded-full">
                      {mpdNozzles.length} Nozzles
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button type="button"
                      onClick={(e) => handleAddNozzleToMpd(mpdId, e)}
                      className="bg-[#172033] hover:bg-[#1f2b45] text-slate-200 border border-[#23304a] text-xs font-semibold px-2.5 py-1 rounded-md transition-all active:scale-95 flex items-center cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      <span>Add Nozzle</span>
                    </button>
                    <button type="button"
                      onClick={(e) => handleDeleteMpd(mpdId, e)}
                      className="p-1 rounded-md bg-rose-950/40 border border-rose-800/40 text-rose-400 hover:bg-rose-900/60 transition-all cursor-pointer"
                      title={`Delete ${mpdTitle}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* MPD Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800">
                        <th className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider py-1.5 px-2 text-center bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 w-24">NOZZLE ID</th>
                        <th className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider py-1.5 px-2.5 text-left bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">FUEL PRODUCT</th>
                        <th className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider py-1.5 px-2 text-right bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">OPENING</th>
                        <th className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider py-1.5 px-2 text-right bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">CLOSING</th>
                        <th className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider py-1.5 px-2 text-right bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 w-24">TESTING (L)</th>
                        <th className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider py-1.5 px-2 text-right bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">SALES (L)</th>
                        <th className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider py-1.5 px-2 text-right bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 w-20">RATE (₹)</th>
                        <th className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider py-1.5 px-2.5 text-right bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">TOTAL (₹)</th>
                        <th className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider py-1.5 px-2 text-center bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 w-12">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-[#1b2537]">
                      {mpdNozzles.map((n) => {
                        const realIdx = nozzles.indexOf(n);
                        return (
                          <tr key={n._localId || n.id || (n.nozzleId + '_' + realIdx)} className="bg-white dark:bg-[#121927] hover:bg-slate-50 dark:hover:bg-[#172033] transition-colors">
                            <td className="p-1.5 text-center">
                              <input
                                type="text"
                                value={n.nozzleId}
                                onChange={(e) => handleNozzleChange(realIdx, 'nozzleId', e.target.value)}
                                className="w-20 bg-white dark:bg-[#172033] border border-slate-300 dark:border-[#23304a] text-blue-700 dark:text-blue-400 font-mono font-bold text-xs px-1.5 py-1 rounded text-center outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="p-1.5">
                              <select
                                value={getNormalizedProductName(n.productName)}
                                onChange={(e) => handleNozzleChange(realIdx, 'productName', e.target.value)}
                                className="w-full bg-white dark:bg-[#172033] border border-slate-300 dark:border-[#23304a] text-slate-900 dark:text-slate-100 text-xs px-2 py-1 rounded outline-none cursor-pointer font-medium focus:ring-2 focus:ring-blue-500"
                              >
                                {FUEL_PRODUCTS.map(prod => (
                                  <option key={prod.id} value={prod.fullName} className="bg-white dark:bg-[#121927] text-slate-900 dark:text-slate-100">
                                    {prod.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-1.5 text-right">
                              <NumericInput
                                step="0.1"
                                value={n.openingReading}
                                onChange={(val) => handleNozzleChange(realIdx, 'openingReading', val)}
                                className="w-24 bg-white dark:bg-[#172033] border border-slate-300 dark:border-[#23304a] focus:border-blue-500 focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 text-xs px-2 py-1 rounded text-right font-mono font-bold outline-none tabular-nums"
                              />
                            </td>
                            <td className="p-1.5 text-right">
                              <NumericInput
                                step="0.1"
                                value={n.closingReading}
                                onChange={(val) => handleNozzleChange(realIdx, 'closingReading', val)}
                                className="w-24 bg-white dark:bg-[#172033] border border-slate-300 dark:border-[#23304a] focus:border-blue-500 focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-slate-100 text-xs px-2 py-1 rounded text-right font-mono font-bold outline-none tabular-nums"
                              />
                            </td>
                            <td className="p-1.5 text-right">
                              <NumericInput
                                step="0.1"
                                value={n.testingLitres}
                                onChange={(val) => handleNozzleChange(realIdx, 'testingLitres', val)}
                                className="w-16 bg-white dark:bg-[#172033] border border-slate-300 dark:border-[#23304a] focus:border-blue-500 focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-300 text-xs px-1.5 py-1 rounded text-right font-mono font-medium outline-none tabular-nums"
                              />
                            </td>
                            <td className="p-1.5 text-right font-mono font-bold text-xs text-blue-700 dark:text-blue-400 tabular-nums">
                              {(n.salesLitres || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-1.5 text-right">
                              <NumericInput
                                step="0.01"
                                value={n.rate}
                                onChange={(val) => handleNozzleChange(realIdx, 'rate', val)}
                                className="w-16 bg-white dark:bg-[#172033] border border-slate-300 dark:border-[#23304a] focus:border-amber-500 focus:ring-2 focus:ring-amber-500 text-amber-700 dark:text-amber-400 font-bold text-xs px-1.5 py-1 rounded text-right font-mono outline-none tabular-nums"
                              />
                            </td>
                            <td className="p-1.5 text-right font-mono font-bold text-xs text-emerald-700 dark:text-emerald-400 tabular-nums">
                              ₹{(n.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-1.5 text-center">
                              <button type="button"
                                onClick={(e) => handleDeleteNozzle(n, realIdx, e)}
                                className="p-1 rounded bg-rose-950/40 border border-rose-800/40 text-rose-400 hover:bg-rose-900/60 transition-all cursor-pointer"
                                title="Delete Nozzle"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* MPD Card Machine-Wise Sub-Footer */}
                <div className="bg-slate-50 dark:bg-[#121927] border border-slate-200 dark:border-[#1e293b] px-3 py-1.5 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-emerald-800 dark:text-emerald-400 font-bold">
                      MS: <span className="font-bold text-slate-900 dark:text-slate-100">{mpdTotals.petrolLitres.toFixed(2)} L</span> <span className="text-slate-600 dark:text-slate-400 font-normal">(₹{mpdTotals.petrolAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>
                    </span>
                    <span className="text-amber-800 dark:text-amber-400 font-bold">
                      HSD: <span className="font-bold text-slate-900 dark:text-slate-100">{mpdTotals.dieselLitres.toFixed(2)} L</span> <span className="text-slate-600 dark:text-slate-400 font-normal">(₹{mpdTotals.dieselAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>
                    </span>
                    <span className="text-purple-800 dark:text-purple-400 font-bold">
                      Speed: <span className="font-bold text-slate-900 dark:text-slate-100">{mpdTotals.speedLitres.toFixed(2)} L</span> <span className="text-slate-600 dark:text-slate-400 font-normal">(₹{mpdTotals.speedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>
                    </span>
                    <span className="text-sky-800 dark:text-blue-400 font-bold">
                      CNG: <span className="font-bold text-slate-900 dark:text-slate-100">{mpdTotals.cngKg.toFixed(2)} Kg</span> <span className="text-slate-600 dark:text-slate-400 font-normal">(₹{mpdTotals.cngAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>
                    </span>
                  </div>
                  <div className="bg-white dark:bg-[#172033] border border-slate-300 dark:border-[#23304a] text-emerald-700 dark:text-emerald-400 font-mono font-bold px-2.5 py-1 rounded text-xs">
                    MPD Total: ₹{mpdTotals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Station Grand Summary (Full Section A Footer) */}
        <div className="bg-[#0e1420] border border-[#1b2537] p-2.5 rounded-lg space-y-2 mt-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-[12px] font-medium text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-emerald-400" /> Section A: Fuel Product Sales Rakam Summary
            </h4>
            <span className="text-[11px] font-medium text-slate-400 font-mono">
              Total Volume: {totalFuelSalesLitres.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
            {/* Petrol Sale Rakam */}
            <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg">
              <div className="text-[10px] font-medium text-emerald-400 uppercase tracking-wide">MS Petrol Rakam</div>
              <div className="text-[13px] font-bold text-slate-100 font-mono tabular-nums mt-0.5">
                ₹{nozzleTotals.petrolAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Diesel Sale Rakam */}
            <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg">
              <div className="text-[10px] font-medium text-amber-400 uppercase tracking-wide">HSD Diesel Rakam</div>
              <div className="text-[13px] font-bold text-slate-100 font-mono tabular-nums mt-0.5">
                ₹{nozzleTotals.dieselAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Speed Sale Rakam */}
            <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg">
              <div className="text-[10px] font-medium text-purple-400 uppercase tracking-wide">Speed Petrol Rakam</div>
              <div className="text-[13px] font-bold text-slate-100 font-mono tabular-nums mt-0.5">
                ₹{nozzleTotals.speedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* CNG Sale Rakam */}
            <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg">
              <div className="text-[10px] font-medium text-blue-400 uppercase tracking-wide">CNG Sale Rakam</div>
              <div className="text-[13px] font-bold text-slate-100 font-mono tabular-nums mt-0.5">
                ₹{totalCngAmtCombined.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {/* Grand Total Revenue */}
            <div className="bg-[#0f1726] border border-[#1e293b] p-2 rounded-lg flex flex-col justify-between">
              <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Total Fuel Revenue</div>
              <div className="text-[13px] font-bold font-mono tabular-nums mt-0.5 text-emerald-400 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                ₹{totalFuelSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION B: TANKS & INVENTORY */}
      <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Droplet className="w-4 h-4 text-amber-400" />
            <h3 className="text-[13px] font-semibold text-slate-100 tracking-wide">
              Lubricants Matrix (Section B: Inventory Sales)
            </h3>
          </div>
          <div>
            <button type="button"
              onClick={handleAddLubricantRow}
              className="bg-[#192438] hover:bg-[#202f4a] text-blue-400 border border-blue-500/40 text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all flex items-center cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>+ Add Lubricant</span>
            </button>
          </div>
        </div>

        <div className="bg-[#0e1420] border border-[#1b2537] rounded-lg p-2.5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-1.5 px-2.5 text-left bg-slate-900/60 border-b border-slate-800">PRODUCT NAME</th>
                  <th className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider py-1.5 px-2 text-right bg-slate-900/60 border-b border-slate-800 w-28">VOLUME (L)</th>
                  <th className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider py-1.5 px-2 text-right bg-slate-900/60 border-b border-slate-800 w-24">SOLD QTY</th>
                  <th className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-1.5 px-2 text-right bg-slate-900/60 border-b border-slate-800 w-24">UNIT PRICE (₹)</th>
                  <th className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider py-1.5 px-2.5 text-right bg-slate-900/60 border-b border-slate-800 w-32">TOTAL SALE (₹)</th>
                  <th className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-1.5 px-2 text-center bg-slate-900/60 border-b border-slate-800 w-12">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1b2537]">
                {lubricants.map((l, idx) => {
                  const total = calculateLubricantRowTotal(l);
                  return (
                    <tr key={l.id || l.syncId || `lube-${idx}`} className="bg-[#121927] hover:bg-[#172033] transition-colors">
                      <td className="p-1.5">
                        <select
                          value={l.productName || getFirstValidLubricant(idx)}
                          onChange={(e) => updateLubricantItem(idx, 'productName', e.target.value)}
                          className="w-full bg-[#172033] border border-[#23304a] rounded px-2.5 py-1 text-xs text-slate-100 outline-none cursor-pointer"
                        >
                          {l.productName && !activeLubricantOptions.some(opt => opt.name === l.productName) && (
                            <option value={l.productName} className="bg-[#121927]">{l.productName}</option>
                          )}
                          {activeLubricantOptions.map((opt) => (
                            <option key={opt.id || opt.name} value={opt.name} className="bg-[#121927]">
                              {opt.name} ({opt.volume}L)
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1.5 text-right">
                        <NumericInput
                          step="0.001"
                          value={
                            l.litreVolume !== undefined && l.litreVolume !== null && l.litreVolume !== '' && !isNaN(parseFloat(l.litreVolume))
                              ? l.litreVolume
                              : l.volume !== undefined && l.volume !== null && l.volume !== '' && !isNaN(parseFloat(l.volume))
                              ? l.volume
                              : 0
                          }
                          onChange={(val) => updateLubricantItem(idx, 'litreVolume', val)}
                          className="w-24 bg-[#172033] border border-[#23304a] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-blue-400 text-xs px-2 py-1 rounded text-right font-mono outline-none tabular-nums"
                        />
                      </td>
                      <td className="p-1.5 text-right">
                        <NumericInput
                          value={l.soldQty ?? l.soldCount ?? 0}
                          onChange={(val) => updateLubricantItem(idx, 'soldQty', val)}
                          className="w-20 bg-[#172033] border border-[#23304a] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-amber-400 text-xs px-2 py-1 rounded text-right font-mono outline-none tabular-nums font-semibold"
                        />
                      </td>
                      <td className="p-1.5 text-right">
                        <NumericInput
                          step="0.01"
                          value={l.unitPrice ?? l.rate ?? 0}
                          onChange={(val) => updateLubricantItem(idx, 'unitPrice', val)}
                          className="w-20 bg-[#172033] border border-[#23304a] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-100 text-xs px-2 py-1 rounded text-right font-mono outline-none tabular-nums"
                        />
                      </td>
                      <td className="p-1.5 text-right font-mono font-bold text-xs text-emerald-400 tabular-nums">
                        ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 text-center">
                        <button type="button"
                          onClick={(e) => handleDeleteLubricantRow(idx, e)}
                          className="p-1 rounded bg-rose-950/40 border border-rose-800/40 text-rose-400 hover:bg-rose-900/60 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section B Footer: 3 Aggregated Totals Summary Bar */}
        <div className="bg-[#0e1420] border border-[#1b2537] p-2.5 rounded-lg flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Droplet className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-300 uppercase font-semibold text-[11px] tracking-wider">Lubricants Summary</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* 1. Total Litres / Volume */}
            <div className="bg-[#121927] border border-[#1e293b] px-2.5 py-1 rounded-lg flex items-center gap-1.5">
              <span className="text-slate-400 text-[10px] uppercase">Dispensed Vol:</span>
              <span className="text-slate-100 font-mono font-bold text-xs tabular-nums">
                {sumOfTotalVolume.toLocaleString('en-IN', { minimumFractionDigits: 2 })} L
              </span>
            </div>

            {/* 2. Total Sold Qty */}
            <div className="bg-[#121927] border border-[#1e293b] px-2.5 py-1 rounded-lg flex items-center gap-1.5">
              <span className="text-slate-400 text-[10px] uppercase">Sold Qty:</span>
              <span className="text-amber-400 font-mono font-bold text-xs tabular-nums">
                {sumOfSoldQty.toLocaleString()} Pcs
              </span>
            </div>

            {/* 3. Total Sell Amount (Rakam) */}
            <div className="bg-[#0f1726] border border-[#1e293b] px-3 py-1 rounded-lg flex items-center gap-2 text-emerald-400 font-bold">
              <span className="text-[10px] uppercase tracking-wider">Total Sale Rakam:</span>
              <span className="text-emerald-400 font-mono font-bold text-xs md:text-sm tabular-nums">
                ₹{grandTotalSellAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 1 GRID: SECTION C (CREDITERS) & SECTION D (OTHER INCOME) SIDE-BY-SIDE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {/* 3. SECTION C: CREDITERS */}
        <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg p-3.5 space-y-3 h-full flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-emerald-400" />
                <h3 className="text-[13px] font-semibold text-slate-100 tracking-wide">
                  Section C: Creditors (Jama Recovery)
                </h3>
              </div>
              <div>
                <button type="button"
                  onClick={handleAddJamaRow}
                  className="bg-[#192438] hover:bg-[#202f4a] text-blue-400 border border-blue-500/40 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm active:scale-95 transition-all flex items-center cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  <span>+ Add</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase text-slate-400 pb-1 px-1">
              <div className="col-span-4">CREDITOR / PARTY</div>
              <div className="col-span-4">PAYMENT MODE</div>
              <div className="col-span-3 text-right">AMOUNT (₹)</div>
              <div className="col-span-1 text-center">ACTION</div>
            </div>

            <div className="space-y-1.5">
              {jamaEntries.map((j, idx) => (
                <div key={j.id || j.syncId || `jama-${idx}`} className="p-2 rounded-lg bg-[#0e1420] border border-[#1b2537] grid grid-cols-12 gap-2 text-xs items-center">
                  <div className="col-span-4">
                    <select
                      value={j.customerId || (activePartiesList.find(c => c.name === j.customerName)?.id || activePartiesList[0]?.id || 1)}
                      onChange={(e) => {
                        const updated = [...jamaEntries];
                        const selectedVal = e.target.value;
                        const cust = activePartiesList.find(c => String(c.id) === String(selectedVal) || c.name === selectedVal);
                        updated[idx].customerId = cust ? cust.id : selectedVal;
                        updated[idx].customerName = cust ? cust.name : selectedVal;
                        setJamaEntries(updated);
                        if (syncCreditorPayment) syncCreditorPayment(updated);
                      }}
                      className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 text-slate-100 text-xs outline-none truncate cursor-pointer"
                    >
                      <option value="" disabled className="bg-[#121927]">Select Party Name...</option>
                      {activePartiesList.map(cust => (
                        <option key={cust.id || cust.name} value={cust.id || cust.name} className="bg-[#121927] text-slate-100">
                          {cust.name} {cust.village ? `(${cust.village})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <select
                      value={j.paymentMode}
                      onChange={(e) => {
                        const updated = [...jamaEntries];
                        updated[idx].paymentMode = e.target.value;
                        setJamaEntries(updated);
                        if (syncCreditorPayment) syncCreditorPayment(updated);
                      }}
                      className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 text-slate-100 text-xs outline-none cursor-pointer"
                    >
                      <option value="Cash" className="bg-[#121927]">Cash In Hand</option>
                      <option value="Cheque" className="bg-[#121927]">Cheque Deposit</option>
                      <option value="UPI" className="bg-[#121927]">UPI Transfer</option>
                    </select>
                  </div>
                  <div className="col-span-3">
                    <NumericInput
                      placeholder="₹ 0.00"
                      value={j.amount}
                      onChange={(val) => {
                        const updated = [...jamaEntries];
                        updated[idx].amount = parseFloat(val) || 0;
                        setJamaEntries(updated);
                        if (syncCreditorPayment) syncCreditorPayment(updated);
                      }}
                      className="w-full bg-[#172033] border border-[#23304a] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded px-2 py-1 font-mono text-xs font-semibold text-emerald-400 outline-none text-right tabular-nums"
                    />
                  </div>
                  <div className="col-span-1 text-center">
                    <button type="button"
                      onClick={(e) => handleDeleteJamaRow(idx, e)}
                      className="p-1 rounded bg-rose-950/40 border border-rose-800/40 text-rose-400 hover:bg-rose-900/60 transition-all cursor-pointer"
                      title="Remove Crediter Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section C Footer Summary */}
          <div className="bg-[#0e1420] border border-[#1b2537] p-2 rounded-lg mt-2.5 flex items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400 uppercase text-[10px] tracking-wider">Creditor Total:</span>
            </div>
            <div className="text-emerald-400 font-mono font-bold text-xs md:text-sm tabular-nums">
              ₹{totalJamaRecovered.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* 4. SECTION D: OTHER INCOME */}
        <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg p-3.5 space-y-3 h-full flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-teal-400" />
                <h3 className="text-[13px] font-semibold text-slate-100 tracking-wide">
                  Section D: Other Income
                </h3>
              </div>
              <div>
                <button type="button"
                  onClick={handleAddOtherIncomeRow}
                  className="bg-[#192438] hover:bg-[#202f4a] text-blue-400 border border-blue-500/40 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm active:scale-95 transition-all flex items-center cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  <span>+ Add</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase text-slate-400 pb-1 px-1">
              <div className="col-span-4">SOURCE / CATEGORY</div>
              <div className="col-span-4">DESCRIPTION / REMARKS</div>
              <div className="col-span-3 text-right">AMOUNT (₹)</div>
              <div className="col-span-1 text-center">ACTION</div>
            </div>

            <div className="space-y-1.5">
              {otherIncomeEntries.map((i, idx) => {
                const partyList = (Array.isArray(ushinaDirectoryList) && ushinaDirectoryList.length > 0) ? ushinaDirectoryList : ushinaDirectory;
                const activeParty = partyList.find(p => p.id === i.accountId || p.name === i.category || p.name === i.partyName) || partyList[0] || { id: 'ush-1', name: 'om' };
                const currentCategory = i.category || activeParty.name;

                return (
                  <div key={i.id || `inc-${idx}`} className="p-2 rounded-lg bg-[#0e1420] border border-[#1b2537] grid grid-cols-12 gap-2 text-xs items-center">
                    <div className="col-span-4">
                      <select
                        value={currentCategory}
                        onChange={(e) => {
                          const val = e.target.value;
                          const selectedAcc = partyList.find(p => p.name === val) || null;
                          const updated = [...otherIncomeEntries];
                          updated[idx] = {
                            ...updated[idx],
                            category: val,
                            partyName: val,
                            accountId: selectedAcc?.id || updated[idx]?.accountId || null
                          };
                          setOtherIncomeEntries(updated);
                        }}
                        className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 text-slate-100 text-xs outline-none cursor-pointer font-medium"
                      >
                        {partyList.map(party => (
                          <option key={party.id || party.name} value={party.name} className="bg-[#121927]">
                            {party.name}
                          </option>
                        ))}
                        {currentCategory && !partyList.some(p => p.name === currentCategory) && (
                          <option value={currentCategory} className="bg-[#121927]">{currentCategory}</option>
                        )}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <input
                        type="text"
                        placeholder="Remarks / Description"
                        value={i.description || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = [...otherIncomeEntries];
                          updated[idx] = {
                            ...updated[idx],
                            category: updated[idx]?.category || currentCategory,
                            partyName: updated[idx]?.partyName || currentCategory,
                            accountId: updated[idx]?.accountId || activeParty?.id || null,
                            description: val
                          };
                          setOtherIncomeEntries(updated);
                        }}
                        className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 text-slate-300 text-xs outline-none"
                      />
                    </div>
                    <div className="col-span-3">
                      <NumericInput
                        placeholder="₹ 0.00"
                        value={i.amount}
                        onChange={(val) => {
                          const numVal = parseFloat(val) || 0;
                          const updated = [...otherIncomeEntries];
                          updated[idx] = {
                            ...updated[idx],
                            category: updated[idx]?.category || currentCategory,
                            partyName: updated[idx]?.partyName || currentCategory,
                            accountId: updated[idx]?.accountId || activeParty?.id || null,
                            amount: numVal
                          };
                          setOtherIncomeEntries(updated);
                        }}
                        className="w-full bg-[#172033] border border-[#23304a] focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded px-2 py-1 font-mono text-xs font-semibold text-teal-400 outline-none text-right tabular-nums"
                      />
                    </div>
                    <div className="col-span-1 text-center">
                      <button type="button"
                        onClick={(e) => handleDeleteOtherIncomeRow(idx, e)}
                        className="p-1 rounded bg-rose-950/40 border border-rose-800/40 text-rose-400 hover:bg-rose-900/60 transition-all cursor-pointer"
                        title="Remove Income Entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section D Footer Summary */}
          <div className="bg-[#0e1420] border border-[#1b2537] p-2 rounded-lg mt-2.5 flex items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-slate-400 uppercase text-[10px] tracking-wider">Other Income Total:</span>
            </div>
            <div className="text-teal-400 font-mono font-bold text-xs md:text-sm tabular-nums">
              ₹{totalOtherIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* 5. SECTION E: DEBITERS */}
      <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg p-3.5 space-y-3" data-grid-container onKeyDown={handleSectionEKeyDown}>
        <div className="flex items-center justify-between gap-2.5 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" />
            <h3 className="text-[13px] font-semibold text-slate-100 tracking-wide">
              Section E: Customer Debit Slips (Udhar Khata)
            </h3>
          </div>
          <div>
            <button type="button"
              onClick={handleAddDebitRow}
              className="bg-[#192438] hover:bg-[#202f4a] text-blue-400 border border-blue-500/40 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm active:scale-95 transition-all flex items-center cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>+ Add Slip</span>
            </button>
          </div>
        </div>

        {/* Header Labels */}
        <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
          <div className="col-span-3 text-left pl-2">Customer Name</div>
          <div className="col-span-1 text-left">Vehicle No</div>
          <div className="col-span-1 text-left">Bill No</div>
          <div className="col-span-2 text-left text-blue-400">Bill Type</div>
          <div className="col-span-2 text-left text-slate-300">Fuel / Product</div>
          <div className="col-span-1 text-right text-blue-400">Litres</div>
          <div className="col-span-1 text-right text-amber-400">Amount (₹)</div>
          <div className="col-span-1 text-center">Action</div>
        </div>

        <div className="space-y-1.5">
          {debitEntries.map((d, idx) => (
            <div key={d.id || d.syncId || `debit-${idx}`} className="grid-row p-2 rounded-lg bg-[#0e1420] border border-[#1b2537] grid grid-cols-12 gap-2 text-xs items-center">
              {/* 1. Customer Name */}
              <div className="grid-cell col-span-3">
                <select
                  value={d.customerId || (activePartiesList.find(c => c.name === d.customerName)?.id || activePartiesList[0]?.id || 1)}
                  onChange={(e) => updateDebitEntry(idx, 'customer', e.target.value)}
                  className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 text-slate-100 text-xs outline-none truncate cursor-pointer"
                >
                  <option value="" disabled className="bg-[#121927]">Select Customer...</option>
                  {activePartiesList.map(cust => (
                    <option key={cust.id || cust.name} value={cust.id || cust.name} className="bg-[#121927] text-slate-100">
                      {cust.name} {cust.village ? `(${cust.village})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Vehicle No */}
              <div className="grid-cell col-span-1">
                <input
                  type="text"
                  placeholder="GJ-01"
                  value={d.vehicleNo || ''}
                  onChange={(e) => updateDebitEntry(idx, 'vehicleNo', e.target.value)}
                  className="w-full bg-[#172033] border border-[#23304a] text-slate-100 font-mono text-xs px-1.5 py-1 rounded uppercase outline-none"
                />
              </div>

              {/* 3. Bill No / Slip No */}
              <div className="grid-cell col-span-1">
                <input
                  type="text"
                  placeholder="Slip"
                  value={d.slipNo || d.billNo || ''}
                  onChange={(e) => updateDebitEntry(idx, 'slipNo', e.target.value)}
                  className="w-full bg-[#172033] border border-[#23304a] text-slate-100 font-mono text-xs px-1.5 py-1 rounded outline-none"
                />
              </div>

              {/* 4. Bill Type Selector */}
              <div className="grid-cell col-span-2">
                <select
                  value={d.billType || 'Debit Bill'}
                  onChange={(e) => updateDebitEntry(idx, 'billType', e.target.value)}
                  className="w-full bg-[#172033] border border-[#23304a] text-slate-100 text-xs px-2 py-1 rounded outline-none cursor-pointer"
                >
                  <option value="Debit Bill" className="bg-[#121927]">Debit Bill</option>
                  <option value="Local Bill" className="bg-[#121927]">Local Bill</option>
                </select>
              </div>

              {/* 5. Fuel / Product Selector */}
              <div className="grid-cell col-span-2">
                <select
                  value={normalizeFuelProduct(d.fuelProduct || d.fuelType)}
                  onChange={(e) => updateDebitEntry(idx, 'fuelProduct', e.target.value)}
                  className="w-full bg-[#172033] border border-[#23304a] text-slate-100 text-xs px-2 py-1 rounded outline-none cursor-pointer"
                >
                  <option value="MS Petrol" className="bg-[#121927]">MS (₹{(Number(rates['Motor Spirit (Petrol)'] ?? 0) || 0).toFixed(2)})</option>
                  <option value="HSD Diesel" className="bg-[#121927]">HSD (₹{(Number(rates['High Speed Diesel'] ?? 0) || 0).toFixed(2)})</option>
                  <option value="Speed Petrol" className="bg-[#121927]">XP Speed (₹{(Number(rates['Speed Petrol'] ?? rates['XP Premium Petrol'] ?? 0) || 0).toFixed(2)})</option>
                  <option value="CNG" className="bg-[#121927]">CNG (₹{(Number(rates['CNG'] ?? 0) || 0).toFixed(2)})</option>
                </select>
              </div>

              {/* 6. Litres */}
              <div className="grid-cell col-span-1">
                <NumericInput
                  placeholder="0.00"
                  value={d.litres}
                  onChange={(val) => updateDebitEntry(idx, 'litres', val)}
                  className="w-full bg-[#172033] border border-[#23304a] focus:border-blue-500 rounded px-1.5 py-1 font-mono text-xs text-blue-400 outline-none text-right tabular-nums"
                />
              </div>

              {/* 7. Debit Amount (₹) */}
              <div className="grid-cell col-span-1">
                <NumericInput
                  placeholder="₹ 0.00"
                  value={d.amount}
                  onChange={(val) => updateDebitEntry(idx, 'amount', val)}
                  className="w-full bg-[#172033] border border-[#23304a] focus:border-amber-500 rounded px-1.5 py-1 font-mono text-xs font-semibold text-amber-400 outline-none text-right tabular-nums"
                />
              </div>

              {/* 8. Action */}
              <div className="grid-cell col-span-1 text-center">
                <button type="button"
                  onClick={(e) => handleDeleteDebitRow(idx, e)}
                  className="p-1 rounded bg-rose-950/40 border border-rose-800/40 text-rose-400 hover:bg-rose-900/60 transition-all cursor-pointer"
                  title="Remove Credit Entry"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Section E Real-time Dynamic Breakdown Summary Bar */}
        <div className="bg-slate-100/90 border border-slate-300 p-3 rounded-xl space-y-2.5 shadow-xs dark:bg-[#0e1420] dark:border-[#1b2537]">
          {/* Row 1: Product-wise Debit Litres */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-300/80 pb-2.5 dark:border-[#1b2537]">
            <div className="flex items-center gap-1.5 text-xs">
              <Fuel className="w-4 h-4 text-slate-800 dark:text-blue-400" />
              <span className="text-slate-900 font-sans font-bold uppercase text-[11px] tracking-wider dark:text-slate-300">
                Debit Fuel Volume:
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono">
              <span className="bg-amber-100 text-amber-950 border border-amber-400 font-bold px-3 py-1 rounded-lg text-xs font-mono shadow-xs dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700">
                Petrol Debit: {sectionETotals.msDebitLitres.toFixed(2)} L
              </span>
              <span className="bg-blue-100 text-blue-950 border border-blue-400 font-bold px-3 py-1 rounded-lg text-xs font-mono shadow-xs dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700">
                Diesel Debit: {sectionETotals.hsdDebitLitres.toFixed(2)} L
              </span>
              <span className="bg-purple-100 text-purple-950 border border-purple-400 font-bold px-3 py-1 rounded-lg text-xs font-mono shadow-xs dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-700">
                Speed Debit: {sectionETotals.speedDebitLitres.toFixed(2)} L
              </span>
              <span className="bg-emerald-100 text-emerald-950 border border-emerald-400 font-bold px-3 py-1 rounded-lg text-xs font-mono shadow-xs dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700">
                CNG Debit: {sectionETotals.cngDebitLitres.toFixed(2)} L
              </span>
            </div>
          </div>

          {/* Row 2: Category Totals & Grand Section E */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs font-mono">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="bg-blue-50 text-blue-900 border border-blue-300 font-bold px-3.5 py-1.5 rounded-xl text-xs font-mono shadow-xs dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800 flex items-center">
                <span>Total Debit Bills:</span>
                <span className="text-blue-700 font-extrabold text-sm ml-1.5 dark:text-blue-400">
                  ₹{sectionETotals.totalDebitBillAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-emerald-50 text-emerald-900 border border-emerald-300 font-bold px-3.5 py-1.5 rounded-xl text-xs font-mono shadow-xs dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800 flex items-center">
                <span>Total Local Bills:</span>
                <span className="text-emerald-700 font-extrabold text-sm ml-1.5 dark:text-emerald-400">
                  ₹{sectionETotals.totalLocalBillAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-rose-50/80 border border-rose-300 px-3.5 py-1.5 rounded-xl shadow-xs dark:bg-rose-950/40 dark:border-rose-900/50">
              <Users className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span className="text-slate-900 font-bold uppercase tracking-wider text-xs dark:text-slate-300">
                Grand Section E:
              </span>
              <span className="text-rose-700 font-black text-base font-mono tabular-nums ml-1.5 dark:text-rose-400">
                ₹{sectionETotals.grandTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. SECTION F: DIGITAL PAYMENT */}
      <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg p-3.5 space-y-3">
        {/* Card Main Header Title */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="text-[13px] font-semibold text-slate-100 tracking-wide">
            Section F: Digital Payment & Petro Card Settlement
          </h3>
        </div>

        {/* Side-by-Side 2-Column Split Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* PART 1: LEFT SUB-CARD ➔ 1. DIGITAL PAY */}
          <div className="bg-[#0e1420] border border-[#1b2537] rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-1.5">
              <div className="flex items-center gap-2">
                <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                <h4 className="text-[12px] font-medium text-slate-300 uppercase tracking-wide">
                  1. Digital Pay (UPI / POS)
                </h4>
              </div>
              <button type="button"
                onClick={handleAddDigitalPayRow}
                className="bg-[#192438] hover:bg-[#202f4a] text-blue-400 border border-blue-500/40 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm active:scale-95 transition-all flex items-center cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span>+ Add</span>
              </button>
            </div>

            {/* Column Headers */}
            <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase text-slate-400 px-1">
              <div className="col-span-6">SOURCE / METHOD</div>
              <div className="col-span-5 text-right">AMOUNT (₹)</div>
              <div className="col-span-1 text-center">ACTION</div>
            </div>

            {/* Dynamic Rows */}
            <div className="space-y-1.5">
              {digitalPayEntries.map((item, idx) => (
                <div key={item.id || `dp-${idx}`} className="p-2 rounded-lg bg-[#121927] border border-[#1e293b] grid grid-cols-12 gap-2 text-xs items-center">
                  <div className="col-span-6">
                    <select
                      value={item.method || 'UPI'}
                      onChange={(e) => {
                        const updated = [...digitalPayEntries];
                        updated[idx].method = e.target.value;
                        setDigitalPayEntries(updated);
                      }}
                      className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 text-slate-100 text-xs outline-none cursor-pointer"
                    >
                      <option value="UPI" className="bg-[#121927]">UPI (PhonePe, GPay, QR)</option>
                      <option value="CARD" className="bg-[#121927]">CARD (Debit / Credit POS)</option>
                    </select>
                  </div>
                  <div className="col-span-5">
                    <NumericInput
                      placeholder="₹ 0.00"
                      value={item.amount}
                      onChange={(val) => {
                        const updated = [...digitalPayEntries];
                        updated[idx].amount = parseFloat(val) || 0;
                        setDigitalPayEntries(updated);
                      }}
                      className="w-full bg-[#172033] border border-[#23304a] focus:border-rose-500 rounded px-2 py-1 font-mono text-xs font-semibold text-rose-400 outline-none text-right tabular-nums"
                    />
                  </div>
                  <div className="col-span-1 text-center">
                    <button type="button"
                      onClick={(e) => handleDeleteDigitalPayRow(idx, e)}
                      className="p-1 rounded bg-rose-950/40 border border-rose-800/40 text-rose-400 hover:bg-rose-900/60 transition-all cursor-pointer"
                      title="Remove Digital Pay Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Sub-card Footer */}
            <div className="bg-[#121927] border border-[#1e293b] px-3 py-1.5 rounded-lg flex items-center justify-between text-xs font-mono mt-1">
              <span className="text-slate-400 uppercase text-[10px] tracking-wider">Total Digital Pay:</span>
              <span className="text-rose-400 font-mono font-bold text-xs tabular-nums">
                ₹{totalDigitalPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* PART 2: RIGHT SUB-CARD ➔ 2. SMART MONEY */}
          <div className="bg-[#0e1420] border border-[#1b2537] rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-1.5">
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-purple-400" />
                <h4 className="text-[12px] font-medium text-slate-300 uppercase tracking-wide">
                  2. Smart Money (Fleet Card)
                </h4>
              </div>
              <button type="button"
                onClick={handleAddSmartMoneyRow}
                className="bg-[#192438] hover:bg-[#202f4a] text-blue-400 border border-blue-500/40 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm active:scale-95 transition-all flex items-center cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span>+ Add</span>
              </button>
            </div>

            {/* Column Headers */}
            <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase text-slate-400 px-1">
              <div className="col-span-6">SOURCE / PROGRAM</div>
              <div className="col-span-5 text-right">AMOUNT (₹)</div>
              <div className="col-span-1 text-center">ACTION</div>
            </div>

            {/* Dynamic Rows */}
            <div className="space-y-1.5">
              {smartMoneyEntries.map((item, idx) => (
                <div key={item.id || `sm-${idx}`} className="p-2 rounded-lg bg-[#121927] border border-[#1e293b] grid grid-cols-12 gap-2 text-xs items-center">
                  <div className="col-span-6">
                    <select
                      value={item.program || 'PETRO CARD / FLEET CARD'}
                      onChange={(e) => {
                        const updated = [...smartMoneyEntries];
                        updated[idx].program = e.target.value;
                        setSmartMoneyEntries(updated);
                      }}
                      className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 text-slate-100 text-xs outline-none cursor-pointer"
                    >
                      <option value="PETRO CARD / FLEET CARD" className="bg-[#121927]">PETRO CARD / FLEET CARD</option>
                    </select>
                  </div>
                  <div className="col-span-5">
                    <NumericInput
                      placeholder="₹ 0.00"
                      value={item.amount}
                      onChange={(val) => {
                        const updated = [...smartMoneyEntries];
                        updated[idx].amount = parseFloat(val) || 0;
                        setSmartMoneyEntries(updated);
                      }}
                      className="w-full bg-[#172033] border border-[#23304a] focus:border-rose-500 rounded px-2 py-1 font-mono text-xs font-semibold text-rose-400 outline-none text-right tabular-nums"
                    />
                  </div>
                  <div className="col-span-1 text-center">
                    <button type="button"
                      onClick={(e) => handleDeleteSmartMoneyRow(idx, e)}
                      className="p-1 rounded bg-rose-950/40 border border-rose-800/40 text-rose-400 hover:bg-rose-900/60 transition-all cursor-pointer"
                      title="Remove Smart Money Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Sub-card Footer */}
            <div className="bg-[#121927] border border-[#1e293b] px-3 py-1.5 rounded-lg flex items-center justify-between text-xs font-mono mt-1">
              <span className="text-slate-400 uppercase text-[10px] tracking-wider">Total Smart Money:</span>
              <span className="text-rose-400 font-mono font-bold text-xs tabular-nums">
                ₹{totalSmartMoney.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Section F Grand Summary Footer */}
        <div className="bg-[#0e1420] border border-[#1b2537] p-2.5 rounded-lg flex items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-slate-400 uppercase text-[10px] tracking-wider">
              Total Digital Payment Settlement:
            </span>
          </div>
          <div className="text-rose-400 font-mono font-bold text-xs md:text-sm tabular-nums">
            ₹{totalSmartBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* ROW 2 GRID: SECTION G (EXPENSES TRACKER) & SECTION H (BANK HISAB) SIDE-BY-SIDE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {/* 7. SECTION G: EXPENSES TRACKER */}
        <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg p-3.5 space-y-3 h-full flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-rose-400" />
                <h3 className="text-[13px] font-semibold text-slate-100 tracking-wide">
                  Section G: Daily Expenses (Kharch)
                </h3>
              </div>
              <div>
                <button type="button"
                  onClick={handleAddExpenseRow}
                  className="bg-[#192438] hover:bg-[#202f4a] text-blue-400 border border-blue-500/40 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm active:scale-95 transition-all flex items-center cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  <span>+ Add</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase text-slate-400 pb-1 px-1">
              <div className="col-span-4">EXPENSES CATEGORY</div>
              <div className="col-span-4">DESCRIPTION / REMARKS</div>
              <div className="col-span-3 text-right">AMOUNT (₹)</div>
              <div className="col-span-1 text-center">ACTION</div>
            </div>

            <div className="space-y-1.5">
              {expenseEntries.map((e, idx) => {
                const partyList = (Array.isArray(ushinaDirectoryList) && ushinaDirectoryList.length > 0) ? ushinaDirectoryList : ushinaDirectory;
                const isUshina = e.category === 'Ushina Khata';
                const isOtherExp = e.category === 'Other Expenses' || e.category === 'Other Expense';
                const currentDesc = e.description || (isUshina ? (partyList[0]?.name || '') : (isOtherExp ? '' : (pumpExpenseCategories[0]?.name || '')));

                return (
                  <div key={e.id || `exp-${idx}`} className="p-2 rounded-lg bg-[#0e1420] border border-[#1b2537] grid grid-cols-12 gap-2 text-xs items-center">
                    {/* Column 1: EXPENSES CATEGORY (3 Options: Daily Pump Expenses, Ushina Khata, Other Expenses) */}
                    <div className="col-span-4">
                      <select
                        value={isOtherExp ? 'Other Expenses' : (isUshina ? 'Ushina Khata' : 'Daily Pump Expenses')}
                        onChange={(val) => {
                          const newCat = val.target.value;
                          const updated = [...expenseEntries];
                          const defaultDesc = newCat === 'Ushina Khata'
                            ? (partyList[0]?.name || '')
                            : (newCat === 'Other Expenses' ? '' : (pumpExpenseCategories[0]?.name || ''));
                          updated[idx] = {
                            ...updated[idx],
                            category: newCat,
                            description: defaultDesc
                          };
                          setExpenseEntries(updated);
                        }}
                        className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 text-slate-100 text-xs outline-none cursor-pointer font-medium"
                      >
                        <option value="Daily Pump Expenses" className="bg-[#121927]">Daily Pump Expenses</option>
                        <option value="Ushina Khata" className="bg-[#121927]">Ushina Khata</option>
                        <option value="Other Expenses" className="bg-[#121927]">Other Expenses</option>
                      </select>
                    </div>

                    {/* Column 2: DESCRIPTION / REMARKS (Dynamic Secondary Dropdown / Text Input) */}
                    <div className="col-span-4">
                      {isOtherExp ? (
                        <input
                          type="text"
                          placeholder="Enter expense description / remarks..."
                          value={e.description || ''}
                          onChange={(val) => {
                            const updated = [...expenseEntries];
                            updated[idx] = {
                              ...updated[idx],
                              description: val.target.value
                            };
                            setExpenseEntries(updated);
                          }}
                          className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 text-slate-100 text-xs outline-none focus:border-purple-500"
                        />
                      ) : (
                        <select
                          value={currentDesc}
                          onChange={(val) => {
                            const updated = [...expenseEntries];
                            updated[idx] = {
                              ...updated[idx],
                              description: val.target.value
                            };
                            setExpenseEntries(updated);
                          }}
                          className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 text-slate-100 text-xs outline-none cursor-pointer font-medium"
                        >
                          {isUshina ? (
                            <>
                              {partyList.map(party => (
                                <option key={party.id || party.name} value={party.name} className="bg-[#121927]">
                                  {party.name}
                                </option>
                              ))}
                              {currentDesc && !partyList.some(p => p.name === currentDesc) && (
                                <option value={currentDesc} className="bg-[#121927]">{currentDesc}</option>
                              )}
                            </>
                          ) : (
                            <>
                              {pumpExpenseCategories.map(cat => (
                                <option key={cat.id || cat.name} value={cat.name} className="bg-[#121927]">
                                  {cat.name}
                                </option>
                              ))}
                              {currentDesc && !pumpExpenseCategories.some(c => c.name === currentDesc) && (
                                <option value={currentDesc} className="bg-[#121927]">{currentDesc}</option>
                              )}
                            </>
                          )}
                        </select>
                      )}
                    </div>

                    {/* Column 3: AMOUNT (₹) */}
                    <div className="col-span-3">
                      <NumericInput
                        placeholder="₹ 0.00"
                        value={e.amount}
                        onChange={(val) => {
                          const updated = [...expenseEntries];
                          updated[idx] = {
                            ...updated[idx],
                            amount: parseFloat(val) || 0
                          };
                          setExpenseEntries(updated);
                        }}
                        className="w-full bg-[#172033] border border-[#23304a] focus:border-rose-500 rounded px-2 py-1 font-mono text-xs font-semibold text-rose-400 outline-none text-right tabular-nums"
                      />
                    </div>

                    {/* Column 4: ACTION */}
                    <div className="col-span-1 text-center">
                      <button type="button"
                        onClick={(e) => handleDeleteExpenseRow(idx, e)}
                        className="p-1 rounded bg-rose-950/40 border border-rose-800/40 text-rose-400 hover:bg-rose-900/60 transition-all cursor-pointer"
                        title="Remove Expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section G Footer Summary */}
          <div className="bg-[#0e1420] border border-[#1b2537] p-2 rounded-lg mt-2.5 flex items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-slate-400 uppercase text-[10px] tracking-wider">Total Expenses:</span>
            </div>
            <div className="text-rose-400 font-mono font-bold text-xs md:text-sm tabular-nums">
              ₹{totalExpensesKharch.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* 8. SECTION H: BANK HISAB */}
        <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg p-3.5 space-y-3 h-full flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-[13px] font-semibold text-slate-100 tracking-wide">
                  Section H: Bank Deposit Register
                </h3>
              </div>
              <div>
                <button type="button"
                  onClick={handleAddBankRow}
                  className="bg-[#192438] hover:bg-[#202f4a] text-blue-400 border border-blue-500/40 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm active:scale-95 transition-all flex items-center cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  <span>+ Add</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase text-slate-400 pb-1 px-1">
              <div className="col-span-4">BANK ACCOUNT</div>
              <div className="col-span-4">DEPOSIT SLIP / REF NO</div>
              <div className="col-span-3 text-right">AMOUNT (₹)</div>
              <div className="col-span-1 text-center">ACTION</div>
            </div>

            <div className="space-y-1.5">
              {bankEntries.map((b, idx) => (
                <div key={b.id || `bank-${idx}`} className="p-2 rounded-lg bg-[#0e1420] border border-[#1b2537] grid grid-cols-12 gap-2 text-xs items-center">
                  <div className="col-span-4">
                    <select
                      value={b.bankName || (activeBankList.find(acc => acc.id === b.bankAccountId)?.name) || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const selectedBank = (activeBankList || []).find(
                          acc => acc.name === val || acc.id === val
                        );
                        const updated = [...bankEntries];
                        if (selectedBank) {
                          updated[idx].bankAccountId = selectedBank.id;
                          updated[idx].bankName = selectedBank.name;
                          updated[idx].accountNumber = selectedBank.accountNumber;
                        } else {
                          updated[idx].bankName = val;
                        }
                        setBankEntries(updated);
                      }}
                      className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 text-slate-100 text-xs outline-none cursor-pointer"
                    >
                      <option value="" disabled className="bg-[#121927]">Select Bank Account...</option>
                      {(activeBankList || []).map((bank) => (
                        <option key={bank.id || bank.name} value={bank.name} className="bg-[#121927]">
                          {bank.name}
                        </option>
                      ))}
                      {b.bankName && !(activeBankList || []).some(acc => acc.name === b.bankName || acc.id === b.bankAccountId) && (
                        <option value={b.bankName} className="bg-[#121927]">{b.bankName}</option>
                      )}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <input
                      type="text"
                      placeholder="Slip / Ref No"
                      value={b.slipNo}
                      onChange={(e) => {
                        const updated = [...bankEntries];
                        updated[idx].slipNo = e.target.value;
                        setBankEntries(updated);
                      }}
                      className="w-full bg-[#172033] border border-[#23304a] text-slate-300 font-mono text-xs px-2 py-1 rounded outline-none"
                    />
                  </div>
                  <div className="col-span-3">
                    <NumericInput
                      placeholder="₹ 0.00"
                      value={b.amount}
                      onChange={(val) => {
                        const updated = [...bankEntries];
                        updated[idx].amount = parseFloat(val) || 0;
                        setBankEntries(updated);
                      }}
                      className="w-full bg-[#172033] border border-[#23304a] focus:border-blue-500 rounded px-2 py-1 font-mono text-xs font-semibold text-blue-400 outline-none text-right tabular-nums"
                    />
                  </div>
                  <div className="col-span-1 text-center">
                    <button type="button"
                      onClick={(e) => handleDeleteBankRow(idx, e)}
                      className="p-1 rounded bg-rose-950/40 border border-rose-800/40 text-rose-400 hover:bg-rose-900/60 transition-all cursor-pointer"
                      title="Remove Bank Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section H Footer Summary */}
          <div className="bg-[#0e1420] border border-[#1b2537] p-2 rounded-lg mt-2.5 flex items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-400 uppercase text-[10px] tracking-wider">Total Bank Deposits:</span>
            </div>
            <div className="text-blue-400 font-mono font-bold text-xs md:text-sm tabular-nums">
              ₹{totalBankDeposits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* 9. FINAL SHREE SILAK (DAILY BALANCE SHEET) WIDGET */}
      <div className="bg-[#121927] border border-[#1e293b] rounded-xl shadow-lg p-3.5 space-y-3">
        {/* Widget Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="text-[13px] font-semibold text-slate-100 tracking-wide">
                Final Shree Silak (Daily Balance Sheet & Cashier Settlement)
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-[#0e1420] border border-[#1b2537] rounded-lg px-2.5 py-1 text-xs font-mono">
              <span className="text-slate-400 text-[11px]">Tally Status:</span>
              {actualPhysicalCash > 0 ? (
                Math.abs(cashVariance) < 0.01 ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50 inline-block"></span>
                    Safe / Zero Variance
                  </span>
                ) : cashVariance < 0 ? (
                  <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50 inline-block"></span>
                    Shortage: -₹{Math.abs(cashVariance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50 inline-block"></span>
                    Excess: +₹{cashVariance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                )
              ) : (
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-600 inline-block"></span>
                  Kupan Open
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 2-Column Side-by-Side Financial Flow (AAVAJ INFLOW vs UDHAR OUTFLOW) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* LEFT BOX: TOTAL INFLOW / GROSS CASH IN (🟢 AAVAJ / JAMME) */}
          <div className="bg-[#0e1420] border border-[#1b2537] rounded-lg p-2.5 space-y-2 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <ArrowDownRight className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-[12px] font-medium text-emerald-400 uppercase tracking-wide">
                    🟢 Gross Cash In (Aavaj / Jamme)
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                  Total Inflow
                </span>
              </div>

              <div className="space-y-1.5 text-xs font-normal">
                {/* 1. Opening Shree Silak */}
                <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-300">1. Opening Shree Silak</span>
                    <span className="text-[10px] text-slate-500 font-mono">(Prev Cash)</span>
                  </div>
                  <div className="w-28">
                    <NumericInput
                      placeholder="0.00"
                      value={openingShreeSilak}
                      onChange={(val) => setOpeningShreeSilak(parseFloat(val) || 0)}
                      className="w-full text-right bg-[#172033] border border-[#23304a] focus:border-emerald-500 rounded px-2 py-1 font-mono text-xs font-semibold text-emerald-400 outline-none tabular-nums"
                    />
                  </div>
                </div>

                {/* 2. Section A Fuel Sales */}
                <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between">
                  <span className="text-slate-300">2. Fuel Sales Revenue (Section A)</span>
                  <span className="font-mono font-semibold text-slate-100 text-xs tabular-nums">
                    +₹{totalFuelSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* 3. Section B Lubricants Sales */}
                <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between">
                  <span className="text-slate-300">3. Lubricants Sales (Section B)</span>
                  <span className="font-mono font-semibold text-slate-100 text-xs tabular-nums">
                    +₹{totalOilCngAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* 4. Section C Crediters / Jama Recovery */}
                <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between">
                  <span className="text-slate-300">4. Creditors Recd (Section C)</span>
                  <span className="font-mono font-semibold text-emerald-400 text-xs tabular-nums">
                    +₹{totalJamaRecovered.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* 5. Section D Other Income */}
                <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between">
                  <span className="text-slate-300">5. Other Station Income (Section D)</span>
                  <span className="font-mono font-semibold text-teal-400 text-xs tabular-nums">
                    +₹{totalOtherIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Inflow Footer Box */}
            <div className="bg-[#0f1726] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between font-mono mt-1">
              <span className="text-slate-400 text-[11px] uppercase tracking-wider">
                Total Gross Inflow:
              </span>
              <span className="text-emerald-400 font-bold text-xs md:text-sm tabular-nums">
                ₹{totalInflowGrossCashIn.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* RIGHT BOX: TOTAL OUTFLOW / DEDUCTIONS (🔴 UDHAR / NIKAS) */}
          <div className="bg-[#0e1420] border border-[#1b2537] rounded-lg p-2.5 space-y-2 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4 text-rose-400" />
                  <h4 className="text-[12px] font-medium text-rose-400 uppercase tracking-wide">
                    🔴 Deductions (Udhar / Nikas)
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-800/40">
                  Total Deductions
                </span>
              </div>

              <div className="space-y-1.5 text-xs font-normal">
                {/* 1. Section E Debiters / Credit Slips */}
                <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between">
                  <span className="text-slate-300">1. Debiters / Credit Slips (Section E)</span>
                  <span className="font-mono font-semibold text-rose-400 text-xs tabular-nums">
                    -₹{totalCustomerDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* 2. Section F Digital Payments */}
                <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between">
                  <span className="text-slate-300">2. Digital / Smart Money (Section F)</span>
                  <span className="font-mono font-semibold text-amber-400 text-xs tabular-nums">
                    -₹{totalSmartBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* 3. Section G Expenses Tracker */}
                <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between">
                  <span className="text-slate-300">3. Expenses Kharch (Section G)</span>
                  <span className="font-mono font-semibold text-rose-400 text-xs tabular-nums">
                    -₹{totalExpensesKharch.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* 4. Section H Bank Deposits */}
                <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between">
                  <span className="text-slate-300">4. Bank Deposit (Section H)</span>
                  <span className="font-mono font-semibold text-blue-400 text-xs tabular-nums">
                    -₹{totalBankDeposits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Filler Card to keep 5 rows symmetric */}
                <div className="bg-[#121927] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between text-slate-500 font-mono text-[11px]">
                  <span>Non-Cash / Bank Settlements</span>
                  <span>Verified</span>
                </div>
              </div>
            </div>

            {/* Total Outflow Footer Box */}
            <div className="bg-[#0f1726] border border-[#1e293b] p-2 rounded-lg flex items-center justify-between font-mono mt-1">
              <span className="text-slate-400 text-[11px] uppercase tracking-wider">
                Total Deductions:
              </span>
              <span className="text-rose-400 font-bold text-xs md:text-sm tabular-nums">
                -₹{totalOutflowDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* COMPACT SINGLE-ROW SLEEK CLOSING SHREE SILAK CARD */}
        <div className="p-3 rounded-lg bg-[#0e1420] border border-[#1b2537] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm">🏁</span>
              <h4 className="text-[13px] font-semibold text-slate-100 uppercase tracking-wide">
                Closing Shree Silak (Drawer Cash)
              </h4>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Math: Gross Inflow - Total Deductions
            </p>
          </div>

          <div className="bg-[#0f1726] border border-[#1e293b] px-3.5 py-1.5 rounded-lg flex items-center gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">
              Drawer Cash:
            </span>
            <span className="text-emerald-400 font-bold font-mono text-[13px] flex items-center gap-1.5 tabular-nums">
              <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
              ₹{closingShreeSilak.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* BOTTOM ACTION BUTTONS BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={handleClearAllNozzles}
            disabled={isShiftArchived}
            className={
              isShiftArchived
                ? "flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-500 font-semibold text-sm cursor-not-allowed shadow-none"
                : "flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300 font-semibold text-sm transition-colors shadow-sm cursor-pointer active:scale-95"
            }
          >
            <RotateCcw className={`w-4 h-4 ${isShiftArchived ? 'text-slate-500' : 'text-red-600'}`} />
            <span>Reset Nozzle Readings (Clear All)</span>
          </button>

          {!isShiftArchived ? (
            <button
              type="button"
              onClick={handleSaveToNextShift}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm tracking-wide shadow-md transition-all cursor-pointer active:scale-95"
            >
              <span>Save To Next Shift</span>
              <ArrowRightCircle className="w-4 h-4 text-white" />
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800 text-slate-100 font-semibold text-sm shadow-inner cursor-not-allowed border border-slate-700 select-none">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>✓ Shift Closed & Archived</span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  if (e && e.preventDefault) e.preventDefault();
                  if (e && e.stopPropagation) e.stopPropagation();
                  try {
                    if (window.confirm('Unlock and re-open this shift for editing? Any modifications will update this shift upon saving.')) {
                      setIsLocked(false);
                      setIsArchivedView(false);
                      showToast('Shift unlocked for editing.', 'info');
                    }
                  } catch (err) {
                    console.error('Error unlocking shift:', err);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-500 font-semibold text-sm transition-all shadow-sm cursor-pointer active:scale-95"
                title="Unlock this shift to make corrections or edits"
              >
                <Unlock className="w-4 h-4 text-amber-400" />
                <span>Re-open Shift / Edit</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  if (e && e.preventDefault) e.preventDefault();
                  if (e && e.stopPropagation) e.stopPropagation();
                  try {
                    const snapshotToPrint = shiftPdfSnapshot || {
                      stationName: stationProfile?.fuelStationName || 'SHITAL PETROL PUMP',
                      gstin: stationProfile?.gstin || '24AAAAA0000A1Z5',
                      address: stationProfile?.address || 'State Highway, Kheralu',
                      date: selectedDate,
                      shiftType: activeShift,
                      timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
                      rates: { ...rates },
                      dips: { ...dips },
                      nozzles: nozzles.map((n, idx) => ({
                        ...n,
                        mpdId: n.mpdId || getMpdIdForNozzle(n, idx),
                        productName: getNormalizedProductName(n.productName)
                      })),
                      nozzleTotals: { ...nozzleTotals },
                      totalCngKgCombined,
                      totalCngAmtCombined,
                      totalFuelSalesAmount,
                      lubricants: lubricants.map(l => ({ ...l, rowTotal: calculateLubricantRowTotal(l) })),
                      totalOilCngAmount,
                      jamaEntries: jamaEntries.map(j => ({ ...j })),
                      totalJamaRecovered,
                      otherIncomeEntries: otherIncomeEntries.map(i => ({ ...i })),
                      totalOtherIncome,
                      openingShreeSilak: parseFloat(openingShreeSilak) || 0,
                      totalInflowGrossCashIn,
                      debitEntries: debitEntries.map(d => ({ ...d })),
                      totalCustomerDebits,
                      sectionETotals: { ...sectionETotals },
                      digitalPayEntries: digitalPayEntries.map(d => ({ ...d })),
                      smartMoneyEntries: smartMoneyEntries.map(s => ({ ...s })),
                      totalDigitalPay,
                      totalSmartMoney,
                      totalSmartBalance,
                      expenseEntries: expenseEntries.map(e => ({ ...e })),
                      totalExpensesKharch,
                      bankEntries: bankEntries.map(b => ({ ...b })),
                      totalBankDeposits,
                      totalOutflowDeductions,
                      closingShreeSilak
                    };
                    generateShiftSummaryPdf(snapshotToPrint);
                  } catch (err) {
                    console.error('Handled PDF error:', err);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 hover:border-indigo-500 font-semibold text-sm transition-all shadow-sm cursor-pointer active:scale-95"
                title="Download Shift Summary PDF Report"
              >
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>📄 Download Shift PDF</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MULTI-TABBED CASH CALCULATOR MODAL */}
      <CashDenominationModal
        isOpen={isCashCalcOpen}
        onClose={() => setIsCashCalcOpen(false)}
        onApply={(aggregatedNotes, grandTotal) => {
          setDenominations(aggregatedNotes);
          showToast(`Applied Grand Total ₹ ${grandTotal.toLocaleString('en-IN')} to Shift Cash Settlement!`, 'success');
        }}
        showToast={showToast}
      />

      {/* 📄 AUTO-PROMPTED SHIFT SUMMARY PDF CONFIRMATION BANNER / MODAL */}
      {showShiftPdfModal && shiftPdfSnapshot && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-3xl bg-slate-900/95 backdrop-blur-md border-2 border-indigo-500/80 rounded-2xl shadow-2xl p-4 text-slate-100 animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-950/90 border border-indigo-500/50 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
                <FileText className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-white">
                    Shift Saved & Rolled Over Successfully!
                  </h4>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-mono font-semibold">
                    ✓ Ready
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Shift: <strong className="text-indigo-300">{shiftPdfSnapshot.date}</strong> ({shiftPdfSnapshot.shiftType}) • Final Drawer Cash: <strong className="text-emerald-400 font-mono">₹{shiftPdfSnapshot.closingShreeSilak?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={(e) => {
                  if (e && e.preventDefault) e.preventDefault();
                  if (e && e.stopPropagation) e.stopPropagation();
                  try {
                    generateShiftSummaryPdf(shiftPdfSnapshot);
                  } catch (err) {
                    console.error('Handled modal PDF error:', err);
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all active:scale-95 cursor-pointer border border-indigo-400/40"
              >
                <FileText className="w-4 h-4 text-white" />
                <span>📄 Download Shift Summary PDF</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  if (e && e.preventDefault) e.preventDefault();
                  setShowShiftPdfModal(false);
                }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold px-3 py-2.5 rounded-xl transition-all cursor-pointer"
                title="Dismiss banner"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
