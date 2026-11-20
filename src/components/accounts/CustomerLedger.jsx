import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/database';
import { getMasterParties, saveMasterParties } from '../../utils/partyMaster';
import { cleanupDuplicateLedgerEntries } from '../../db/storageService';
import { Users, Plus, Search, Printer, Trash2, ArrowUpRight, ArrowDownRight, Building2, Calculator, ArrowRightCircle, RotateCw, Calendar, Filter } from 'lucide-react';
import NumericInput from '../common/NumericInput';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to deduplicate JAMA entries (same date, same amount for the same customer)
// If one entry has "CASH IN HAND - Shift Collection..." and another simple "Cash" exists, keep only one.
export const deduplicateJamaList = (list) => {
  if (!Array.isArray(list) || list.length === 0) return [];
  const result = [];
  const seen = new Map();

  for (const item of list) {
    if (!item) continue;
    if (item.type !== 'CREDIT' && item.type !== 'JAMA') {
      result.push(item);
      continue;
    }

    const amt = parseFloat(item.amount) || 0;
    if (amt <= 0) continue;

    const dateStr = item.date ? String(item.date).split('T')[0].trim() : '';
    const partyKey = String(item.customerId || item.partyId || item.customerName || '').trim().toLowerCase();
    const key = `${partyKey}_${dateStr}_${amt.toFixed(2)}`;

    if (!seen.has(key)) {
      seen.set(key, item);
      result.push(item);
    } else {
      const existing = seen.get(key);
      const itemDesc = String(item.notes || item.paymentMode || item.description || '').toLowerCase();
      const existingDesc = String(existing.notes || existing.paymentMode || existing.description || '').toLowerCase();

      // If existing is generic "cash" and the incoming entry has "shift collection" or "cash in hand", prefer the detailed entry
      if ((itemDesc.includes('shift collection') || itemDesc.includes('cash in hand')) && !existingDesc.includes('shift collection')) {
        const idx = result.indexOf(existing);
        if (idx !== -1) {
          result[idx] = item;
          seen.set(key, item);
        }
      }
    }
  }
  return result;
};

// Function to compute Opening Balance for a given Party and Month/Year automatically from prior months
export const getAutoOpeningBalance = (transactions, partyId, targetYear, targetMonthIndex, baseOpeningBalance = 0) => {
  if (!partyId) return baseOpeningBalance;
  
  // 1. Filter all prior transactions for this party strictly before the 1st day of target month
  const targetStartDate = new Date(targetYear, targetMonthIndex, 1);
  
  const priorTransactions = (transactions || []).filter(t => {
    const pId = t.customerId || t.partyId;
    if (pId !== partyId) return false;
    const tDate = new Date(t.date);
    return tDate < targetStartDate;
  });

  // 2. Sum prior Udhar (Debit) and prior Jama (Credit)
  const priorGrossUdhar = priorTransactions
    .filter(t => t.type === 'DEBIT' || t.type === 'UDHAR')
    .reduce((sum, t) => sum + (Number(t.amount) || (Number(t.litres || t.liter) * Number(t.rate)) || 0), 0);

  const priorJamaList = deduplicateJamaList(priorTransactions.filter(t => t.type === 'CREDIT' || t.type === 'JAMA'));
  const priorTotalJama = priorJamaList
    .reduce((sum, t) => sum + (Number(t.amount || t.jama) || 0), 0);

  // 3. Prior Month's Closing Balance = Base Opening + Prior Gross Udhar - Prior Total Jama
  return baseOpeningBalance + priorGrossUdhar - priorTotalJama;
};

