import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/database';
import { getMasterBankAccounts, saveMasterBankAccounts, BANK_STORAGE_KEY, LEGACY_STORAGE_KEY } from '../../utils/bankMaster';
import {
  Building2,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Wallet,
  Receipt,
  QrCode,
  CreditCard,
  Zap,
  Trash2,
  Printer,
  Download,
  Search,
  CheckCircle2,
  Calendar,
  Save,
  Filter,
  FileSpreadsheet,
  FolderPlus
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import NumericInput from '../common/NumericInput';

const DEFAULT_BANK_ACCOUNTS = [
  {
    id: 'bank-1',
    name: 'The Mehsana Urban Co-Op Bank Ltd',
    accountNumber: '00151304000095',
    branch: 'Kheralu Branch',
    openingBalance: 0,
    deposits: []
  },
  {
    id: 'bank-2',
    name: 'State Bank of India',
    accountNumber: '30129481023',
    branch: 'Mehsana Highway',
    openingBalance: 0,
    deposits: []
  },
  {
    id: 'bank-3',
    name: 'HDFC Bank Ltd',
    accountNumber: '5541098231',
    branch: 'Unjha Circle',
    openingBalance: 0,
    deposits: []
  }
];

const DEFAULT_UPI_TRANSACTIONS = [];
const DEFAULT_ATM_TRANSACTIONS = [];
const DEFAULT_SMART_MONEY_TRANSACTIONS = [];

export default function BankHisab() {
  const {
    selectedDate,
    showToast,
    stationProfile,
    bankAccountsMaster = [],
    updateBankAccountsMaster = () => {},
    bankEntries = [],
    setBankEntries = () => {},
    digitalPayEntries = [],
    smartMoneyEntries = []
  } = useApp();
  const [loading, setLoading] = useState(true);

  // Active Sub-Tab: 'bank', 'upi', 'atm', 'smart_money'
  const [activeBankSubTab, setActiveBankSubTab] = useState('bank');

  // Master Bank Accounts List & Selected Bank ID for Tab 1
  const [bankAccounts, setBankAccounts] = useState(() => {
    const saved = localStorage.getItem('pump_bank_accounts') ??
                  localStorage.getItem(BANK_STORAGE_KEY) ??
                  localStorage.getItem(LEGACY_STORAGE_KEY);
    // If explicitly saved in storage (even as an empty array []), respect it!
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error('Error parsing bank accounts:', e);
      }
    }
    return DEFAULT_BANK_ACCOUNTS; // Only use default if first time launch (null)
  });
  const [selectedBankId, setSelectedBankId] = useState(null);
  const [bankSearch, setBankSearch] = useState('');

  // Other Sub-Tab Datasets
  const [upiTransactions, setUpiTransactions] = useState([]);
  const [atmTransactions, setAtmTransactions] = useState([]);
  const [smartMoneyTransactions, setSmartMoneyTransactions] = useState([]);

  // --- BANK TAB FILTERING & REPORTING STATE ---
  const [filterMode, setFilterMode] = useState('month'); // 'month' or 'custom'
  const [selectedYearMonth, setSelectedYearMonth] = useState(() => {
    const d = new Date(selectedDate || Date.now());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [fromDate, setFromDate] = useState(selectedDate || new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(selectedDate || new Date().toISOString().split('T')[0]);

  // Modals State
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [showAtmModal, setShowAtmModal] = useState(false);
  const [showSmartMoneyModal, setShowSmartMoneyModal] = useState(false);

  // Form States
  const [newBank, setNewBank] = useState({
    name: '',
    accountNumber: '',
    branch: '',
    openingBalance: 0
  });

  const [entryDate, setEntryDate] = useState(selectedDate || new Date().toISOString().split('T')[0]);

  // UPI Form
  const [newUpi, setNewUpi] = useState({
    provider: 'PhonePe QR',
    utrNo: '',
    bankAccount: 'Mehsana Urban Co-Op (A/C 0095)',
    amount: ''
  });

  // ATM Form
  const [newAtm, setNewAtm] = useState({
    posTid: 'HDFC EDC-01 (TID: 881920)',
    batchNo: '',
    cardType: 'Visa / Mastercard Debit',
    netAmount: '',
    mdrAmount: '0'
  });

  // Smart Money Form
  const [newSmartMoney, setNewSmartMoney] = useState({
    program: 'DriveTrack Plus (IOCL)',
    cardNo: '',
    amount: '',
    remarks: ''
  });

  useEffect(() => {
    loadBankHisabStore();
  }, []);

  useEffect(() => {
    if (Array.isArray(bankAccountsMaster)) {
      setBankAccounts(bankAccountsMaster);
      if (!selectedBankId && bankAccountsMaster.length > 0) {
        setSelectedBankId(bankAccountsMaster[0].id);
      } else if (selectedBankId && !bankAccountsMaster.some(b => b.id === selectedBankId)) {
        setSelectedBankId(bankAccountsMaster[0]?.id || null);
      }
    }
  }, [bankAccountsMaster]);

  useEffect(() => {
    if (selectedDate) {
      setEntryDate(selectedDate);
      const d = new Date(selectedDate);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      setSelectedYearMonth(ym);
      setFromDate(selectedDate);
      setToDate(selectedDate);
    }
  }, [selectedDate]);

  const loadBankHisabStore = async () => {
    setLoading(true);
    try {
      const rec = await db.settings.get('bank_hisab_store');
      let currentAccounts = [];

      if (rec && rec.data && Array.isArray(rec.data.bank_accounts)) {
        currentAccounts = rec.data.bank_accounts;
      } else {
        const saved = localStorage.getItem('pump_bank_accounts') ??
                      localStorage.getItem(BANK_STORAGE_KEY) ??
                      localStorage.getItem(LEGACY_STORAGE_KEY);
        if (saved !== null) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              currentAccounts = parsed;
            }
          } catch (e) {}
        } else if (Array.isArray(bankAccountsMaster)) {
          currentAccounts = bankAccountsMaster;
        } else {
          currentAccounts = DEFAULT_BANK_ACCOUNTS;
        }
      }

      const sanitizedAccounts = currentAccounts.map(b => ({
        ...b,
        openingBalance: parseFloat(b.openingBalance) || 0,
        deposits: (b.deposits || [])
          .filter(d => !d.isLive && !String(d.id).startsWith('live-sectionH-'))
          .map(d => ({
            ...d,
            debit: d.debit !== undefined ? (parseFloat(d.debit) || 0) : 0,
            credit: d.credit !== undefined ? (parseFloat(d.credit) || 0) : (parseFloat(d.amount) || 0)
          }))
      }));

      setBankAccounts(sanitizedAccounts);
      if (sanitizedAccounts.length > 0) {
        setSelectedBankId(prev => prev || sanitizedAccounts[0].id);
      }

      // Query db.upiLogs and merge into upiTransactions
      const dbUpi = await db.upiLogs.toArray();
      const storeUpi = rec?.data?.upi_transactions || DEFAULT_UPI_TRANSACTIONS;

      const mappedDbUpi = dbUpi.map((u, i) => ({
        id: u.deterministicId || `upi-db-${u.id || i}`,
        date: u.date,
        monthKey: u.monthKey || u.date?.slice(0, 7),
        provider: u.provider || 'UPI QR',
        utrNo: u.utrNo || `UPI-${u.id}`,
        bankAccount: 'Main Pump Account',
        amount: parseFloat(u.amount) || 0,
        entrySource: u.entrySource || 'daily_shift'
      }));

      const upiMap = new Map();
      for (const item of [...mappedDbUpi, ...storeUpi]) {
        const k = item.id || `${item.date}-${item.utrNo}-${item.amount}`;
        upiMap.set(k, item);
      }
      setUpiTransactions(Array.from(upiMap.values()));

      setAtmTransactions(rec?.data?.atm_transactions || DEFAULT_ATM_TRANSACTIONS);
      setSmartMoneyTransactions(rec?.data?.smart_money_transactions || DEFAULT_SMART_MONEY_TRANSACTIONS);
    } catch (err) {
      console.error('Error loading bank hisab store:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveBankHisabStoreToDb = async (
    updatedBankAccounts = bankAccounts,
    updatedUpi = upiTransactions,
    updatedAtm = atmTransactions,
    updatedSmart = smartMoneyTransactions
  ) => {
    try {
      await db.settings.put({
        key: 'bank_hisab_store',
        data: {
          bank_accounts: updatedBankAccounts,
          upi_transactions: updatedUpi,
          atm_transactions: updatedAtm,
          smart_money_transactions: updatedSmart
        },
        updatedAt: new Date().toISOString()
      });

      await saveMasterBankAccounts(updatedBankAccounts);

      if (typeof updateBankAccountsMaster === 'function') {
        updateBankAccountsMaster(updatedBankAccounts);
      }
    } catch (err) {
      console.error('Error saving bank hisab store:', err);
    }
  };

  // --- TAB 1 BANK DIRECTORY & DEPOSIT COMPUTATIONS ---
  // Purely In-Memory Real-Time Live Sync: Merge Section H (Bank Deposit) from Daily Entry into Bank Hisab
  const effectiveBankAccounts = useMemo(() => {
    return (bankAccounts || []).map(b => {
      // 1. Live deposits from Section H in active daily entry
      const liveDeposits = (bankEntries || [])
        .filter(item => {
          const hasAmt = parseFloat(item.amount) > 0;
          const hasSlip = item.slipNo && String(item.slipNo).trim() !== '';
          if (!hasAmt && !hasSlip) return false;
          const matchesId = item.bankAccountId && String(item.bankAccountId) === String(b.id);
          const matchesName = item.bankName && b.name && item.bankName.trim().toLowerCase() === b.name.trim().toLowerCase();
          return matchesId || matchesName;
        })
        .map((item, idx) => {
          const itemDate = item.date || selectedDate;
          return {
            id: `live-sectionH-${item.id !== undefined ? item.id : idx}`,
            date: itemDate,
            monthKey: itemDate ? itemDate.substring(0, 7) : (selectedDate ? selectedDate.substring(0, 7) : ''),
            slipRefNo: item.slipNo || '',
            debit: 0, // Section H deposit is strictly 0.00 in DEBIT (DR)
            credit: parseFloat(item.amount) || 0, // Put deposited amount strictly into CREDIT (CR) column
            isLive: true,
            entrySource: 'daily_shift',
            sectionHId: item.id !== undefined ? item.id : idx
          };
        });

      // 2. Persisted deposits: strip out live keys and deduplicate Section H / daily_shift rows
      const manualDeposits = (b.deposits || []).filter(d => {
        if (d.isLive || String(d.id).startsWith('live-sectionH-')) return false;

        // If from daily_shift / Section H:
        if (d.entrySource === 'daily_shift' || String(d.id).startsWith('bank-dep-daily-')) {
          // Exclude for selectedDate because liveDeposits is the authoritative single source
          if (d.date === selectedDate) return false;
          // Deduplicate by slipRefNo if already represented in liveDeposits
          if (d.slipRefNo && liveDeposits.some(l => l.slipRefNo && l.slipRefNo.trim().toLowerCase() === d.slipRefNo.trim().toLowerCase())) {
            return false;
          }
        }
        return true;
      });

      return {
        ...b,
        deposits: [...liveDeposits, ...manualDeposits]
      };
    });
  }, [bankAccounts, bankEntries, selectedDate]);

  const filteredBankAccounts = useMemo(() => {
    if (!bankSearch.trim()) return effectiveBankAccounts;
    const q = bankSearch.toLowerCase();
    return effectiveBankAccounts.filter(
      b => b.name.toLowerCase().includes(q) || (b.accountNumber && b.accountNumber.toLowerCase().includes(q))
    );
  }, [effectiveBankAccounts, bankSearch]);

  const selectedBank = useMemo(() => {
    return effectiveBankAccounts.find(b => b.id === selectedBankId) || effectiveBankAccounts[0] || null;
  }, [effectiveBankAccounts, selectedBankId]);

  const filteredDeposits = useMemo(() => {
    if (!selectedBank) return [];
    const deposits = selectedBank.deposits || [];

    let list = [];
    if (filterMode === 'month') {
      list = deposits.filter(row => {
        const mKey = row.monthKey || (row.date ? row.date.substring(0, 7) : '');
        return mKey === selectedYearMonth;
      });
    } else {
      list = deposits.filter(row => {
        const dStr = row.date || '';
        return dStr >= fromDate && dStr <= toDate;
      });
    }

    return list.sort((a, b) => new Date(b.date || '2026-01-01') - new Date(a.date || '2026-01-01'));
  }, [selectedBank, filterMode, selectedYearMonth, fromDate, toDate]);

  // Dual Column Totals (Debit vs Credit & Net Movement)
  const periodTotals = useMemo(() => {
    const totalDebit = filteredDeposits.reduce((sum, item) => sum + (parseFloat(item.debit) || 0), 0);
    const totalCredit = filteredDeposits.reduce((sum, item) => sum + (parseFloat(item.credit) || 0), 0);
    const netMovement = totalCredit - totalDebit;
    return { totalDebit, totalCredit, netMovement };
  }, [filteredDeposits]);

  // Account Card Balance: Opening Balance + Total Credit - Total Debit
  const getAccountBalance = (acc) => {
    const openBal = parseFloat(acc.openingBalance) || 0;
    const cr = (acc.deposits || []).reduce((sum, d) => sum + (parseFloat(d.credit) || parseFloat(d.amount) || 0), 0);
    const dr = (acc.deposits || []).reduce((sum, d) => sum + (parseFloat(d.debit) || 0), 0);
    return openBal + cr - dr;
  };

  // --- EFFECTIVE COLLECTIONS WITH LIVE SYNC FROM DAILY ENTRY SECTION F ---
  const effectiveUpiTransactions = useMemo(() => {
    const manual = (upiTransactions || []).filter(u => !u.isLive && !String(u.id).startsWith('live-f-upi-'));
    const live = (digitalPayEntries || [])
      .filter(item => (item.method === 'UPI' || !item.method) && (parseFloat(item.amount) || 0) > 0)
      .map((item, idx) => ({
        id: `live-f-upi-${item.id !== undefined ? item.id : idx}`,
        date: item.date || selectedDate,
        amount: parseFloat(item.amount) || 0,
        isLive: true
      }));
    return [...live, ...manual];
  }, [upiTransactions, digitalPayEntries, selectedDate]);

  const effectiveAtmTransactions = useMemo(() => {
    const manual = (atmTransactions || []).filter(a => !a.isLive && !String(a.id).startsWith('live-f-atm-'));
    const live = (digitalPayEntries || [])
      .filter(item => item.method === 'CARD' && (parseFloat(item.amount) || 0) > 0)
      .map((item, idx) => ({
        id: `live-f-atm-${item.id !== undefined ? item.id : idx}`,
        date: item.date || selectedDate,
        netAmount: parseFloat(item.amount) || 0,
        mdrAmount: 0,
        isLive: true
      }));
    return [...live, ...manual];
  }, [atmTransactions, digitalPayEntries, selectedDate]);

  const effectiveSmartMoneyTransactions = useMemo(() => {
    const manual = (smartMoneyTransactions || []).filter(s => !s.isLive && !String(s.id).startsWith('live-f-sm-'));
    const live = (smartMoneyEntries || [])
      .filter(item => (parseFloat(item.amount) || 0) > 0)
      .map((item, idx) => ({
        id: `live-f-sm-${item.id !== undefined ? item.id : idx}`,
        date: item.date || selectedDate,
        program: item.program || 'PETRO CARD / FLEET CARD',
        amount: parseFloat(item.amount) || 0,
        isLive: true
      }));
    return [...live, ...manual];
  }, [smartMoneyTransactions, smartMoneyEntries, selectedDate]);

  // --- STATS COMPUTATIONS FOR OTHER TABS ---
  const totalUpiAmount = useMemo(() => {
    return effectiveUpiTransactions.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  }, [effectiveUpiTransactions]);

  const totalAtmAmount = useMemo(() => {
    return effectiveAtmTransactions.reduce((sum, item) => sum + (parseFloat(item.netAmount) || 0), 0);
  }, [effectiveAtmTransactions]);

  const totalMdrAmount = useMemo(() => {
    return effectiveAtmTransactions.reduce((sum, item) => sum + (parseFloat(item.mdrAmount) || 0), 0);
  }, [effectiveAtmTransactions]);

  const totalSmartMoneyAmount = useMemo(() => {
    return effectiveSmartMoneyTransactions.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  }, [effectiveSmartMoneyTransactions]);

  const availableMonths = useMemo(() => {
    const list = [];
    const now = new Date();
    const curYear = now.getFullYear();
    for (let y = curYear - 1; y <= curYear + 1; y++) {
      for (let m = 0; m < 12; m++) {
        const val = `${y}-${String(m + 1).padStart(2, '0')}`;
        const label = new Date(y, m, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
        list.push({ val, label });
      }
    }
    return list;
  }, []);

  const setPresetRange = (preset) => {
    const today = new Date(selectedDate || Date.now());
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'thisWeek') {
      const d = new Date(today);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(d.setDate(diff)).toISOString().split('T')[0];
      setFromDate(start);
      setToDate(todayStr);
    } else if (preset === 'last15') {
      const d = new Date(today);
      d.setDate(d.getDate() - 15);
      setFromDate(d.toISOString().split('T')[0]);
      setToDate(todayStr);
    } else if (preset === 'thisMonth') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(d.toISOString().split('T')[0]);
      setToDate(todayStr);
    }
  };

  // --- TAB 1 BANK DIRECTORY & DEPOSIT ACTIONS ---

  const handleCreateBank = async (e) => {
    e.preventDefault();
    if (!newBank.name.trim()) return;

    const bankObj = {
      id: `bank-${Date.now()}`,
      name: newBank.name.trim(),
      accountNumber: newBank.accountNumber.trim() || 'A/C Pending',
      branch: newBank.branch.trim() || 'Main Branch',
      openingBalance: parseFloat(newBank.openingBalance) || 0,
      deposits: []
    };

    const updated = [...bankAccounts, bankObj];
    setBankAccounts(updated);
    setSelectedBankId(bankObj.id);
    setShowAddBankModal(false);
    setNewBank({ name: '', accountNumber: '', branch: '', openingBalance: 0 });

    await saveBankHisabStoreToDb(updated);
    showToast(`Added Bank / Party: ${bankObj.name}`, 'success');
  };

  const handleDeleteBank = async (bankId, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const updated = bankAccounts.filter(b => b.id !== bankId);
    setBankAccounts(updated);

    // Explicitly update all localStorage keys immediately
    const updatedJson = JSON.stringify(updated);
    localStorage.setItem('pump_bank_accounts', updatedJson);
    localStorage.setItem(BANK_STORAGE_KEY, updatedJson);
    localStorage.setItem(LEGACY_STORAGE_KEY, updatedJson);

    // Handle selected bank pointer
    setSelectedBankId(prevId => {
      if (prevId === bankId) {
        return updated.length > 0 ? updated[0].id : null;
      }
      return prevId;
    });

    await saveBankHisabStoreToDb(updated);
    showToast('Removed Bank Account Directory entry', 'info');
  };

  // Inline Deposit Row Addition for Active Selected Bank
  const handleAddInlineDepositRow = () => {
    if (!selectedBank) return;
    const dStr = selectedDate || new Date().toISOString().split('T')[0];
    const mKey = selectedYearMonth || dStr.substring(0, 7);

    const newDep = {
      id: `trans-${Date.now()}`,
      date: dStr,
      monthKey: mKey,
      slipRefNo: `DEP-${Math.floor(1000 + Math.random() * 9000)}`,
      debit: 0,
      credit: 0
    };

    const updatedAccounts = bankAccounts.map(b => {
      if (b.id === selectedBank.id) {
        return {
          ...b,
          deposits: [newDep, ...(b.deposits || [])]
        };
      }
      return b;
    });

    setBankAccounts(updatedAccounts);
    saveBankHisabStoreToDb(updatedAccounts);
    showToast('Added transaction row', 'info');
  };

  const handleUpdateDepositRow = (depId, field, val) => {
    if (!selectedBank) return;
    if (String(depId).startsWith('live-sectionH-')) {
      const liveKey = String(depId).replace('live-sectionH-', '');
      const updatedEntries = [...bankEntries];
      const matchIdx = updatedEntries.findIndex((item, idx) => String(item.id !== undefined ? item.id : idx) === liveKey);
      if (matchIdx >= 0) {
        const item = { ...updatedEntries[matchIdx] };
        if (field === 'credit') {
          item.amount = val === '' ? 0 : (parseFloat(val) || 0);
        } else if (field === 'debit') {
          // Section H entries are deposits strictly in Credit (CR); ignore debit input
          return;
        } else if (field === 'slipRefNo' || field === 'slipNo') {
          item.slipNo = val;
        } else if (field === 'date') {
          item.date = val;
        }
        updatedEntries[matchIdx] = item;
        setBankEntries(updatedEntries);
      }
      return;
    }
    const updatedAccounts = bankAccounts.map(b => {
      if (b.id === selectedBank.id) {
        const updatedDeposits = (b.deposits || []).map(d => {
          if (d.id === depId) {
            if (field === 'debit' || field === 'credit') {
              return { ...d, [field]: val === '' ? 0 : (parseFloat(val) || 0) };
            }
            if (field === 'date') {
              return { ...d, date: val, monthKey: val ? val.substring(0, 7) : d.monthKey };
            }
            return { ...d, [field]: val };
          }
          return d;
        });
        return { ...b, deposits: updatedDeposits };
      }
      return b;
    });
    setBankAccounts(updatedAccounts);
  };

  const handleDeleteDepositRow = async (depId) => {
    if (!selectedBank) return;
    if (String(depId).startsWith('live-sectionH-')) {
      const liveKey = String(depId).replace('live-sectionH-', '');
      const updatedEntries = bankEntries.filter((item, idx) => String(item.id !== undefined ? item.id : idx) !== liveKey);
      setBankEntries(updatedEntries);
      showToast('Removed transaction row', 'info');
      return;
    }
    const updatedAccounts = bankAccounts.map(b => {
      if (b.id === selectedBank.id) {
        return {
          ...b,
          deposits: (b.deposits || []).filter(d => d.id !== depId)
        };
      }
      return b;
    });
    setBankAccounts(updatedAccounts);
    await saveBankHisabStoreToDb(updatedAccounts);
    showToast('Removed transaction row', 'info');
  };

  const handleSaveBankSheet = async () => {
    await saveBankHisabStoreToDb(bankAccounts);
    showToast('Saved & Locked Bank Deposit Entries!', 'success');
  };

  // --- PRINT PDF & EXPORT CSV FOR ACTIVE BANK ---
  const handlePrintBankPDF = () => {
    if (!selectedBank) return;
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(stationProfile?.fuelStationName || 'SHITAL PETROL PUMP', pageWidth / 2, 12, { align: 'center' });

      doc.setFontSize(11);
      const periodTitle = filterMode === 'month' ? `MONTHLY STATEMENT (${selectedYearMonth})` : `RANGE STATEMENT (${fromDate} to ${toDate})`;
      doc.text(`BANK HISAB STATEMENT — ${selectedBank.name.toUpperCase()} (${periodTitle})`, pageWidth / 2, 18, { align: 'center' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Account No: ${selectedBank.accountNumber}  |  Branch: ${selectedBank.branch || 'Main'}`, 14, 24);

      const tableRows = filteredDeposits.map((item, i) => [
        i + 1,
        item.date || '-',
        item.slipRefNo || item.slipNo || '-',
        `Rs. ${parseFloat(item.debit || 0).toLocaleString('en-IN')}`,
        `Rs. ${parseFloat(item.credit || item.amount || 0).toLocaleString('en-IN')}`
      ]);

      tableRows.push(['TOTALS', '', '', `Rs. ${periodTotals.totalDebit.toLocaleString('en-IN')}`, `Rs. ${periodTotals.totalCredit.toLocaleString('en-IN')}`]);

      autoTable(doc, {
        startY: 28,
        head: [['#', 'DATE', 'DEPOSIT SLIP / REF NO', 'DEBIT (DR)', 'CREDIT (CR)']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        styles: { fontSize: 8 }
      });

      doc.save(`BANK_${selectedBank.name.replace(/\s+/g, '_')}_STATEMENT.pdf`);
      showToast(`Generated Statement PDF for ${selectedBank.name}!`, 'success');
    } catch (err) {
      showToast('Error generating PDF: ' + err.message, 'error');
    }
  };

  const handleExportBankCSV = () => {
    if (!selectedBank) return;
    try {
      let csv = `Date,Deposit Slip / Ref No,Debit (DR INR),Credit (CR INR)\n`;
      filteredDeposits.forEach(b => {
        csv += `"${b.date || ''}","${b.slipRefNo || b.slipNo || ''}",${b.debit || 0},${b.credit || b.amount || 0}\n`;
      });
      csv += `,TOTALS,${periodTotals.totalDebit},${periodTotals.totalCredit}\n`;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `BANK_${selectedBank.name.replace(/\s+/g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast(`Exported CSV for ${selectedBank.name}!`, 'success');
    } catch (err) {
      showToast('Error exporting CSV: ' + err.message, 'error');
    }
  };

  // --- OTHER TAB HANDLERS ---
  const handleAddUpi = async (e) => {
    e.preventDefault();
    const amt = parseFloat(newUpi.amount) || 0;
    if (amt <= 0) return;

    const added = {
      id: `upi-${Date.now()}`,
      date: entryDate || selectedDate,
      provider: newUpi.provider,
      utrNo: newUpi.utrNo.trim() || `UPI/${Math.floor(100000000000 + Math.random() * 900000000000)}`,
      bankAccount: newUpi.bankAccount,
      amount: amt
    };

    const updatedList = [added, ...upiTransactions];
    setUpiTransactions(updatedList);
    setShowUpiModal(false);
    setNewUpi({ provider: 'PhonePe QR', utrNo: '', bankAccount: 'Mehsana Urban Co-Op (A/C 0095)', amount: '' });

    await saveBankHisabStoreToDb(bankAccounts, updatedList, atmTransactions, smartMoneyTransactions);
    showToast(`Recorded UPI Settlement of ₹${amt.toLocaleString('en-IN')}`, 'success');
  };

  const handleDeleteUpi = async (id) => {
    if (String(id).startsWith('live-f-upi-')) {
      showToast('This entry is live synced from Daily Entry Section F. Remove it from Section F.', 'info');
      return;
    }
    const updatedList = upiTransactions.filter(u => u.id !== id);
    setUpiTransactions(updatedList);
    await saveBankHisabStoreToDb(bankAccounts, updatedList, atmTransactions, smartMoneyTransactions);
    showToast('Deleted UPI entry', 'info');
  };

  const handleAddAtm = async (e) => {
    e.preventDefault();
    const amt = parseFloat(newAtm.netAmount) || 0;
    if (amt <= 0) return;

    const added = {
      id: `atm-${Date.now()}`,
      date: entryDate || selectedDate,
      posTid: newAtm.posTid,
      batchNo: newAtm.batchNo.trim() || `BATCH-${Math.floor(100 + Math.random() * 900)}`,
      cardType: newAtm.cardType,
      netAmount: amt,
      mdrAmount: parseFloat(newAtm.mdrAmount) || 0
    };

    const updatedList = [added, ...atmTransactions];
    setAtmTransactions(updatedList);
    setShowAtmModal(false);
    setNewAtm({ posTid: 'HDFC EDC-01 (TID: 881920)', batchNo: '', cardType: 'Visa / Mastercard Debit', netAmount: '', mdrAmount: '0' });

    await saveBankHisabStoreToDb(bankAccounts, upiTransactions, updatedList, smartMoneyTransactions);
    showToast(`Recorded Card Swipe Settlement of ₹${amt.toLocaleString('en-IN')}`, 'success');
  };

  const handleDeleteAtm = async (id) => {
    if (String(id).startsWith('live-f-atm-')) {
      showToast('This entry is live synced from Daily Entry Section F. Remove it from Section F.', 'info');
      return;
    }
    const updatedList = atmTransactions.filter(a => a.id !== id);
    setAtmTransactions(updatedList);
    await saveBankHisabStoreToDb(bankAccounts, upiTransactions, updatedList, smartMoneyTransactions);
    showToast('Deleted ATM entry', 'info');
  };

  const handleAddSmartMoney = async (e) => {
    e.preventDefault();
    const amt = parseFloat(newSmartMoney.amount) || 0;
    if (amt <= 0) return;

    const added = {
      id: `sm-${Date.now()}`,
      date: entryDate || selectedDate,
      program: newSmartMoney.program,
      cardNo: newSmartMoney.cardNo.trim() || 'Fleet Card',
      amount: amt,
      remarks: newSmartMoney.remarks.trim() || 'Fleet Fuel Sales'
    };

    const updatedList = [added, ...smartMoneyTransactions];
    setSmartMoneyTransactions(updatedList);
    setShowSmartMoneyModal(false);
    setNewSmartMoney({ program: 'DriveTrack Plus (IOCL)', cardNo: '', amount: '', remarks: '' });

    await saveBankHisabStoreToDb(bankAccounts, upiTransactions, atmTransactions, updatedList);
    showToast(`Recorded Smart Money Entry of ₹${amt.toLocaleString('en-IN')}`, 'success');
  };

  const handleDeleteSmartMoney = async (id) => {
    if (String(id).startsWith('live-f-sm-')) {
      showToast('This entry is live synced from Daily Entry Section F. Remove it from Section F.', 'info');
      return;
    }
    const updatedList = smartMoneyTransactions.filter(s => s.id !== id);
    setSmartMoneyTransactions(updatedList);
    await saveBankHisabStoreToDb(bankAccounts, upiTransactions, atmTransactions, updatedList);
    showToast('Deleted Smart Money entry', 'info');
  };

  if (loading) return <div className="p-8 text-center text-sm font-semibold text-slate-400">Loading Bank Hisab Workspace...</div>;

  return (
    <div className="p-4 space-y-3.5 animate-fadeIn bg-[#0c121d] min-h-screen select-text font-sans text-slate-200">
      {/* Sleek Top Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#121927] p-3 rounded-xl border border-[#1e293b] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#0e1420] text-blue-400 border border-[#1b2537]">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-xs text-slate-100 flex items-center gap-2 tracking-wide">
              <span>Bank Hisab & Digital Payment Registers</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">
              Manage bank deposits, UPI QR payments, ATM POS card swipes, & Fleet Smart Money settlements
            </p>
          </div>
        </div>
      </div>

      {/* TOP SUB-TABS NAVIGATION BAR */}
      <div className="flex items-center gap-2 border-b border-[#1e293b] pb-2.5 mb-3 overflow-x-auto">
        {[
          { id: 'bank', label: '🏦 BANK HISAB' },
          { id: 'upi', label: '📱 UPI' },
          { id: 'atm', label: '💳 ATM' },
          { id: 'smart_money', label: '⚡ SMART MONEY' },
        ].map((tab) => (
          <button type="button"
            key={tab.id}
            onClick={() => setActiveBankSubTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeBankSubTab === tab.id
                ? 'bg-[#192438] text-white border-l-2 border-blue-500 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#131b29]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* 🏦 TAB 1: BANK HISAB (CLEAN FILTER TOOLBAR TOP & BOTTOM RECONCILIATION STRIP) */}
      {/* ========================================================================= */}
      {activeBankSubTab === 'bank' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-220px)]">
          
          {/* 📑 LEFT PANEL (~35% WIDTH - lg:col-span-4): BANK / PARTY DIRECTORY */}
          <div className="lg:col-span-4 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-3.5 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <span>🏦 BANK & PARTY ACCOUNTS</span>
                </span>
                <button type="button"
                  onClick={() => setShowAddBankModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ Add Bank / Party</span>
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="Search bank name or account no..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 font-medium outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Bank Accounts Roster List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[580px]">
              {bankAccounts.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-slate-400 space-y-1.5">
                  <div className="font-semibold text-slate-500">No bank accounts found.</div>
                  <div>Click <strong className="text-blue-600 font-bold">"+ Add Bank / Party"</strong> to add one.</div>
                </div>
              ) : filteredBankAccounts.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-slate-400">
                  No bank accounts match search. Click <strong>"+ Add Bank / Party"</strong> to create one.
                </div>
              ) : (
                filteredBankAccounts.map((acc) => {
                  const isSelected = selectedBank?.id === acc.id;
                  const currentBalance = getAccountBalance(acc);

                  return (
                    <div
                      key={acc.id}
                      onClick={() => setSelectedBankId(acc.id)}
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
                          <div className="text-[10px] font-mono font-semibold text-slate-500">
                            A/C: {acc.accountNumber} ({acc.branch || 'Main'})
                          </div>
                        </div>

                        {/* Current Balance Badge & Delete action */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-full border ${
                            currentBalance >= 0
                              ? 'bg-emerald-100/80 text-emerald-950 border-emerald-300'
                              : 'bg-rose-100/80 text-rose-950 border-rose-300'
                          }`}>
                            ₹ {Math.abs(currentBalance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteBank(acc.id, e)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete Bank Account"
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

          {/* 📋 RIGHT PANEL (~65% WIDTH - lg:col-span-8): SELECTED BANK DEPOSIT WORKSPACE */}
          {selectedBank ? (
            <div className="lg:col-span-8 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 min-w-0">
              
              {/* Bank Info Header Strip */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>{selectedBank.name}</span>
                  </h2>
                  <div className="text-xs text-slate-500 font-semibold flex items-center gap-2 mt-0.5">
                    <span>A/C No: <strong className="text-slate-800 font-mono">{selectedBank.accountNumber}</strong></span>
                    <span className="text-slate-300">|</span>
                    <span>Branch: <strong className="text-slate-800 font-semibold">{selectedBank.branch || 'Main'}</strong></span>
                  </div>
                </div>

                {/* Orange + Add Entry Button */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddInlineDepositRow}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Entry</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteBank(selectedBank.id, e)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Remove Bank Account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 🧹 CLEAN TOP FILTER TOOLBAR (NO CLUTTER) */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                {/* Filter Type Toggle */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-blue-600" />
                    <span>Filter:</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterMode('month')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      filterMode === 'month' ? 'bg-blue-600 text-white shadow-2xs' : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                  >
                    🗓️ Month-Wise View
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('custom')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      filterMode === 'custom' ? 'bg-blue-600 text-white shadow-2xs' : 'bg-white text-slate-700 border border-slate-200'
                    }`}
                  >
                    📆 Custom Range
                  </button>
                </div>

                {/* Dynamic Inputs Based on Filter Mode */}
                {filterMode === 'month' ? (
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <select
                      value={selectedYearMonth}
                      onChange={(e) => setSelectedYearMonth(e.target.value)}
                      className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
                    >
                      {availableMonths.map((m) => (
                        <option key={m.val} value={m.val}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 font-mono text-xs font-bold" />
                    <span>to</span>
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 font-mono text-xs font-bold" />
                    <button type="button" onClick={() => setPresetRange('thisWeek')} className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700">This Week</button>
                    <button type="button" onClick={() => setPresetRange('last15')} className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700">Last 15 Days</button>
                  </div>
                )}
              </div>

              {/* DUAL DEBIT (DR) & CREDIT (CR) REGISTER TABLE */}
              <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-2xs flex-1">
                <table className="w-full text-left border-collapse font-sans text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider border-b border-slate-800">
                      <th className="p-2.5 border-r border-slate-800 w-36">DATE</th>
                      <th className="p-2.5 border-r border-slate-800">DEPOSIT SLIP / REF NO</th>
                      <th className="p-2.5 border-r border-slate-800 text-right w-40 font-mono text-rose-300">DEBIT (DR) (₹)</th>
                      <th className="p-2.5 border-r border-slate-800 text-right w-40 font-mono text-emerald-300">CREDIT (CR) (₹)</th>
                      <th className="p-2.5 text-center w-14">ACTION</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200 font-semibold select-text">
                    {filteredDeposits.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-slate-400 font-mono">
                          No transactions for {selectedBank.name} in this period. Click <strong>"+ Add Entry"</strong> to record.
                        </td>
                      </tr>
                    ) : (
                      filteredDeposits.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          {/* 1. DATE (Native Date Picker) */}
                          <td className="p-2 border-r border-slate-200">
                            <input
                              type="date"
                              value={item.date || selectedDate}
                              onChange={(e) => handleUpdateDepositRow(item.id, 'date', e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-semibold text-slate-900 outline-none focus:border-blue-500 shadow-2xs"
                            />
                          </td>

                          {/* 2. DEPOSIT SLIP / REF NO */}
                          <td className="p-2 border-r border-slate-200">
                            <input
                              type="text"
                              value={item.slipRefNo || item.slipNo || ''}
                              onChange={(e) => handleUpdateDepositRow(item.id, 'slipRefNo', e.target.value)}
                              placeholder="e.g. DEP-9981 / CHQ-1002"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs"
                            />
                          </td>

                          {/* 3. DEBIT (DR) (₹) (Rose Red) */}
                          <td className="p-2 border-r border-slate-200 text-right bg-rose-50/20">
                            <NumericInput
                              step="10"
                              value={item.debit || ''}
                              onChange={(val) => handleUpdateDepositRow(item.id, 'debit', val)}
                              placeholder="0.00"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-rose-700 text-right outline-none focus:border-rose-500 shadow-2xs"
                            />
                          </td>

                          {/* 4. CREDIT (CR) (₹) (Emerald Green) */}
                          <td className="p-2 border-r border-slate-200 text-right bg-emerald-50/20">
                            <NumericInput
                              step="10"
                              value={item.credit !== undefined ? item.credit : (item.amount || '')}
                              onChange={(val) => handleUpdateDepositRow(item.id, 'credit', val)}
                              placeholder="0.00"
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-emerald-700 text-right outline-none focus:border-emerald-500 shadow-2xs"
                            />
                          </td>

                          {/* 5. ACTION (Pink Trash Delete Button) */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteDepositRow(item.id)}
                              className="p-1.5 rounded-lg text-rose-500 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 transition-colors"
                              title="Delete Row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>

                  <tfoot className="bg-slate-900 text-white font-mono text-xs select-text">
                    <tr>
                      <td colSpan="2" className="p-3 text-right font-black text-slate-200 uppercase font-sans border-r border-slate-800">
                        TOTALS:
                      </td>
                      <td className="p-3 text-right font-black text-rose-300 text-xs bg-slate-950 border-r border-slate-800">
                        ₹ {periodTotals.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-black text-emerald-400 text-xs bg-slate-950 border-r border-slate-800">
                        ₹ {periodTotals.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* 🎨 REDESIGNED BOTTOM SUMMARY RECONCILIATION STRIP (BELOW TABLE) */}
              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Total Credit Badge */}
                  <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 shadow-2xs">
                    <span>Total Credit (Deposits):</span>
                    <span className="text-emerald-900 font-black">₹ {periodTotals.totalCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>

                  {/* Total Debit Badge */}
                  <div className="bg-rose-50 border border-rose-300 text-rose-800 px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 shadow-2xs">
                    <span>Total Debit (Withdrawals):</span>
                    <span className="text-rose-900 font-black">₹ {periodTotals.totalDebit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>

                  {/* Net Movement Badge */}
                  <div className="bg-blue-50 border border-blue-300 text-blue-800 px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 shadow-2xs">
                    <span>Net Movement:</span>
                    <span className="text-blue-900 font-black">₹ {periodTotals.netMovement.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>

                {/* Action Buttons Cleanly Aligned to the Right */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrintBankPDF}
                    className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Print PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportBankCSV}
                    className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveBankSheet}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                </div>
              </div>

            </div>
          ) : (
            <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center p-12 text-center text-slate-400 font-mono text-xs space-y-2 min-h-[400px]">
              <Building2 className="w-12 h-12 text-slate-300 stroke-[1.5]" />
              <div className="font-semibold text-slate-600 text-sm">Please select or add a bank account to view transactions.</div>
              <div className="text-slate-400 text-[11px]">Click "+ Add Bank / Party" in the left sidebar to add a new account.</div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📱 TAB 2: UPI (DIGITAL QR & APP PAYMENTS REGISTER) */}
      {/* ========================================================================= */}
      {activeBankSubTab === 'upi' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">📱 UPI Transactions & Settlements</h3>
                <div className="text-xs font-mono font-bold text-indigo-700 mt-0.5">
                  Total UPI Received: ₹ {totalUpiAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <button type="button"
              onClick={() => setShowUpiModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Record UPI Settlement</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-10 text-center font-mono">#</th>
                    <th className="p-3">DATE</th>
                    <th className="p-3 text-right">AMOUNT (₹)</th>
                    <th className="p-3 text-center w-12">ACT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-semibold select-text">
                  {effectiveUpiTransactions.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-slate-400 font-mono">
                        No UPI settlements logged. Click <strong>"+ Record UPI Settlement"</strong> to add.
                      </td>
                    </tr>
                  ) : (
                    effectiveUpiTransactions.map((item, i) => (
                      <tr key={item.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center font-mono font-bold text-slate-600">{i + 1}</td>
                        <td className="p-3 font-mono text-slate-800">
                          {item.date || selectedDate}
                          {item.isLive && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">LIVE</span>}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-indigo-700 text-sm">
                          ₹ {parseFloat(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-center">
                          <button type="button"
                            onClick={() => handleDeleteUpi(item.id)}
                            className="p-1 rounded text-rose-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 💳 TAB 3: ATM (CARD SWIPE / EDC POS MACHINE REGISTER) */}
      {/* ========================================================================= */}
      {activeBankSubTab === 'atm' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">💳 ATM / POS Card Swipe Register</h3>
                <div className="text-xs font-mono font-bold text-purple-700 mt-0.5 flex items-center gap-2">
                  <span>Net Card Swipes: ₹ {totalAtmAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-rose-600">MDR Charges: ₹ {totalMdrAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            <button type="button"
              onClick={() => setShowAtmModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Record Batch Settlement</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-10 text-center font-mono">#</th>
                    <th className="p-3">DATE</th>
                    <th className="p-3 text-right">NET AMOUNT (₹)</th>
                    <th className="p-3 text-center w-12">ACT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-semibold select-text">
                  {effectiveAtmTransactions.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-slate-400 font-mono">
                        No ATM/POS card swipes logged. Click <strong>"+ Record Batch Settlement"</strong> to add.
                      </td>
                    </tr>
                  ) : (
                    effectiveAtmTransactions.map((item, i) => (
                      <tr key={item.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center font-mono font-bold text-slate-600">{i + 1}</td>
                        <td className="p-3 font-mono text-slate-800">
                          {item.date || selectedDate}
                          {item.isLive && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">LIVE</span>}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-purple-800 text-sm">
                          ₹ {parseFloat(item.netAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-center">
                          <button type="button"
                            onClick={() => handleDeleteAtm(item.id)}
                            className="p-1 rounded text-rose-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ⚡ TAB 4: SMART MONEY (FLEET / PRE-PAID CARDS & VOUCHERS) */}
      {/* ========================================================================= */}
      {activeBankSubTab === 'smart_money' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">⚡ Smart Money / Fleet Card Register</h3>
                <div className="text-xs font-mono font-bold text-amber-700 mt-0.5">
                  Total Smart Sales: ₹ {totalSmartMoneyAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <button type="button"
              onClick={() => setShowSmartMoneyModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Record Smart Money Entry</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-10 text-center font-mono">#</th>
                    <th className="p-3">DATE</th>
                    <th className="p-3">PROGRAM</th>
                    <th className="p-3 text-right">AMOUNT (₹)</th>
                    <th className="p-3 text-center w-12">ACT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-semibold select-text">
                  {effectiveSmartMoneyTransactions.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-slate-400 font-mono">
                        No Smart Money entries logged. Click <strong>"+ Record Smart Money Entry"</strong> to add.
                      </td>
                    </tr>
                  ) : (
                    effectiveSmartMoneyTransactions.map((item, i) => (
                      <tr key={item.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center font-mono font-bold text-slate-600">{i + 1}</td>
                        <td className="p-3 font-mono text-slate-800">
                          {item.date || selectedDate}
                          {item.isLive && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">LIVE</span>}
                        </td>
                        <td className="p-3 font-extrabold text-amber-950">{item.program}</td>
                        <td className="p-3 text-right font-mono font-black text-amber-800 text-sm">
                          ₹ {parseFloat(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-center">
                          <button type="button"
                            onClick={() => handleDeleteSmartMoney(item.id)}
                            className="p-1 rounded text-rose-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD BANK / PARTY ACCOUNT */}
      {showAddBankModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-text">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-extrabold text-slate-900">Add New Bank / Party Account</h3>
              </div>
              <button type="button" onClick={() => setShowAddBankModal(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleCreateBank(e); }} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Bank / Party Name *</label>
                <input
                  type="text" required placeholder="e.g. The Mehsana Urban Co-Op Bank Ltd"
                  value={newBank.name} onChange={(e) => setNewBank({ ...newBank, name: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Bank Account Number</label>
                <input
                  type="text" placeholder="e.g. 00151304000095"
                  value={newBank.accountNumber} onChange={(e) => setNewBank({ ...newBank, accountNumber: e.target.value })}
                  className="w-full bg-white text-slate-900 font-mono border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Branch / IFSC Code</label>
                <input
                  type="text" placeholder="e.g. Kheralu Branch (MSNU0000015)"
                  value={newBank.branch} onChange={(e) => setNewBank({ ...newBank, branch: e.target.value })}
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Opening Balance (₹)</label>
                <input
                  type="number" placeholder="0.00"
                  value={newBank.openingBalance || ''} onChange={(e) => setNewBank({ ...newBank, openingBalance: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white text-slate-900 font-mono border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-bold text-right focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button type="button" onClick={() => setShowAddBankModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md cursor-pointer">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: UPI SETTLEMENT */}
      {showUpiModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-text">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">Record UPI QR Settlement</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleAddUpi(e); }} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1 font-bold">Date *</label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 font-mono text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">App / Provider *</label>
                <select
                  value={newUpi.provider}
                  onChange={(e) => setNewUpi({ ...newUpi, provider: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold"
                >
                  <option value="PhonePe QR">PhonePe QR</option>
                  <option value="Google Pay">Google Pay</option>
                  <option value="Paytm Business">Paytm Business</option>
                  <option value="BharatPe QR">BharatPe QR</option>
                  <option value="Direct UPI QR">Direct UPI QR</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">UTR / Ref Number</label>
                <input
                  type="text"
                  placeholder="e.g. UPI/392019481029"
                  value={newUpi.utrNo}
                  onChange={(e) => setNewUpi({ ...newUpi, utrNo: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Settlement Bank Account *</label>
                <select
                  value={newUpi.bankAccount}
                  onChange={(e) => setNewUpi({ ...newUpi, bankAccount: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold"
                >
                  <option value="Mehsana Urban Co-Op (A/C 0095)">Mehsana Urban Co-Op (A/C 0095)</option>
                  <option value="State Bank of India (A/C 1023)">State Bank of India (A/C 1023)</option>
                  <option value="HDFC Bank (A/C 5541)">HDFC Bank (A/C 5541)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">UPI Amount (₹) *</label>
                <NumericInput
                  required
                  step="10"
                  placeholder="0.00"
                  value={newUpi.amount}
                  onChange={(v) => setNewUpi({ ...newUpi, amount: v })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono text-base font-bold text-indigo-700 text-right"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowUpiModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md cursor-pointer"
                >
                  Save UPI Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ATM / POS CARD SETTLEMENT */}
      {showAtmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-text">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">Record ATM / POS Card Swipe Settlement</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleAddAtm(e); }} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1 font-bold">Date *</label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 font-mono text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">POS Machine / TID *</label>
                <select
                  value={newAtm.posTid}
                  onChange={(e) => setNewAtm({ ...newAtm, posTid: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold"
                >
                  <option value="HDFC EDC-01 (TID: 881920)">HDFC EDC-01 (TID: 881920)</option>
                  <option value="SBI POS-02 (TID: 991204)">SBI POS-02 (TID: 991204)</option>
                  <option value="ICICI EDC-03 (TID: 772910)">ICICI EDC-03 (TID: 772910)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Batch Number</label>
                <input
                  type="text"
                  placeholder="e.g. BATCH-401"
                  value={newAtm.batchNo}
                  onChange={(e) => setNewAtm({ ...newAtm, batchNo: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Card Type *</label>
                <select
                  value={newAtm.cardType}
                  onChange={(e) => setNewAtm({ ...newAtm, cardType: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold"
                >
                  <option value="Visa / Mastercard Debit">Visa / Mastercard Debit</option>
                  <option value="RuPay Card">RuPay Card</option>
                  <option value="Credit Card">Credit Card</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Net Settlement Amount (₹) *</label>
                <NumericInput
                  required
                  step="10"
                  placeholder="0.00"
                  value={newAtm.netAmount}
                  onChange={(v) => setNewAtm({ ...newAtm, netAmount: v })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono text-base font-bold text-purple-700 text-right"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAtmModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md cursor-pointer"
                >
                  Save Card Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: SMART MONEY / FLEET CARD */}
      {showSmartMoneyModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-text">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">Record Smart Money / Fleet Card</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleAddSmartMoney(e); }} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1 font-bold">Date *</label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 font-mono text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Fleet Program *</label>
                <select
                  value={newSmartMoney.program}
                  onChange={(e) => setNewSmartMoney({ ...newSmartMoney, program: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold"
                >
                  <option value="DriveTrack Plus (IOCL)">DriveTrack Plus (IOCL)</option>
                  <option value="HP Pay Fleet">HP Pay Fleet</option>
                  <option value="XtraPower Loyalty">XtraPower Loyalty</option>
                  <option value="PetroCard Pre-paid">PetroCard Pre-paid</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Vehicle / Card Number</label>
                <input
                  type="text"
                  placeholder="e.g. GJ-02-AB-1234 (Card: 9918)"
                  value={newSmartMoney.cardNo}
                  onChange={(e) => setNewSmartMoney({ ...newSmartMoney, cardNo: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Sales Amount (₹) *</label>
                <NumericInput
                  required
                  step="10"
                  placeholder="0.00"
                  value={newSmartMoney.amount}
                  onChange={(v) => setNewSmartMoney({ ...newSmartMoney, amount: v })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono text-base font-bold text-amber-800 text-right"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-bold">Remarks / Slip Details</label>
                <input
                  type="text"
                  placeholder="e.g. Truck HSD Diesel 72L"
                  value={newSmartMoney.remarks}
                  onChange={(e) => setNewSmartMoney({ ...newSmartMoney, remarks: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSmartMoneyModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md cursor-pointer"
                >
                  Save Smart Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