export default function CustomerLedger() {
  const { selectedDate, setSelectedDate, showToast, stationProfile, customerLedgerState = [] } = useApp();
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roundOff, setRoundOff] = useState('0');

  // Today's active system date helper
  const getTodayStr = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const todayStr = React.useMemo(() => getTodayStr(), []);
  // Use selectedDate if present (supports historical archive dates); fallback to today's date
  const activeSystemDate = selectedDate || todayStr;

  const [filterMode, setFilterMode] = useState('MONTHLY'); // 'MONTHLY' or 'CUSTOM_RANGE'
  const [selectedYearMonth, setSelectedYearMonth] = useState(() => {
    const d = new Date(activeSystemDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [fromDate, setFromDate] = useState(() => activeSystemDate);
  const [toDate, setToDate] = useState(() => activeSystemDate);

  // On opening Customer Ledger module, ensure selectedDate is initialized if missing
  useEffect(() => {
    if (setSelectedDate && !selectedDate) {
      setSelectedDate(todayStr);
    }
  }, [selectedDate, todayStr, setSelectedDate]);

  // Keep filters in sync whenever selectedDate updates (including historical dates)
  useEffect(() => {
    const curDate = selectedDate || todayStr;
    const d = new Date(curDate);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedYearMonth(ym);
    setFromDate(curDate);
    setToDate(curDate);
  }, [selectedDate, todayStr]);

  // Generate historical & future month options
  const availableMonths = React.useMemo(() => {
    const list = [];
    const now = new Date();
    const curYear = now.getFullYear();
    for (let y = curYear - 1; y <= curYear + 1; y++) {
      for (let m = 0; m < 12; m++) {
        const d = new Date(y, m, 1);
        const val = `${y}-${String(m + 1).padStart(2, '0')}`;
        const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        list.push({ val, label, year: y, monthIndex: m });
      }
    }
    return list;
  }, []);

  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showAddTxnModal, setShowAddTxnModal] = useState(false);
  const [showCarryForwardModal, setShowCarryForwardModal] = useState(false);
  const [activeTxnTab, setActiveTxnTab] = useState('DEBIT'); // 'DEBIT' (Udhar) or 'CREDIT' (Jama)

  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '', creditLimit: 50000, openingBalance: '' });

  // Udhar (Debit Fuel) Form State
  const [debitForm, setDebitForm] = useState({
    date: activeSystemDate,
    vehicleNo: '',
    slipNo: '',
    fuelType: 'DIESEL',
    litres: '',
    rate: '90.16',
    amount: '',
    notes: ''
  });

  // Jama (Credit Payment) Form State
  const [creditForm, setCreditForm] = useState({
    date: activeSystemDate,
    paymentMode: 'CASH',
    referenceNo: '',
    notes: '',
    amount: ''
  });

  useEffect(() => {
    let isMounted = true;
    const handleSync = async () => {
      if (!isMounted) return;
      await loadCustomers();
      await loadLedgerEntries();
    };

    handleSync();

    window.addEventListener('ledger_updated', handleSync);

    return () => {
      isMounted = false;
      window.removeEventListener('ledger_updated', handleSync);
    };
  }, []);

  const loadCustomers = async () => {
    let list = await db.customers.toArray();
    if (!list || list.length === 0) {
      list = getMasterParties();
    }
    setCustomers(prev => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list));
    if (list.length > 0 && !selectedCustomerId) {
      setSelectedCustomerId(list[0].id);
    }
  };

  const loadLedgerEntries = async () => {
    await cleanupDuplicateLedgerEntries();
    const records = await db.ledgerEntries.toArray();
    setEntries(records);
  };

  const activeCustomer = customers.find(c => c.id === selectedCustomerId);

  // Merge In-Memory Real-time Section C Creditor Payments with DB entries
  const effectiveEntries = React.useMemo(() => {
    let combined = entries;
    if (customerLedgerState && customerLedgerState.length > 0) {
      const dbIds = new Set(entries.map(e => e.id));
      const liveItems = customerLedgerState.filter(live => !dbIds.has(live.id));
      combined = [...entries, ...liveItems];
    }
    return deduplicateJamaList(combined);
  }, [entries, customerLedgerState]);

  // Dynamic Date & Dual View Range Engine
  const initialBaseOpening = parseFloat(activeCustomer?.openingBalance) || 0;

  let autoOpeningBalance = 0;
  let activePeriodEntries = [];
  let periodLabel = '';
  let targetYear = new Date().getFullYear();
  let targetMonthIndex = new Date().getMonth();

  if (filterMode === 'MONTHLY') {
    const [yStr, mStr] = (selectedYearMonth || '').split('-');
    targetYear = parseInt(yStr, 10) || new Date().getFullYear();
    targetMonthIndex = (parseInt(mStr, 10) || (new Date().getMonth() + 1)) - 1;

    periodLabel = new Date(targetYear, targetMonthIndex, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // Auto Opening Balance for target month
    autoOpeningBalance = getAutoOpeningBalance(effectiveEntries, selectedCustomerId, targetYear, targetMonthIndex, initialBaseOpening);

    // Strict month entries strictly for selectedCustomerId
    activePeriodEntries = effectiveEntries.filter(e => {
      const matchParty = String(e.customerId || e.partyId) === String(selectedCustomerId) ||
        (activeCustomer && e.customerName && activeCustomer.name && e.customerName.trim().toLowerCase() === activeCustomer.name.trim().toLowerCase());
      if (!matchParty) return false;
      if (!e.date) return false;
      const eDate = new Date(e.date);
      return eDate.getFullYear() === targetYear && eDate.getMonth() === targetMonthIndex;
    });
  } else {
    // CUSTOM DATE RANGE MODE
    const fDate = fromDate || selectedDate;
    const tDate = toDate || selectedDate;

    periodLabel = `Statement (${fDate ? new Date(fDate).toLocaleDateString('en-GB') : ''} to ${tDate ? new Date(tDate).toLocaleDateString('en-GB') : ''})`;

    // Calculate Opening Balance strictly before fromDate for selectedCustomerId
    const priorEntries = effectiveEntries.filter(e => {
      const matchParty = String(e.customerId || e.partyId) === String(selectedCustomerId) ||
        (activeCustomer && e.customerName && activeCustomer.name && e.customerName.trim().toLowerCase() === activeCustomer.name.trim().toLowerCase());
      if (!matchParty) return false;
      if (!e.date) return false;
      return new Date(e.date) < new Date(fDate);
    });

    const priorUdhar = priorEntries.filter(e => e.type === 'DEBIT' || e.type === 'UDHAR').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const priorJama = priorEntries.filter(e => e.type === 'CREDIT' || e.type === 'JAMA').reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    autoOpeningBalance = initialBaseOpening + priorUdhar - priorJama;

    // Entries falling strictly between fromDate and toDate for selectedCustomerId
    activePeriodEntries = effectiveEntries.filter(e => {
      const matchParty = String(e.customerId || e.partyId) === String(selectedCustomerId) ||
        (activeCustomer && e.customerName && activeCustomer.name && e.customerName.trim().toLowerCase() === activeCustomer.name.trim().toLowerCase());
      if (!matchParty) return false;
      if (!e.date) return false;
      const eDate = new Date(e.date);
      const startD = new Date(fDate);
      startD.setHours(0, 0, 0, 0);
      const endD = new Date(tDate);
      endD.setHours(23, 59, 59, 999);
      return eDate >= startD && eDate <= endD;
    });
  }

  const rawJamaEntries = activePeriodEntries
    .filter(e => e.type === 'CREDIT' || e.type === 'JAMA')
    .sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.id).localeCompare(String(b.id)));

  const jamaEntriesList = deduplicateJamaList(rawJamaEntries);
  const udharEntriesList = activePeriodEntries
    .filter(e => e.type === 'DEBIT' || e.type === 'UDHAR')
    .sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.id).localeCompare(String(b.id)));

  const totalJama = jamaEntriesList.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
  const grossFuelTotal = udharEntriesList.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
  const totalMonthLitres = udharEntriesList.reduce((acc, curr) => acc + (parseFloat(curr.litres) || 0), 0);

  const parsedRoundOff = parseFloat(roundOff) || 0;
  const finalPayable = grossFuelTotal + autoOpeningBalance - parsedRoundOff - totalJama;

  const monthYearLabel = periodLabel;

  // Next Month calculation for carry forward rollover
  const nextD = new Date(targetYear, targetMonthIndex + 1, 1);
  const nextMonthYearLabel = nextD.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const nextDateString = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}-01`;

  const handleCarryForwardToNextMonth = async () => {
    if (!selectedCustomerId) return;
    try {
      await db.customers.update(selectedCustomerId, { openingBalance: finalPayable });
      setCustomers(prev => prev.map(c => c.id === selectedCustomerId ? { ...c, openingBalance: finalPayable } : c));
      
      if (setSelectedDate) {
        setSelectedDate(nextDateString);
      }

      showToast(`✅ ${monthYearLabel} Closing (₹${finalPayable.toFixed(2)}) successfully set as ${nextMonthYearLabel} Opening Balance!`, 'success');
      setShowCarryForwardModal(false);
      await loadCustomers();
      await loadLedgerEntries();
    } catch (err) {
      showToast('Error carrying forward closing balance: ' + err.message, 'error');
    }
  };

  // Live dynamic balance calculation for any party rendered in left sidebar list
  const getCustomerLiveBalance = React.useCallback((cust) => {
    if (!cust) return 0;
    const baseOp = parseFloat(cust.openingBalance) || 0;
    const autoOp = getAutoOpeningBalance(effectiveEntries, cust.id, targetYear, targetMonthIndex, baseOp);

    const custEntries = effectiveEntries.filter(e => {
      const matchParty = String(e.customerId || e.partyId) === String(cust.id) ||
        (cust.name && e.customerName && e.customerName.trim().toLowerCase() === cust.name.trim().toLowerCase());
      if (!matchParty) return false;
      if (!e.date) return false;
      if (filterMode === 'MONTHLY') {
        const eDate = new Date(e.date);
        return eDate.getFullYear() === targetYear && eDate.getMonth() === targetMonthIndex;
      } else {
        const eDate = new Date(e.date);
        const fDate = fromDate || selectedDate;
        const tDate = toDate || selectedDate;
        const startD = new Date(fDate); startD.setHours(0,0,0,0);
        const endD = new Date(tDate); endD.setHours(23,59,59,999);
        return eDate >= startD && eDate <= endD;
      }
    });

    const uSum = custEntries.filter(e => e.type === 'DEBIT' || e.type === 'UDHAR').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const jList = deduplicateJamaList(custEntries.filter(e => e.type === 'CREDIT' || e.type === 'JAMA'));
    const jSum = jList.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

    const rOff = (cust.id === selectedCustomerId) ? (parseFloat(roundOff) || 0) : 0;

    return uSum + autoOp - rOff - jSum;
  }, [effectiveEntries, filterMode, selectedYearMonth, fromDate, toDate, selectedCustomerId, roundOff, targetYear, targetMonthIndex]);

  // Grand Total Debit (Total Baki) summed across all customer/party accounts
  const grandTotalAllPartiesBaki = React.useMemo(() => {
    if (!customers || customers.length === 0) return 0;
    return customers.reduce((sum, c) => sum + (getCustomerLiveBalance(c) || 0), 0);
  }, [customers, getCustomerLiveBalance]);

  const maxRows = Math.max(jamaEntriesList.length, udharEntriesList.length);

  const handleUpdateOpeningBalance = async (val) => {
    if (!selectedCustomerId) return;
    const num = parseFloat(val) || 0;
    try {
      await db.customers.update(selectedCustomerId, { openingBalance: num });
      setCustomers(prev => prev.map(c => c.id === selectedCustomerId ? { ...c, openingBalance: num } : c));
    } catch (err) {
      console.error('Error updating opening balance:', err);
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name || !newCustomer.name.trim()) {
      showToast('Please enter a customer/party name', 'warning');
      return;
    }
    try {
      const openBal = parseFloat(newCustomer.openingBalance) || 0;
      const newCustRecord = {
        name: newCustomer.name.trim(),
        phone: (newCustomer.phone || '').trim(),
        address: (newCustomer.address || '').trim(),
        creditLimit: parseFloat(newCustomer.creditLimit) || 0,
        openingBalance: openBal,
        currentBalance: openBal,
      };

      let id = Date.now();
      try {
        id = await db.customers.add(newCustRecord);
      } catch (dbErr) {
        newCustRecord.id = id;
      }

      showToast(`Added new customer account: ${newCustRecord.name}`, 'success');
      setShowAddCustomerModal(false);
      setNewCustomer({ name: '', phone: '', address: '', creditLimit: 50000, openingBalance: '' });
      
      let updatedList = [];
      try {
        updatedList = await db.customers.toArray();
      } catch (e) {}

      if (!updatedList || updatedList.length === 0) {
        updatedList = [...customers, { ...newCustRecord, id }];
      }
      setCustomers(updatedList);
      saveMasterParties(updatedList);
      setSelectedCustomerId(id);
    } catch (err) {
      showToast('Error adding customer: ' + err.message, 'error');
    }
  };

  const handleDeleteCustomer = async (customer) => {
    if (!customer) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete customer account "${customer.name}" and ALL transaction history? This action cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      await db.ledgerEntries.where('customerId').equals(customer.id).delete();
      await db.customers.delete(customer.id);
      showToast(`Account "${customer.name}" deleted successfully`, 'success');

      const updatedList = await db.customers.toArray();
      setCustomers(updatedList);
      saveMasterParties(updatedList);
      if (updatedList.length > 0) {
        setSelectedCustomerId(updatedList[0].id);
      } else {
        setSelectedCustomerId(null);
        setEntries([]);
      }
    } catch (err) {
      showToast('Error deleting account: ' + err.message, 'error');
    }
  };

  const handleSaveUdhar = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    try {
      const ltrs = parseFloat(debitForm.litres) || 0;
      const r = parseFloat(debitForm.rate) || 0;
      const amt = parseFloat(debitForm.amount) || (ltrs * r) || 0;

      await db.ledgerEntries.add({
        customerId: selectedCustomerId,
        partyId: selectedCustomerId,
        date: debitForm.date || activeSystemDate,
        type: 'DEBIT',
        amount: amt,
        litres: ltrs,
        rate: r,
        vehicleNo: debitForm.vehicleNo,
        fuelType: debitForm.fuelType,
        slipNo: debitForm.slipNo,
        notes: '', // Keep description strictly empty for Fuel Udhar
      });

      const currentBal = activeCustomer ? activeCustomer.currentBalance || 0 : 0;
      await db.customers.update(selectedCustomerId, { currentBalance: currentBal + amt });

      showToast(`Recorded Fuel Udhar of ₹${amt.toLocaleString()}`, 'success');
      setShowAddTxnModal(false);
      setDebitForm({ date: activeSystemDate, vehicleNo: '', slipNo: '', fuelType: 'DIESEL', litres: '', rate: '90.16', amount: '', notes: '' });
      await loadCustomers();
      await loadLedgerEntries();
    } catch (err) {
      showToast('Error saving Udhar entry: ' + err.message, 'error');
    }
  };

  const handleSaveJama = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    try {
      const amt = parseFloat(creditForm.amount) || 0;

      await db.ledgerEntries.add({
        customerId: selectedCustomerId,
        partyId: selectedCustomerId,
        date: creditForm.date || activeSystemDate,
        type: 'CREDIT',
        amount: amt,
        litres: 0,
        rate: 0,
        vehicleNo: creditForm.referenceNo || 'Payment Jama',
        paymentMode: creditForm.paymentMode,
        slipNo: creditForm.referenceNo,
        notes: creditForm.paymentMode || 'CASH',
      });

      const currentBal = activeCustomer ? activeCustomer.currentBalance || 0 : 0;
      await db.customers.update(selectedCustomerId, { currentBalance: currentBal - amt });

      showToast(`Recorded Jama Payment of ₹${amt.toLocaleString()}`, 'success');
      setShowAddTxnModal(false);
      setCreditForm({ date: activeSystemDate, paymentMode: 'CASH', referenceNo: '', notes: '', amount: '' });
      await loadCustomers();
      await loadLedgerEntries();
    } catch (err) {
      showToast('Error saving Jama entry: ' + err.message, 'error');
    }
  };

  const handleDeleteTransaction = async (entry) => {
    if (!entry) return;
    if (entry.isLive) {
      showToast('This is a live entry from the active shift in Daily Entry Section C. Edit or remove it in Daily Entry.', 'info');
      return;
    }
    const confirmDelete = window.confirm(`Delete entry of ₹${entry.amount} dated ${entry.date}?`);
    if (!confirmDelete) return;

    try {
      await db.ledgerEntries.delete(entry.id);

      const remainingEntries = await db.ledgerEntries.where('customerId').equals(entry.customerId).toArray();
      const updatedBalance = remainingEntries.reduce((acc, curr) => {
        return curr.type === 'DEBIT' ? acc + (curr.amount || 0) : acc - (curr.amount || 0);
      }, 0);

      await db.customers.update(entry.customerId, { currentBalance: updatedBalance });

      showToast('Entry deleted successfully', 'info');
      await loadCustomers();
      await loadLedgerEntries();
    } catch (err) {
      showToast('Error deleting transaction: ' + err.message, 'error');
    }
  };

  // Indian Petrol Pump Replica PDF Generator (A4 Format - 9 Columns without Bank Details)
  const generateCustomerPdfStatement = () => {
    if (!activeCustomer) return;
    try {
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const cleanCustomerName = activeCustomer.name.replace(/[^\w-]/g, '_');
      const filename = `PETROL_PUMP_EXCEL_SHEET_${cleanCustomerName}_${selectedDate}.pdf`;

      // Master Header Row 1: Party Name & Month Period
      doc.setFillColor(248, 250, 252);
      doc.rect(14, 12, pageWidth - 28, 8, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.rect(14, 12, pageWidth - 28, 8, 'S');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(activeCustomer.name, 18, 17.5);
      doc.text(monthYearLabel, pageWidth - 18, 17.5, { align: 'right' });

      // Top Opening Balance Header Bar Row 2
      doc.setFillColor(254, 243, 199); // Amber-100
      doc.rect(14, 20.5, pageWidth - 28, 7.5, 'F');
      doc.setDrawColor(252, 211, 77); // Amber-300
      doc.rect(14, 20.5, pageWidth - 28, 7.5, 'S');
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(120, 53, 15); // Amber-900
      doc.text('OPENING BALANCE (Pichhla Baki / Previous Month Balance):', 18, 25.5);
      doc.text(`Rs. ${autoOpeningBalance.toFixed(2)}`, pageWidth - 18, 25.5, { align: 'right' });

      let startY = 29.5;

      // Table Rows (9 Columns)
      const tableRows = [];

      for (let i = 0; i < maxRows; i++) {
        const jItem = jamaEntriesList[i];
        const uItem = udharEntriesList[i];

        const descText = jItem 
          ? (jItem.notes || jItem.paymentMode || 'Cash Collection')
          : '';

        tableRows.push([
          jItem ? jItem.date : '',
          jItem ? (jItem.amount ? parseFloat(jItem.amount).toFixed(2) : '') : '',
          descText,
          uItem ? uItem.date : '',
          uItem ? (uItem.vehicleNo || '') : '',
          uItem ? (uItem.slipNo || uItem.billNo || '') : '',
          uItem ? (uItem.litres ? parseFloat(uItem.litres).toFixed(2) : '') : '',
          uItem ? (uItem.rate ? parseFloat(uItem.rate).toFixed(2) : (uItem.amount && uItem.litres ? (uItem.amount / uItem.litres).toFixed(2) : '')) : '',
          uItem ? (uItem.amount ? parseFloat(uItem.amount).toFixed(2) : '') : ''
        ]);
      }

      // Append Clean Settlement Footer Rows (No Bank Details)
      // Row 1: Subtotals (Jama, Total Litres & Gross Total)
      tableRows.push([
        'total jama',
        totalJama > 0 ? totalJama.toFixed(2) : '0.00',
        '',
        '',
        '',
        'gross total',
        totalMonthLitres > 0 ? `${totalMonthLitres.toFixed(2)} Ltrs` : '0.00 Ltrs',
        '',
        grossFuelTotal.toFixed(2)
      ]);

      // Row 2: Round Off
      tableRows.push([
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '(-) round off',
        parsedRoundOff.toFixed(2)
      ]);

      // Row 3: Less Jama
      tableRows.push([
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '(-) jama',
        totalJama.toFixed(2)
      ]);

      // Row 5: Total Baki (Final Payable)
      tableRows.push([
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'TOTAL BAKI',
        finalPayable.toFixed(2)
      ]);

      autoTable(doc, {
        startY: startY,
        head: [['date', 'jama', 'description', 'date', 'gadi no', 'bill no', 'liter', 'rate', 'amount']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [241, 245, 249], textColor: 15, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5, textColor: 30 },
        columnStyles: {
          1: { halign: 'right', fontStyle: 'bold', textColor: [4, 120, 87] },
          2: { fontStyle: 'bold', textColor: [71, 85, 105] },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right', fontStyle: 'bold', textColor: [180, 83, 9] }
        },
        margin: { left: 14, right: 14 }
      });

      doc.save(filename);
      showToast('✅ Excel Replica PDF Statement downloaded successfully!', 'success');
    } catch (err) {
      console.error('PDF Statement Error:', err);
      showToast('Error generating PDF statement: ' + err.message, 'error');
    }
  };

  // Print Party Index Summary List PDF Generator (Party Name, Mobile No, Total Baki Rakam)
  const generatePartyIndexPdfSummary = () => {
    try {
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const stationName = stationProfile?.fuelStationName || 'SHITAL PETROL PUMP';

      // Title Header
      doc.setFillColor(15, 23, 42); // Slate-900
      doc.rect(14, 10, pageWidth - 28, 12, 'F');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(`${stationName} - PARTY ACCOUNTS INDEX SUMMARY`, 18, 17.5);
      doc.setFontSize(9);
      doc.text(`Date: ${selectedDate || new Date().toISOString().split('T')[0]}`, pageWidth - 18, 17.5, { align: 'right' });

      const targetList = filteredCustomers && filteredCustomers.length > 0 ? filteredCustomers : customers;
      const tableData = targetList.map((c, idx) => {
        const liveBal = getCustomerLiveBalance(c);
        return [
          idx + 1,
          c.name || 'Unknown Party',
          c.phone || '-',
          `Rs. ${liveBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ];
      });

      // Grand Total Baki Footer Row
      tableData.push([
        '',
        'GRAND TOTAL BAKI (ALL PARTIES)',
        '',
        `Rs. ${grandTotalAllPartiesBaki.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ]);

      autoTable(doc, {
        startY: 26,
        head: [['Sr No', 'Party Name', 'Mobile No.', 'Total Baki Rakam (Rs)']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11], textColor: 255, fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8.5, textColor: 30 },
        columnStyles: {
          0: { cellWidth: 16, halign: 'center' },
          1: { cellWidth: 80, fontStyle: 'bold' },
          2: { cellWidth: 42, halign: 'center' },
          3: { cellWidth: 44, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 },
        didParseCell: (data) => {
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [254, 243, 199];
            data.cell.styles.textColor = [120, 53, 15];
          }
        }
      });

      const fileName = `PARTY_INDEX_SUMMARY_${selectedDate || 'TODAY'}.pdf`;
      doc.save(fileName);
      showToast('✅ Party Index Summary PDF downloaded successfully!', 'success');
    } catch (err) {
      console.error('Party Index PDF Error:', err);
      showToast('Error printing Party Index: ' + err.message, 'error');
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.phone && c.phone.includes(searchQuery)) ||
    (c.address && c.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (c.vehicleNo && c.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-4 space-y-4 animate-fadeIn bg-[#0c121d] min-h-screen text-slate-200 font-sans">
      {/* Main Grid: Left Customer List (3 Cols = 25%), Right Excel Sheet View (9 Cols = 75%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* Left Column: Compact Party List (3 Cols out of 12 = ~25% width) */}
        <div className="lg:col-span-4 xl:col-span-3 bg-[#121927] rounded-xl border border-[#1e293b] p-3.5 space-y-3 shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-[#1e293b]">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <h3 className="text-[13px] font-semibold text-slate-100 tracking-wide">
                Party Accounts ({filteredCustomers.length})
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button"
                onClick={generatePartyIndexPdfSummary}
                className="px-2.5 py-1 rounded-lg bg-[#172033] border border-[#23304a] text-slate-300 hover:text-white hover:bg-[#1f2b45] transition-all active:scale-95 flex items-center gap-1 text-[11px] font-semibold"
                title="Print Party Index Summary List"
              >
                <Printer className="w-3.5 h-3.5 text-slate-400" />
                <span>Print Index</span>
              </button>
              <button type="button"
                onClick={() => setShowAddCustomerModal(true)}
                className="btn-save-cta !py-1 !px-2.5 !text-[11px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Party</span>
              </button>
            </div>
          </div>

          {/* Grand Total All Parties Outstanding Baki Summary Card */}
          <div className="totalizer-banner">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-400" />
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Total Baki (All Parties):
              </span>
            </div>
            <span className="text-amber-400 font-bold font-mono text-[13px] tabular-nums select-text">
              ₹{grandTotalAllPartiesBaki.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search customer name or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#172033] border border-[#23304a] focus:border-blue-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 font-medium outline-none transition-all"
            />
          </div>

          <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
            {filteredCustomers.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs font-mono">No customer accounts found.</div>
            ) : (
              filteredCustomers.map((c) => {
                const isActive = c.id === selectedCustomerId;
                const liveBal = getCustomerLiveBalance(c);
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCustomerId(c.id)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isActive
                        ? 'bg-[#192438] border-l-2 border-l-blue-500 border-[#23304a] text-white shadow-sm'
                        : 'bg-[#0e1420] border-[#1b2537] text-slate-300 hover:border-slate-700 hover:bg-[#131b29]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-xs text-slate-100">{c.name}</h4>
                      <span className={`text-xs font-mono tabular-nums font-bold select-text ${liveBal > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        ₹{liveBal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                      <span>{c.phone || 'No Phone'}</span>
                      <span className="select-text truncate max-w-[120px]">{c.address || 'Kheralu'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: UNIFIED SINGLE EXCEL SPREADSHEET TABLE (9 Cols = 75% width) */}
        <div className="lg:col-span-8 xl:col-span-9 bg-[#121927] rounded-xl border border-[#1e293b] p-3.5 space-y-3 shadow-lg">
          {activeCustomer ? (
            <>
              {/* Active Party Top Action Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2.5 border-b border-[#1e293b]">
                <div className="text-xs font-mono text-slate-300">
                  <span>Selected Party: <strong className="text-slate-100 text-[13px] font-sans font-semibold">{activeCustomer.name}</strong></span>
                  <span className="ml-3 text-slate-400">Phone: {activeCustomer.phone || '-'}</span>
                  {activeCustomer.address && <span className="ml-3 text-slate-400 font-sans">Address: {activeCustomer.address}</span>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button"
                    onClick={() => handleDeleteCustomer(activeCustomer)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-900/50 bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 font-semibold text-xs transition-all active:scale-95"
                    title="Delete Customer Account"
                  >
                    <Trash2 size={14} className="text-rose-400" />
                    <span>Delete Account</span>
                  </button>

                  <button type="button"
                    onClick={generateCustomerPdfStatement}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172033] border border-[#23304a] text-slate-200 hover:bg-[#1f2b45] text-xs font-semibold transition-all active:scale-95"
                    title="Print Excel-Style PDF Statement"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-400" />
                    <span>Print Statement</span>
                  </button>

                  <button type="button"
                    onClick={() => {
                      const curDate = (selectedDate && selectedDate >= todayStr) ? selectedDate : todayStr;
                      setDebitForm(prev => ({ ...prev, date: curDate }));
                      setCreditForm(prev => ({ ...prev, date: curDate }));
                      setShowAddTxnModal(true);
                    }}
                    className="btn-save-cta"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record Entry</span>
                  </button>
                </div>
              </div>

              {/* HISTORICAL ARCHIVE & CUSTOM DATE-RANGE FILTER TOOLBAR */}
              <div className="bg-[#0e1420] border border-[#1b2537] rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilterMode('MONTHLY')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      filterMode === 'MONTHLY'
                        ? 'bg-[#192438] text-white border border-blue-500/50 shadow-xs'
                        : 'bg-[#172033] border border-[#23304a] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Monthly Archive</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('CUSTOM_RANGE')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      filterMode === 'CUSTOM_RANGE'
                        ? 'bg-[#192438] text-white border border-blue-500/50 shadow-xs'
                        : 'bg-[#172033] border border-[#23304a] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>Custom Date Range</span>
                  </button>
                </div>

                {filterMode === 'MONTHLY' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs font-medium">Select Archive Month:</span>
                    <select
                      value={selectedYearMonth}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedYearMonth(val);
                        if (val && setSelectedDate) {
                          const [y, m] = val.split('-');
                          setSelectedDate(`${y}-${m.padStart(2, '0')}-01`);
                        }
                      }}
                      className="bg-[#172033] border border-[#23304a] rounded-md px-2.5 py-1 text-xs font-mono font-medium text-slate-100 outline-none focus:border-blue-500 cursor-pointer"
                    >
                      {availableMonths.map((m) => (
                        <option key={m.val} value={m.val} className="bg-[#121927] text-slate-200">
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 text-xs font-medium">From:</span>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="bg-[#172033] border border-[#23304a] rounded-md px-2 py-1 text-xs font-mono font-medium text-slate-100 outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 text-xs font-medium">To:</span>
                      <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="bg-[#172033] border border-[#23304a] rounded-md px-2 py-1 text-xs font-mono font-medium text-slate-100 outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* UNIFIED SINGLE CONTINUOUS EXCEL SPREADSHEET TABLE (10 COLUMNS WITH DESCRIPTION) */}
              <div className="overflow-x-auto border border-[#1e293b] rounded-lg shadow-md bg-[#0e1420] select-text">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <colgroup>
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '1%' }} />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '100px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '50px' }} />
                  </colgroup>

                  {/* EXCEL SHEET MASTER HEADER */}
                  <thead>
                    {/* Row 1: Customer Name & Period Header */}
                    <tr className="bg-[#0f1726] border-b border-[#1e293b] text-slate-200 font-semibold text-xs">
                      <th colSpan="3" className="p-2 border-r border-[#1e293b] text-left text-[13px] font-semibold text-slate-100">
                        {activeCustomer.name}
                      </th>
                      <th colSpan="7" className="p-2 text-right font-mono text-xs font-medium text-slate-400 uppercase">
                        Period: {periodLabel}
                      </th>
                    </tr>

                    {/* Row 2: PROMINENT TOP OPENING BALANCE BAR */}
                    <tr className="bg-[#172033]/70 border-b border-[#1e293b] text-amber-300 font-semibold">
                      <th colSpan="10" className="px-3 py-1.5 text-xs font-semibold">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-amber-300 uppercase tracking-wide text-xs">
                            <span>🗓️</span>
                            <span>OPENING BALANCE ({filterMode === 'MONTHLY' ? 'Pichhla Baki / Previous Month Balance' : 'Carried Forward as of ' + (fromDate ? new Date(fromDate).toLocaleDateString('en-GB') : '')})</span>
                          </span>
                          <div className="flex items-center gap-1.5 font-mono font-bold text-sm text-amber-300">
                            <span className="text-amber-400 font-sans font-bold">₹</span>
                            <span className="select-text font-bold px-2 py-0.5 bg-[#0e1420] border border-amber-500/30 rounded font-mono text-amber-400 tabular-nums">
                              {Number(autoOpeningBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </th>
                    </tr>

                    {/* Row 3: Unified Single Table Column Sub-Headers (10 COLUMNS) */}
                    <tr className="border-b border-[#1e293b] text-[11px] font-semibold uppercase tracking-wider">
                      {/* JAMA SECTION (Col 1-2) */}
                      <th className="p-2 border-r border-[#1e293b] bg-[#103a27]/60 text-[#34d399] text-center w-28">date</th>
                      <th className="p-2 border-r border-[#1e293b] bg-[#103a27]/60 text-[#34d399] text-right w-24">jama</th>

                      {/* DESCRIPTION SECTION (Col 3 - SHRUNK TO 1%) */}
                      <th 
                        className="p-2 border-r border-[#1e293b] bg-slate-900/60 text-slate-400 text-left w-1 whitespace-nowrap"
                        style={{ width: '1%', whiteSpace: 'nowrap' }}
                      >
                        description
                      </th>

                      {/* UDHAR / FUEL SECTION (Col 4-9) */}
                      <th className="p-2 border-r border-[#1e293b] bg-[#422c0d]/60 text-[#fbbf24] text-center w-28">date</th>
                      <th className="p-2 border-r border-[#1e293b] bg-[#422c0d]/60 text-[#fbbf24] text-center w-28">gadi no</th>
                      <th className="p-2 border-r border-[#1e293b] bg-[#422c0d]/60 text-[#fbbf24] text-center w-24">bill no</th>
                      <th className="p-2 border-r border-[#1e293b] bg-[#422c0d]/60 text-[#fbbf24] text-right w-24">liter</th>
                      <th className="p-2 border-r border-[#1e293b] bg-[#422c0d]/60 text-[#fbbf24] text-right w-20">rate</th>
                      <th className="p-2 border-r border-[#1e293b] bg-[#422c0d]/60 text-[#fbbf24] text-right w-28">amount</th>

                      {/* ACTION (Col 10) */}
                      <th className="p-2 bg-slate-900/60 text-slate-400 text-center w-12">act</th>
                    </tr>
                  </thead>

                  {/* SINGLE UNIFIED DATA ROWS */}
                  <tbody className="divide-y divide-[#1b2537] font-mono text-xs text-slate-200">
                    {maxRows === 0 || (jamaEntriesList.length === 0 && udharEntriesList.length === 0) ? (
                      <tr>
                        <td colSpan="10" className="p-6 text-center text-slate-500 font-sans font-medium">No ledger transactions recorded for this customer in {monthYearLabel} yet.</td>
                      </tr>
                    ) : (
                      Array.from({ length: maxRows }).map((_, index) => {
                        const jItem = jamaEntriesList[index];
                        const uItem = udharEntriesList[index];

                        const descText = jItem 
                          ? (jItem.notes || jItem.paymentMode || 'Cash Collection')
                          : '';

                        return (
                          <tr key={jItem?.id || uItem?.id || `row-${index}`} className="hover:bg-[#131b29] transition-colors">
                            {/* Jama Date */}
                            <td className="p-1.5 border-r border-[#1b2537] text-slate-300 text-center w-28 select-text font-sans text-xs">
                              {jItem ? jItem.date : ''}
                            </td>

                            {/* Jama Amount */}
                            <td className="p-1.5 border-r border-[#1b2537] text-right font-mono font-semibold text-emerald-400 tabular-nums w-24 select-text">
                              {jItem ? (jItem.amount ? parseFloat(jItem.amount).toFixed(2) : '') : ''}
                            </td>

                            {/* Description / Remarks - Force Shrunk Width */}
                            <td 
                              className="w-1 whitespace-nowrap px-2.5 py-1.5 border-r border-[#1b2537] font-sans text-xs text-slate-300 select-text"
                              style={{ width: '1%', whiteSpace: 'nowrap' }}
                            >
                              {descText}
                            </td>

                            {/* Udhar Date */}
                            <td className="p-1.5 border-r border-[#1b2537] text-slate-300 text-center w-28 select-text font-sans text-xs">
                              {uItem ? uItem.date : ''}
                            </td>

                            {/* Gadi No */}
                            <td className="p-1.5 border-r border-[#1b2537] text-center font-mono text-slate-200 w-28 select-text">
                              {uItem ? uItem.vehicleNo || '' : ''}
                            </td>

                            {/* Bill No */}
                            <td className="p-1.5 border-r border-[#1b2537] text-center font-mono font-medium text-blue-400 w-24 select-text">
                              {uItem ? uItem.slipNo || uItem.billNo || '' : ''}
                            </td>

                            {/* Liter */}
                            <td className="p-1.5 border-r border-[#1b2537] text-right font-mono tabular-nums text-slate-200 w-24 select-text">
                              {uItem ? (uItem.litres ? parseFloat(uItem.litres).toFixed(2) : '') : ''}
                            </td>

                            {/* Rate */}
                            <td className="p-1.5 border-r border-[#1b2537] text-right font-mono tabular-nums text-slate-400 w-20 select-text">
                              {uItem ? (uItem.rate ? parseFloat(uItem.rate).toFixed(2) : (uItem.amount && uItem.litres ? (uItem.amount / uItem.litres).toFixed(2) : '')) : ''}
                            </td>

                            {/* Amount */}
                            <td className="p-1.5 border-r border-[#1b2537] text-right font-mono tabular-nums font-semibold text-amber-300 w-28 select-text">
                              {uItem ? (uItem.amount ? parseFloat(uItem.amount).toFixed(2) : '') : ''}
                            </td>

                            {/* Row Action (Delete) */}
                            <td className="p-1.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {jItem && (
                                  <button type="button"
                                    onClick={() => handleDeleteTransaction(jItem)}
                                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded"
                                    title="Delete Jama Entry"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                                {uItem && (
                                  <button type="button"
                                    onClick={() => handleDeleteTransaction(uItem)}
                                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded"
                                    title="Delete Fuel Entry"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {/* CLEAN FINANCIAL SETTLEMENT SUMMARY FOOTER */}
                  <tfoot className="border-t border-[#1e293b] font-mono text-xs font-semibold text-slate-200 bg-[#0f1726]">
                    
                    {/* Row 1: Subtotal Jama, Total Litres & Gross Total */}
                    <tr className="border-b border-[#1e293b]">
                      <td className="p-2 border-r border-[#1e293b] text-center"></td>
                      <td className="p-2 border-r border-[#1e293b] text-right text-emerald-400 font-bold select-text tabular-nums">
                        {totalJama > 0 ? totalJama.toFixed(2) : '0.00'}
                      </td>
                      <td colSpan="4" className="p-2 border-r border-[#1e293b] text-right font-sans font-medium text-slate-400 uppercase text-[11px]">
                        Gross Total ({filterMode === 'MONTHLY' ? 'This Month' : 'Selected Period'}):
                      </td>
                      <td className="p-2 border-r border-[#1e293b] text-right font-mono font-semibold text-slate-200 select-text tabular-nums">
                        {totalMonthLitres > 0 ? totalMonthLitres.toFixed(2) : '0.00'} Ltrs
                      </td>
                      <td className="p-2 border-r border-[#1e293b] text-right"></td>
                      <td className="p-2 border-r border-[#1e293b] text-right font-bold text-slate-100 select-text tabular-nums">
                        ₹ {grossFuelTotal.toFixed(2)}
                      </td>
                      <td className="p-2"></td>
                    </tr>

                    {/* Row 2: Round Off */}
                    <tr className="border-b border-[#1e293b] font-normal">
                      <td colSpan="2" className="p-2 border-r border-[#1e293b]"></td>
                      <td colSpan="5" className="p-2 border-r border-[#1e293b] text-right font-sans font-medium text-slate-400 uppercase text-[11px]">
                        (-) Round Off:
                      </td>
                      <td colSpan="2" className="p-2 border-r border-[#1e293b] text-right font-semibold text-amber-300">
                        <div className="flex justify-end items-center gap-1">
                          <span className="text-slate-400 font-sans font-bold">₹</span>
                          <NumericInput
                            placeholder="0"
                            value={roundOff}
                            onChange={(val) => setRoundOff(val)}
                            className="w-24 input-cell"
                          />
                        </div>
                      </td>
                      <td className="p-2"></td>
                    </tr>

                    {/* Row 3: Less Jama */}
                    <tr className="border-b border-[#1e293b] font-normal">
                      <td colSpan="2" className="p-2 border-r border-[#1e293b]"></td>
                      <td colSpan="5" className="p-2 border-r border-[#1e293b] text-right font-sans font-medium text-slate-400 uppercase text-[11px]">
                        (-) Jama ({filterMode === 'MONTHLY' ? 'This Month' : 'Selected Period'}):
                      </td>
                      <td colSpan="2" className="p-2 border-r border-[#1e293b] text-right font-bold text-emerald-400 select-text tabular-nums">
                        ₹ {totalJama.toFixed(2)}
                      </td>
                      <td className="p-2"></td>
                    </tr>

                    {/* Row 4: Total Baki (FINAL PAYABLE) - Highlighted Row */}
                    <tr className="bg-[#121927] text-white font-bold border-b border-[#1e293b]">
                      <td colSpan="2" className="p-2 border-r border-[#1e293b]"></td>
                      <td colSpan="5" className="p-2 border-r border-[#1e293b] text-right font-sans font-semibold text-amber-400 text-xs tracking-wider uppercase">
                        TOTAL BAKI ({filterMode === 'MONTHLY' ? 'FINAL PAYABLE' : 'AS ON TO-DATE'}):
                      </td>
                      <td colSpan="2" className="p-2 border-r border-[#1e293b] text-right font-bold font-mono text-sm text-amber-300 select-text tabular-nums">
                        ₹ {finalPayable.toFixed(2)}
                      </td>
                      <td className="p-2"></td>
                    </tr>

                  </tfoot>
                </table>
              </div>

              {/* CARRY FORWARD ACTION BUTTON BELOW TABLE */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowCarryForwardModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-1.5 px-3.5 rounded-lg shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <ArrowRightCircle size={15} />
                  <span>🔄 Shift To Next Month</span>
                </button>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-500 text-xs font-medium space-y-3">
              <p>Select a party account from the left list or create a new account.</p>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(true)}
                className="btn-save-cta !inline-flex !items-center !gap-1.5 mx-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Party Account</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add Customer / Party Modal */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#121927] border border-[#1e293b] rounded-xl p-5 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-100 tracking-wide">Add Customer / Party Account</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleAddCustomer(e); }} className="space-y-3 text-xs font-medium">
              <div>
                <label className="block text-slate-300 mb-1">Customer / Fleet Owner Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mohanbhai Dayabhai Patel"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full bg-[#172033] border border-[#23304a] rounded-lg p-2 text-slate-100 outline-none font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Phone Number</label>
                <input
                  type="text"
                  placeholder="9876543210"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="w-full bg-[#172033] border border-[#23304a] rounded-lg p-2 text-slate-100 outline-none font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Customer Address / City</label>
                <input
                  type="text"
                  placeholder="e.g. Station Road, Kheralu, Mehsana"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  className="w-full bg-[#172033] border border-[#23304a] rounded-lg p-2 text-slate-100 outline-none font-medium focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">Opening Balance (Pichhla Baki ₹)</label>
                <NumericInput
                  placeholder="0.00"
                  value={newCustomer.openingBalance}
                  onChange={(val) => setNewCustomer({ ...newCustomer, openingBalance: val })}
                  className="w-full bg-[#172033] border border-[#23304a] rounded-lg p-2 text-amber-400 outline-none font-mono font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1e293b]">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#172033] border border-[#23304a] text-slate-300 font-semibold hover:bg-[#1f2b45] text-xs transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-save-cta"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Entry Modal with Dual Action Tabs: Udhar (Debit Fuel) & Jama (Credit Payment) */}
      {showAddTxnModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#121927] border border-[#1e293b] rounded-xl p-5 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#1e293b]">
              <h3 className="text-sm font-semibold text-slate-100">Record Khata Entry ({activeCustomer?.name})</h3>
              <div className="text-xs font-mono font-bold text-amber-400">
                Total Baki: ₹{finalPayable.toFixed(2)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 bg-[#0e1420] rounded-lg border border-[#1b2537] text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTxnTab('DEBIT')}
                className={`py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all ${
                  activeTxnTab === 'DEBIT'
                    ? 'bg-[#422c0d] text-[#fbbf24] border border-[#b45309]/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>ADD DEBIT ENTRY (UDHAR)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTxnTab('CREDIT')}
                className={`py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all ${
                  activeTxnTab === 'CREDIT'
                    ? 'bg-[#103a27] text-[#34d399] border border-[#15803d]/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>ADD CREDIT ENTRY (JAMA)</span>
              </button>
            </div>

            {/* TAB 1: UDHAR ENTRY (FUEL DISPENSE) FORM */}
            {activeTxnTab === 'DEBIT' && (
              <form onSubmit={(e) => { e.preventDefault(); handleSaveUdhar(e); }} className="space-y-3 text-xs font-medium">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">Entry Date</label>
                    <input
                      type="date"
                      required
                      value={debitForm.date || activeSystemDate}
                      onChange={(e) => setDebitForm({ ...debitForm, date: e.target.value })}
                      className="w-full bg-[#172033] border border-[#23304a] rounded-lg p-2 text-slate-100 outline-none font-mono focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Fuel Product</label>
                    <select
                      value={debitForm.fuelType}
                      onChange={(e) => {
                        const product = e.target.value;
                        let r = '90.16';
                        if (product === 'PETROL') r = '94.48';
                        if (product === 'DIESEL') r = '90.16';
                        if (product === 'SPEED') r = '102.50';
                        if (product === 'CNG') r = '75.80';
                        setDebitForm({ ...debitForm, fuelType: product, rate: r });
                      }}
                      className="w-full bg-[#172033] border border-[#23304a] rounded-lg p-2 text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="PETROL">PETROL</option>
                      <option value="DIESEL">DIESEL</option>
                      <option value="SPEED">SPEED</option>
                      <option value="CNG">CNG</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">Gadi No (Vehicle No)</label>
                    <input
                      type="text"
                      placeholder="e.g. 6152"
                      value={debitForm.vehicleNo}
                      onChange={(e) => setDebitForm({ ...debitForm, vehicleNo: e.target.value })}
                      className="w-full bg-[#172033] border border-[#23304a] rounded-lg p-2 text-slate-100 outline-none font-mono uppercase focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Bill No</label>
                    <input
                      type="text"
                      placeholder="e.g. 1160"
                      value={debitForm.slipNo}
                      onChange={(e) => setDebitForm({ ...debitForm, slipNo: e.target.value })}
                      className="w-full bg-[#172033] border border-[#23304a] rounded-lg p-2 text-slate-100 outline-none font-mono focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">Liter</label>
                    <NumericInput
                      placeholder="143.95"
                      value={debitForm.litres}
                      onChange={(val) => {
                        const ltrs = parseFloat(val) || 0;
                        const r = parseFloat(debitForm.rate) || 0;
                        const calcAmt = ltrs > 0 && r > 0 ? (ltrs * r).toFixed(2) : debitForm.amount;
                        setDebitForm({ ...debitForm, litres: val, amount: calcAmt });
                      }}
                      className="w-full input-cell !text-left font-bold text-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Rate (₹)</label>
                    <NumericInput
                      placeholder="90.16"
                      value={debitForm.rate}
                      onChange={(val) => {
                        const r = parseFloat(val) || 0;
                        const ltrs = parseFloat(debitForm.litres) || 0;
                        const calcAmt = ltrs > 0 && r > 0 ? (ltrs * r).toFixed(2) : debitForm.amount;
                        setDebitForm({ ...debitForm, rate: val, amount: calcAmt });
                      }}
                      className="w-full input-cell !text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Amount (₹)</label>
                    <NumericInput
                      required
                      placeholder="14094.14"
                      value={debitForm.amount}
                      onChange={(val) => setDebitForm({ ...debitForm, amount: val })}
                      className="w-full input-cell !text-left font-bold text-amber-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1e293b]">
                  <button
                    type="button"
                    onClick={() => setShowAddTxnModal(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#172033] border border-[#23304a] text-slate-300 font-semibold hover:bg-[#1f2b45] text-xs transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-save-cta"
                  >
                    Save Debit Entry
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: JAMA ENTRY (PAYMENT RECEIVED) FORM */}
            {activeTxnTab === 'CREDIT' && (
              <form onSubmit={(e) => { e.preventDefault(); handleSaveJama(e); }} className="space-y-3 text-xs font-medium">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">Payment Date</label>
                    <input
                      type="date"
                      required
                      value={creditForm.date || activeSystemDate}
                      onChange={(e) => setCreditForm({ ...creditForm, date: e.target.value })}
                      className="w-full bg-[#172033] border border-[#23304a] rounded-lg p-2 text-slate-100 outline-none font-mono focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Payment Mode</label>
                    <select
                      value={creditForm.paymentMode}
                      onChange={(e) => setCreditForm({ ...creditForm, paymentMode: e.target.value })}
                      className="w-full bg-[#172033] border border-[#23304a] rounded-lg p-2 text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="CASH">CASH</option>
                      <option value="CHEQUE">CHEQUE</option>
                      <option value="UPI">UPI</option>
                      <option value="RTGS/NEFT">RTGS/NEFT</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">Ref / Slip / Cheque No</label>
                    <input
                      type="text"
                      placeholder="e.g. CHQ-8849 / UPI-9921"
                      value={creditForm.referenceNo}
                      onChange={(e) => setCreditForm({ ...creditForm, referenceNo: e.target.value })}
                      className="w-full bg-[#172033] border border-[#23304a] rounded-lg p-2 text-slate-100 outline-none font-mono focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1">Jama Amount (₹)</label>
                    <NumericInput
                      required
                      placeholder="0.00"
                      value={creditForm.amount}
                      onChange={(val) => setCreditForm({ ...creditForm, amount: val })}
                      className="w-full input-cell !text-left font-bold text-emerald-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1e293b]">
                  <button
                    type="button"
                    onClick={() => setShowAddTxnModal(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#172033] border border-[#23304a] text-slate-300 font-semibold hover:bg-[#1f2b45] text-xs transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-save-cta"
                  >
                    Save Credit Entry
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* CONFIRMATION POPUP MODAL: MONTH-END CLOSING ROLLOVER */}
      {showCarryForwardModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-[#121927] border border-[#1e293b] rounded-xl p-5 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400 border-b border-[#1e293b] pb-2.5">
              <RotateCw className="w-5 h-5 text-amber-400 animate-spin-slow" />
              <h3 className="text-sm font-semibold text-slate-100">Confirm Month-End Closing & Rollover</h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to carry forward the final closing balance of{' '}
              <span className="text-emerald-400 font-bold font-mono text-xs">₹ {finalPayable.toFixed(2)}</span>{' '}
              from <span className="font-semibold text-slate-100">{monthYearLabel}</span> as the starting opening balance for{' '}
              <span className="font-semibold text-slate-100">{nextMonthYearLabel}</span>?
            </p>

            <div className="bg-[#0e1420] border border-[#1b2537] rounded-lg p-3 text-xs font-medium text-slate-400 space-y-1.5">
              <div className="flex justify-between">
                <span>Party Account:</span>
                <span className="font-semibold text-slate-200">{activeCustomer?.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Current Closing Period:</span>
                <span className="font-semibold text-slate-200">{monthYearLabel}</span>
              </div>
              <div className="flex justify-between border-t border-[#1e293b] pt-1.5">
                <span>Carried-Forward Opening Balance:</span>
                <span className="font-bold text-emerald-400 font-mono text-xs">₹ {finalPayable.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1e293b]">
              <button
                type="button"
                onClick={() => setShowCarryForwardModal(false)}
                className="bg-[#172033] hover:bg-[#1f2b45] text-slate-300 font-semibold px-4 py-1.5 rounded-lg text-xs transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCarryForwardToNextMonth}
                className="btn-save-cta"
              >
                Confirm Rollover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
