import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/database';
import {
  BarChart3,
  Plus,
  Trash2,
  Download,
  Save,
  Printer,
  Calendar,
  Fuel,
  TrendingUp,
  Coins,
  Receipt,
  FileSpreadsheet,
  Calculator,
  Scale,
  Activity,
  History
} from 'lucide-react';
import NumericInput from '../common/NumericInput';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const FUEL_PRODUCTS = [
  { key: 'petrol', name: 'PETROL (MS)', unit: 'L', defaultRate: 94.48, color: 'text-orange-600', bg: 'bg-orange-50' },
  { key: 'diesel', name: 'DIESEL (HSD)', unit: 'L', defaultRate: 90.16, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'cng', name: 'CNG', unit: 'KG', defaultRate: 75.80, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'smartFuel', name: 'SMART FUEL (SPEED)', unit: 'L', defaultRate: 104.50, color: 'text-purple-600', bg: 'bg-purple-50' },
];

const SAMPLE_MAY_PETROL_ROWS = [
  { date: '2026-05-01', cashSale: 1914.90, debit: 0, rate: 94.48 },
  { date: '2026-05-02', cashSale: 1258.62, debit: 0, rate: 94.48 },
  { date: '2026-05-03', cashSale: 1205.69, debit: 0, rate: 94.48 },
  { date: '2026-05-04', cashSale: 816.77, debit: 0, rate: 94.48 },
  { date: '2026-05-05', cashSale: 780.99, debit: 0, rate: 94.48 },
  { date: '2026-05-06', cashSale: 1397.87, debit: 0, rate: 94.48 },
  { date: '2026-05-07', cashSale: 1625.01, debit: 0, rate: 94.48 },
];

const getLastDayOfMonth = (yearMonthStr) => {
  const [y, m] = (yearMonthStr || '').split('-');
  const lastDay = new Date(parseInt(y, 10) || 2026, parseInt(m, 10) || 8, 0).getDate();
  return String(lastDay).padStart(2, '0');
};

export default function SellPatrak() {
  const { selectedDate, showToast, stationProfile, sellPatrakLiveFeed, cngDispensedLive = 0 } = useApp();
  const [activeProductKey, setActiveProductKey] = useState('petrol');
  const [loading, setLoading] = useState(true);

  // Month-Year Filter
  const [selectedYearMonth, setSelectedYearMonth] = useState(() => {
    const d = new Date(selectedDate || Date.now());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Custom Date Range State for CNG Reconciliation
  const [cngFromDate, setCngFromDate] = useState(() => `${selectedYearMonth}-01`);
  const [cngToDate, setCngToDate] = useState(() => `${selectedYearMonth}-${getLastDayOfMonth(selectedYearMonth)}`);

  // Saved Reconciliations History state
  const [savedReconciliations, setSavedReconciliations] = useState([]);
  const [selectedSavedRecId, setSelectedSavedRecId] = useState('');

  // State Dictionary per Product: { petrol: [rows], diesel: [rows], ... }
  const [sellPatrakData, setSellPatrakData] = useState({
    petrol: [],
    diesel: [],
    cng: [],
    cngSale: [],
    smartFuel: []
  });

  // CNG JMR Month-End Reconciliation Inputs state
  const [cngJmrInputs, setCngJmrInputs] = useState({
    jmrReading: 25000,
    cngRate: 80.44
  });

  const activeProduct = FUEL_PRODUCTS.find(p => p.key === activeProductKey) || FUEL_PRODUCTS[0];

  useEffect(() => {
    let isMounted = true;
    const firstDay = `${selectedYearMonth}-01`;
    const lastDay = `${selectedYearMonth}-${getLastDayOfMonth(selectedYearMonth)}`;
    setCngFromDate(firstDay);
    setCngToDate(lastDay);
    loadSellPatrak(true);

    const handleSync = () => {
      if (!isMounted) return;
      loadSellPatrak(false);
    };

    window.addEventListener('sell_patrak_updated', handleSync);
    window.addEventListener('sell_patrak_sync', handleSync);

    return () => {
      isMounted = false;
      window.removeEventListener('sell_patrak_updated', handleSync);
      window.removeEventListener('sell_patrak_sync', handleSync);
    };
  }, [selectedYearMonth]);

  const loadSellPatrak = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const storageKey = `sell_patrak_${selectedYearMonth}`;
      const rec = await db.settings.get(storageKey);

      // Load Saved Reconciliations History for the active month
      const recKey = `cng_saved_reconciliations_${selectedYearMonth}`;
      const savedRecObj = await db.settings.get(recKey);
      if (savedRecObj && Array.isArray(savedRecObj.data)) {
        setSavedReconciliations(savedRecObj.data);
      } else {
        setSavedReconciliations([]);
      }

      if (rec && rec.data) {
        let loaded = { ...rec.data };
        if (loaded.cngJmrInputs) {
          setCngJmrInputs(loaded.cngJmrInputs);
        } else if (loaded.jmrSettlements && loaded.jmrSettlements.length > 0) {
          setCngJmrInputs({
            jmrReading: loaded.jmrSettlements[0].jmrReading || 25000,
            cngRate: loaded.jmrSettlements[0].cngRate || 80.44
          });
        }
        if (!loaded.cngSale || !Array.isArray(loaded.cngSale)) {
          loaded.cngSale = [];
        }
        setSellPatrakData(prev => (JSON.stringify(prev) === JSON.stringify(loaded) ? prev : loaded));
      } else {
        // Initial default state
        const todayStr = selectedDate || new Date().toISOString().split('T')[0];
        
        const initialData = {
          petrol: [],
          diesel: [],
          cng: [],
          cngSale: [],
          smartFuel: []
        };

        setSellPatrakData(prev => (JSON.stringify(prev) === JSON.stringify(initialData) ? prev : initialData));
      }
    } catch (err) {
      console.error('Error loading sell patrak:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const handleSaveSheet = async (updatedData = sellPatrakData) => {
    try {
      const storageKey = `sell_patrak_${selectedYearMonth}`;
      const saveData = {
        ...updatedData,
        [activeProductKey]: currentRows,
        cngJmrInputs
      };
      await db.settings.put({
        key: storageKey,
        data: saveData,
        updatedAt: new Date().toISOString()
      });
      showToast(`Saved Sell Patrak for ${activeProduct.name}!`, 'success');
    } catch (err) {
      showToast('Error saving sheet: ' + err.message, 'error');
    }
  };

  // Arrow key & Enter keyboard navigation across table input grid
  const handleGridKeyDown = (e) => {
    const key = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) {
      const target = e.target;
      const table = target.closest('table');
      if (!table) return;

      const r = target.getAttribute('data-row');
      const c = target.getAttribute('data-col');
      if (r === null || c === null) return;

      const row = parseInt(r, 10);
      const col = parseInt(c, 10);

      let nextRow = row;
      let nextCol = col;

      if (key === 'ArrowUp') {
        nextRow = row - 1;
      } else if (key === 'ArrowDown' || key === 'Enter') {
        nextRow = row + 1;
      } else if (key === 'ArrowLeft') {
        if (target.selectionStart === 0 || target.selectionStart === null || target.type === 'date') {
          nextCol = col - 1;
        } else return;
      } else if (key === 'ArrowRight') {
        if (target.selectionEnd === target.value.length || target.selectionEnd === null || target.type === 'date') {
          nextCol = col + 1;
        } else return;
      }

      const nextInput = table.querySelector(`[data-row="${nextRow}"][data-col="${nextCol}"]`);
      if (nextInput) {
        e.preventDefault();
        nextInput.focus();
        if (typeof nextInput.select === 'function') {
          nextInput.select();
        }
      }
    }
  };

  const rawRows = sellPatrakData[activeProductKey] || [];

  const currentRows = React.useMemo(() => {
    if (activeProductKey === 'cng') return rawRows;
    const liveProductKey = activeProductKey === 'petrol' ? 'PETROL (MS)' : activeProductKey === 'diesel' ? 'DIESEL (HSD)' : activeProductKey === 'smartFuel' ? 'SMART FUEL' : null;
    const liveProduct = (liveProductKey && sellPatrakLiveFeed) ? sellPatrakLiveFeed[liveProductKey] : null;

    if (!liveProduct) return rawRows;

    let hasSelectedDate = false;
    const updated = rawRows.map(r => {
      if (r.date === selectedDate) {
        hasSelectedDate = true;
        const rate = parseFloat(r.rate) || activeProduct.defaultRate;
        const total = liveProduct.totalDispensed;
        return {
          ...r,
          cashSale: liveProduct.cashLitres,
          debit: liveProduct.debitLitres,
          total: total,
          amount: Number((total * rate).toFixed(2)),
          isLiveSynced: true
        };
      }
      return r;
    });

    if (!hasSelectedDate && selectedDate && selectedYearMonth && selectedDate.startsWith(selectedYearMonth)) {
      const rate = activeProduct.defaultRate;
      const total = liveProduct.totalDispensed;
      updated.push({
        id: `live-sell-${activeProductKey}-${selectedDate}`,
        date: selectedDate,
        cashSale: liveProduct.cashLitres,
        debit: liveProduct.debitLitres,
        total: total,
        rate: rate,
        amount: Number((total * rate).toFixed(2)),
        isLiveSynced: true
      });
    }

    return updated;
  }, [rawRows, activeProductKey, sellPatrakLiveFeed, selectedDate, selectedYearMonth, activeProduct.defaultRate]);

  const handleCellChange = (index, field, value) => {
    const updatedRows = [...currentRows];
    const item = { ...updatedRows[index] };

    if (field === 'date') {
      item[field] = value;
    } else {
      item[field] = value === '' ? 0 : (parseFloat(value) || 0);
    }

    if (activeProductKey === 'cng') {
      // CNG 3-column update (paymentDone, cngSaleKg, cngAmount)
      if (field === 'paymentDone') {
        item.paymentDone = value === '' ? 0 : (parseFloat(value) || 0);
      } else if (field === 'cngSaleKg') {
        const cngKg = value === '' ? 0 : (parseFloat(value) || 0);
        item.cngSaleKg = Number(cngKg.toFixed(2));
      } else if (field === 'cngAmount') {
        const cngAmt = value === '' ? 0 : (parseFloat(value) || 0);
        item.cngAmount = Number(cngAmt.toFixed(2));
      }
    } else {
      const cash = parseFloat(item.cashSale) || 0;
      const deb = parseFloat(item.debit) || 0;
      const r = parseFloat(item.rate) || activeProduct.defaultRate;

      const total = cash + deb;
      const amt = total * r;

      item.total = Number(total.toFixed(2));
      item.amount = Number(amt.toFixed(2));
    }

    updatedRows[index] = item;

    const newData = {
      ...sellPatrakData,
      [activeProductKey]: updatedRows
    };

    setSellPatrakData(newData);
  };

  const handleAddRow = () => {
    const todayStr = selectedDate || new Date().toISOString().split('T')[0];
    let newRow = {};

    if (activeProductKey === 'cng') {
      newRow = {
        id: `cng-${Date.now()}-${Math.random()}`,
        paymentDone: 0,
        cngSaleKg: 0,
        cngAmount: 0
      };
    } else {
      const lastRow = currentRows.length > 0 ? currentRows[currentRows.length - 1] : null;
      const defaultRate = lastRow ? (parseFloat(lastRow.rate) || activeProduct.defaultRate) : activeProduct.defaultRate;

      let nextDate = todayStr;
      if (lastRow && lastRow.date) {
        try {
          const [y, m, d] = lastRow.date.split('-').map(Number);
          const dateObj = new Date(y, m - 1, d);
          dateObj.setDate(dateObj.getDate() + 1);
          const nextY = dateObj.getFullYear();
          const nextM = String(dateObj.getMonth() + 1).padStart(2, '0');
          const nextD = String(dateObj.getDate()).padStart(2, '0');
          nextDate = `${nextY}-${nextM}-${nextD}`;
        } catch (e) {
          nextDate = todayStr;
        }
      }

      newRow = {
        id: `sell-${Date.now()}-${Math.random()}`,
        date: nextDate,
        cashSale: 0,
        debit: 0,
        total: 0,
        rate: defaultRate,
        amount: 0
      };
    }

    const newData = {
      ...sellPatrakData,
      [activeProductKey]: [...currentRows, newRow]
    };

    setSellPatrakData(newData);
    showToast(`Added new entry row to ${activeProduct.name}`, 'info');
  };

  const handleDeleteRow = (index) => {
    const updatedRows = currentRows.filter((_, i) => i !== index);
    const newData = {
      ...sellPatrakData,
      [activeProductKey]: updatedRows
    };
    setSellPatrakData(newData);
    showToast('Row removed from Sell Patrak', 'info');
  };

  // Handlers for Left Panel: "CNG Sale" Register
  const handleCngSaleCellChange = (index, field, value) => {
    const list = [...(sellPatrakData.cngSale || [])];
    const item = { ...list[index] };

    if (field === 'date') {
      item.date = value;
    } else if (field === 'saleKg') {
      const kg = value === '' ? 0 : (parseFloat(value) || 0);
      item.saleKg = kg;
      const r = parseFloat(item.rate) || 80.44;
      item.total = Number((kg * r).toFixed(2));
    } else if (field === 'rate') {
      const r = value === '' ? 0 : (parseFloat(value) || 0);
      item.rate = r;
      const kg = parseFloat(item.saleKg) || 0;
      item.total = Number((kg * r).toFixed(2));
    }

    list[index] = item;
    setSellPatrakData({
      ...sellPatrakData,
      cngSale: list
    });
  };

  const handleAddCngSaleRow = () => {
    const list = sellPatrakData.cngSale || [];
    let nextDate = `${selectedYearMonth}-01`;
    let defaultRate = cngJmrInputs.cngRate || 80.44;

    if (list.length > 0) {
      const last = list[list.length - 1];
      if (last.rate) defaultRate = parseFloat(last.rate) || defaultRate;
      if (last.date) {
        const d = new Date(last.date);
        d.setDate(d.getDate() + 1);
        nextDate = d.toISOString().split('T')[0];
      }
    }

    const newRow = {
      id: Date.now(),
      date: nextDate,
      saleKg: 0,
      rate: defaultRate,
      total: 0
    };

    setSellPatrakData({
      ...sellPatrakData,
      cngSale: [...list, newRow]
    });
    showToast('Added new row to CNG Sale register', 'info');
  };

  const handleDeleteCngSaleRow = (index) => {
    const list = (sellPatrakData.cngSale || []).filter((_, i) => i !== index);
    setSellPatrakData({
      ...sellPatrakData,
      cngSale: list
    });
    showToast('Removed entry from CNG Sale register', 'info');
  };

  // Preset Handlers for Date Range Filter
  const handlePresetRange = (preset) => {
    const lastDay = getLastDayOfMonth(selectedYearMonth);
    if (preset === '15th') {
      setCngFromDate(`${selectedYearMonth}-01`);
      setCngToDate(`${selectedYearMonth}-15`);
    } else if (preset === '16th') {
      setCngFromDate(`${selectedYearMonth}-16`);
      setCngToDate(`${selectedYearMonth}-${lastDay}`);
    } else if (preset === 'full') {
      setCngFromDate(`${selectedYearMonth}-01`);
      setCngToDate(`${selectedYearMonth}-${lastDay}`);
    } else if (preset === 'week') {
      const today = new Date();
      const prior7 = new Date(today);
      prior7.setDate(today.getDate() - 6);
      setCngFromDate(prior7.toISOString().split('T')[0]);
      setCngToDate(today.toISOString().split('T')[0]);
    }
  };

  // Calculations for Standard Totals Footer (Petrol, Diesel, Smart Fuel)
  const totalCashSale = currentRows.reduce((acc, r) => acc + (parseFloat(r.cashSale) || 0), 0);
  const totalDebitSale = currentRows.reduce((acc, r) => acc + (parseFloat(r.debit) || 0), 0);
  const totalVolumeSold = currentRows.reduce((acc, r) => acc + (parseFloat(r.total) || 0), 0);
  const totalRevenueAmount = currentRows.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0);

  // Calculations for CNG Register (Payment Done, Table A & Table B)
  const cngList = sellPatrakData.cng || [];
  const totalPaymentDone = cngList.reduce((acc, r) => acc + (parseFloat(r.paymentDone) || 0), 0);
  const tableA = cngList.reduce((acc, r) => acc + (parseFloat(r.cngSaleKg !== undefined ? r.cngSaleKg : r.cashSale) || 0), 0); // Total CNG Sale (KG)
  const tableB = cngList.reduce((acc, r) => acc + (parseFloat(r.cngAmount !== undefined ? r.cngAmount : r.amount) || 0), 0); // Total CNG Amount (₹)

  // Left Panel CNG Sale Register Totals (with Live Sync from MOD DE active nozzles)
  const rawCngSaleList = sellPatrakData.cngSale || [];
  const effectiveCngSaleList = React.useMemo(() => {
    let hasSelected = false;
    const defaultRate = cngJmrInputs.cngRate || 80.44;
    const updated = rawCngSaleList.map(r => {
      if (r.date === selectedDate && cngDispensedLive > 0) {
        hasSelected = true;
        const rate = parseFloat(r.rate) || defaultRate;
        return {
          ...r,
          saleKg: cngDispensedLive,
          total: Number((cngDispensedLive * rate).toFixed(2)),
          isLiveSynced: true
        };
      }
      return r;
    });

    if (!hasSelected && selectedDate && selectedYearMonth && selectedDate.startsWith(selectedYearMonth) && cngDispensedLive > 0) {
      updated.push({
        id: `live-cng-sale-${selectedDate}`,
        date: selectedDate,
        saleKg: cngDispensedLive,
        rate: defaultRate,
        total: Number((cngDispensedLive * defaultRate).toFixed(2)),
        isLiveSynced: true
      });
    }
    return updated;
  }, [rawCngSaleList, selectedDate, selectedYearMonth, cngDispensedLive, cngJmrInputs.cngRate]);

  const cngSaleList = effectiveCngSaleList;
  const totalCngSaleKg = cngSaleList.reduce((acc, r) => acc + (parseFloat(r.saleKg) || 0), 0);
  const grandTotalCngSaleAmount = cngSaleList.reduce((acc, r) => acc + (parseFloat(r.total) || 0), 0);

  // Right-Panel CNG JMR Reconciliation Math Engine
  const jmrReading = parseFloat(cngJmrInputs.jmrReading) || 0;
  const cngRate = parseFloat(cngJmrInputs.cngRate) || 80.44;

  const Y = jmrReading * cngRate; // Gross Value of Metered Gas
  const C = Y - totalPaymentDone; // Net Final Settlement Amount (C = Gross JMR Value - Total Payment Done)

  // Save Reconciliation Snapshot Handler
  const handleSaveReconciliationRecord = async () => {
    try {
      const record = {
        id: `cng-rec-${cngFromDate}_${cngToDate}-${Date.now()}`,
        fromDate: cngFromDate,
        toDate: cngToDate,
        periodLabel: `${cngFromDate} to ${cngToDate}`,
        savedAt: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        jmrReading,
        cngRate,
        jmrAmount: Y,
        totalPaymentDone,
        totalColA: tableA,
        finalSettlementC: C,
        registerRows: [...cngList]
      };

      const updatedList = [record, ...savedReconciliations];
      setSavedReconciliations(updatedList);
      setSelectedSavedRecId(record.id);

      const storageKey = `cng_saved_reconciliations_${selectedYearMonth}`;
      await db.settings.put({
        key: storageKey,
        data: updatedList,
        updatedAt: new Date().toISOString()
      });

      showToast(`Saved Reconciliation Record for ${record.periodLabel}!`, 'success');
    } catch (err) {
      showToast('Error saving reconciliation record: ' + err.message, 'error');
    }
  };

  const handleLoadSavedReconciliation = (id) => {
    setSelectedSavedRecId(id);
    const rec = savedReconciliations.find(r => r.id === id);
    if (rec) {
      setCngFromDate(rec.fromDate);
      setCngToDate(rec.toDate);
      setCngJmrInputs({
        jmrReading: rec.jmrReading,
        cngRate: rec.cngRate
      });
      if (rec.registerRows && Array.isArray(rec.registerRows)) {
        setSellPatrakData(prev => ({
          ...prev,
          cng: rec.registerRows
        }));
      }
      showToast(`Loaded saved period: ${rec.periodLabel}`, 'info');
    }
  };

  const availableMonths = React.useMemo(() => {
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

  const [yStr, mStr] = (selectedYearMonth || '').split('-');
  const selYear = parseInt(yStr, 10) || new Date().getFullYear();
  const selMonthIndex = (parseInt(mStr, 10) || (new Date().getMonth() + 1)) - 1;
  const monthName = new Date(selYear, selMonthIndex, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Export CSV
  const handleExportCSV = () => {
    if (activeProductKey === 'cng') {
      let csv = `CNG SELL PATRAK & JMR RECONCILIATION - (${monthName.toUpperCase()})\n\n`;
      csv += `RECONCILIATION PERIOD: ${cngFromDate} TO ${cngToDate}\n\n`;

      csv += `--- LEFT PANEL: CNG SALE REGISTER ---\n`;
      csv += `DATE,SALE (KG),RATE (RS),TOTAL (RS)\n`;
      cngSaleList.forEach(r => {
        csv += `"${r.date}",${r.saleKg || 0},${r.rate || 0},${r.total || 0}\n`;
      });
      csv += `"TOTALS:",${totalCngSaleKg.toFixed(2)},-,${grandTotalCngSaleAmount.toFixed(2)}\n\n`;

      csv += `--- RIGHT PANEL: CNG DAILY SALES REGISTER ---\n`;
      csv += `#,,PAYMENT DONE (RS),CNG SALE (KG) [COL A],CNG AMOUNT (RS) [COL B]\n`;
      cngList.forEach((r, i) => {
        csv += `${i + 1},${r.paymentDone || 0},${r.cngSaleKg !== undefined ? r.cngSaleKg : r.cashSale || 0},${r.cngAmount !== undefined ? r.cngAmount : r.amount || 0}\n`;
      });
      csv += `"TOTALS:",${totalPaymentDone.toFixed(2)},${tableA.toFixed(2)},${tableB.toFixed(2)}\n\n`;

      csv += `--- RIGHT PANEL: MONTH-END JMR SETTLEMENT ---\n`;
      csv += `JMR READING (KG),CNG SELLING RATE (RS/KG),GROSS METERED VALUE (RS),NET JMR SETTLEMENT AMOUNT (RS)\n`;
      csv += `${jmrReading},${cngRate},${Y.toFixed(2)},${C.toFixed(2)}\n`;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `CNG_JMR_SELL_PATRAK_${selectedYearMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Exported CNG JMR Sell Patrak to CSV!`, 'success');
      return;
    }

    if (currentRows.length === 0) return;
    let csv = `SELL PATRAK - ${activeProduct.name.toUpperCase()} (${monthName.toUpperCase()})\n`;
    csv += `DATE,CASH SALE (${activeProduct.unit}),DEBIT (${activeProduct.unit}),TOTAL SALE (${activeProduct.unit}),RATE (RS),AMOUNT (RS)\n`;

    currentRows.forEach(r => {
      csv += `"${r.date}",${r.cashSale},${r.debit},${r.total},${r.rate},${r.amount}\n`;
    });

    csv += `TOTALS,${totalCashSale.toFixed(2)},${totalDebitSale.toFixed(2)},${totalVolumeSold.toFixed(2)},-,${totalRevenueAmount.toFixed(2)}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `SELL_PATRAK_${activeProduct.key}_${selectedYearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${activeProduct.name} Sell Patrak to CSV!`, 'success');
  };

  // Printable PDF Statement Generator
  const handlePrintPDF = () => {
    if (activeProductKey === 'cng') {
      try {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(stationProfile?.fuelStationName || 'SHITAL PETROL PUMP', pageWidth / 2, 12, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`CNG DAILY SALES & JMR SETTLEMENT PATRAK — (${monthName.toUpperCase()})`, pageWidth / 2, 18, { align: 'center' });
        doc.setFontSize(8);
        doc.text(`Period: ${cngFromDate} to ${cngToDate}`, pageWidth / 2, 22, { align: 'center' });

        const tableData = cngList.map((r, i) => [
          i + 1,
          `Rs. ${(parseFloat(r.paymentDone) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          (parseFloat(r.cngSaleKg !== undefined ? r.cngSaleKg : r.cashSale) || 0).toFixed(2),
          `Rs. ${(parseFloat(r.cngAmount !== undefined ? r.cngAmount : r.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        ]);

        tableData.push([
          'TOTALS',
          `Rs. ${totalPaymentDone.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          `${tableA.toFixed(2)} KG`,
          `Rs. ${tableB.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        ]);

        autoTable(doc, {
          startY: 26,
          head: [['#', 'PAYMENT DONE (Rs.)', 'CNG SALE (KG) [COL A]', 'CNG AMOUNT (Rs.) [COL B]']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
          styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
        });

        const finalY = (doc).lastAutoTable.finalY + 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('CNG JMR MONTH-END RECONCILIATION & SETTLEMENT', 14, finalY);

        const settHead = [['PARAMETER', 'VALUE']];
        const settBody = [
          ['Reconciliation Period:', `${cngFromDate} to ${cngToDate}`],
          ['Gas Company JMR Meter Reading:', `${jmrReading.toLocaleString('en-IN')} KG`],
          ['CNG Selling Rate:', `Rs. ${cngRate} / KG`],
          ['JMR Amount (Gross Metered Value):', `Rs. ${Y.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
          ['Total Payment Done:', `Rs. ${totalPaymentDone.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
          ['Total Dispensed Volume (Col A):', `${tableA.toFixed(2)} KG`],
          ['FINAL JMR NET SETTLEMENT AMOUNT (C):', `Rs. ${C.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]
        ];

        autoTable(doc, {
          startY: finalY + 3,
          head: settHead,
          body: settBody,
          theme: 'grid',
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2 },
        });

        doc.save(`CNG_JMR_SETTLEMENT_${selectedYearMonth}.pdf`);
        showToast('Generated Printable CNG JMR PDF!', 'success');
        return;
      } catch (err) {
        showToast('Error generating PDF: ' + err.message, 'error');
        return;
      }
    }

    if (currentRows.length === 0) return;
    try {
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(stationProfile?.fuelStationName || 'SHITAL PETROL PUMP', pageWidth / 2, 12, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`DAILY FUEL SELL PATRAK - ${activeProduct.name.toUpperCase()} (${monthName.toUpperCase()})`, pageWidth / 2, 18, { align: 'center' });

      const tableData = currentRows.map((r, i) => [
        i + 1,
        r.date,
        (parseFloat(r.cashSale) || 0).toFixed(2),
        (parseFloat(r.debit) || 0).toFixed(2),
        (parseFloat(r.total) || 0).toFixed(2),
        (parseFloat(r.rate) || 0).toFixed(2),
        `Rs. ${(parseFloat(r.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      ]);

      // Totals footer row
      tableData.push([
        'TOTALS',
        '-',
        totalCashSale.toFixed(2),
        totalDebitSale.toFixed(2),
        totalVolumeSold.toFixed(2),
        '-',
        `Rs. ${totalRevenueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      ]);

      autoTable(doc, {
        startY: 24,
        head: [['#', 'DATE', `CASH SALE (${activeProduct.unit})`, `DEBIT (${activeProduct.unit})`, `TOTAL (${activeProduct.unit})`, 'RATE (Rs.)', 'AMOUNT (Rs.)']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
        styles: { fontSize: 8, cellPadding: 2.5, halign: 'center' },
        columnStyles: {
          0: { w: 10 },
          1: { w: 25 },
          6: { halign: 'right', fontStyle: 'bold' }
        }
      });

      doc.save(`SELL_PATRAK_${activeProduct.key}_${selectedYearMonth}.pdf`);
      showToast('Generated Printable PDF Sell Patrak!', 'success');
    } catch (err) {
      showToast('Error generating PDF: ' + err.message, 'error');
    }
  };

  if (loading) return <div className="p-8 text-center text-sm font-semibold text-slate-400">Loading Sell Patrak Workspace...</div>;

  // Standard input styling
  const numInputClass = "w-full bg-[#172033] text-slate-100 font-mono font-medium placeholder-slate-500 border border-[#23304a] rounded px-2 py-1 text-right text-xs outline-none focus:border-blue-500 select-text";

  return (
    <div className="p-4 space-y-3.5 animate-fadeIn bg-[#0c121d] min-h-screen select-text font-sans text-slate-200">
      {/* Top Action Bar & Month Selector */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-[#121927] p-3 rounded-xl border border-[#1e293b] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-xs text-slate-100 tracking-wide">Daily Fuel Sell Patrak</span>
          </div>

          {/* Month Selector Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#0e1420] border border-[#1b2537] rounded-lg px-2.5 py-1 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 text-xs">Month:</span>
            <select
              value={selectedYearMonth}
              onChange={(e) => setSelectedYearMonth(e.target.value)}
              className="bg-transparent font-medium font-mono text-slate-100 outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m.val} value={m.val} className="bg-[#121927] text-slate-200">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button type="button"
            onClick={activeProductKey === 'cng' ? handleAddCngSaleRow : handleAddRow}
            className="btn-save-cta"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add Daily Entry Row</span>
          </button>

          <button type="button"
            onClick={handlePrintPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172033] border border-[#23304a] hover:bg-[#1f2b45] text-slate-200 font-semibold text-xs transition-all active:scale-95"
          >
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            <span>Print PDF</span>
          </button>

          <button type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172033] border border-[#23304a] hover:bg-[#1f2b45] text-slate-200 font-semibold text-xs transition-all active:scale-95"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>

          <button type="button"
            onClick={() => handleSaveSheet()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Sheet</span>
          </button>
        </div>
      </div>

      {/* 4 Fuel Product Tabs Selector */}
      <div className="flex items-center gap-2 bg-[#121927] p-1.5 rounded-xl border border-[#1e293b] shadow-sm overflow-x-auto select-none">
        {FUEL_PRODUCTS.map((prod) => {
          const isActive = prod.key === activeProductKey;
          const badgeClass = prod.key === 'petrol' ? 'badge-ms' : prod.key === 'diesel' ? 'badge-hsd' : prod.key === 'cng' ? 'badge-cng' : 'bg-[#2c1d47] text-[#c084fc] border border-[#7e22ce]/40 rounded-full px-2 py-0.5 text-[10px]';
          return (
            <button type="button"
              key={prod.key}
              onClick={() => setActiveProductKey(prod.key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all duration-150 whitespace-nowrap ${
                isActive
                  ? 'bg-[#192438] text-white border-l-2 border-blue-500 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#131b29] font-medium'
              }`}
            >
              <Fuel className={`w-3.5 h-3.5 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
              <span>{prod.name}</span>
              <span className={badgeClass}>
                {prod.unit}
              </span>
            </button>
          );
        })}
      </div>

      {/* MAIN WORKSPACE VIEW */}
      {activeProductKey === 'cng' ? (
        /* SPLIT-SCREEN WORKSPACE FOR CNG SECTION */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* LEFT PANEL (~50% WIDTH - lg:col-span-6): CNG Sale REGISTER TABLE */}
          <div className="lg:col-span-6 bg-[#121927] rounded-xl border border-[#1e293b] overflow-hidden shadow-lg p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#1e293b] pb-2.5">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-xs text-slate-100 uppercase tracking-wide">
                  CNG Sale — <span className="text-slate-400 font-normal">Month: {monthName}</span>
                </h3>
              </div>
              <button type="button"
                onClick={handleAddCngSaleRow}
                className="btn-save-cta !py-1 !px-2.5 !text-[11px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Daily Entry Row</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#1e293b] bg-[#0e1420] shadow-md">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="bg-slate-900/60 text-slate-400 text-[11px] font-semibold uppercase tracking-wider border-b border-[#1e293b]">
                    <th className="p-2 border-r border-[#1e293b] w-10 text-center font-mono">#</th>
                    <th className="p-2 border-r border-[#1e293b] w-32">date</th>
                    <th className="p-2 border-r border-[#1e293b] text-right bg-[#103a27]/40 text-[#34d399]">
                      SELL (KG)
                      {cngDispensedLive > 0 && <span className="ml-1 text-[9px] px-1 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-normal">LIVE</span>}
                    </th>
                    <th className="p-2 border-r border-[#1e293b] text-right w-24">rate</th>
                    <th className="p-2 border-r border-[#1e293b] text-right font-semibold">total</th>
                    <th className="p-2 text-center w-12">act</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#1b2537] font-medium select-text font-mono text-xs">
                  {cngSaleList.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-slate-500 font-mono">
                        No CNG Sale entries recorded for {monthName}. Click <strong>"+ Add Daily Entry Row"</strong> to begin.
                      </td>
                    </tr>
                  ) : (
                    cngSaleList.map((row, idx) => {
                      return (
                        <tr key={row.id || `cng-sale-${idx}`} className={`hover:bg-[#131b29] transition-colors ${row.isLiveSynced ? 'bg-emerald-950/10' : ''}`}>
                          <td className="p-2 text-center font-mono text-slate-400 border-r border-[#1b2537]">
                            {idx + 1}
                          </td>
                          <td className="p-1.5 border-r border-[#1b2537]">
                            <input
                              type="date"
                              value={row.date}
                              onChange={(e) => handleCngSaleCellChange(idx, 'date', e.target.value)}
                              onKeyDown={handleGridKeyDown}
                              data-row={idx}
                              data-col={0}
                              className="w-full bg-[#172033] border border-[#23304a] rounded px-2 py-1 font-mono text-xs text-slate-100 outline-none focus:border-blue-500 select-text"
                            />
                          </td>
                          <td className="p-1.5 border-r border-[#1b2537] text-right">
                            <NumericInput
                              step="0.01"
                              value={row.saleKg !== undefined ? row.saleKg : 0}
                              onChange={(v) => handleCngSaleCellChange(idx, 'saleKg', v)}
                              onKeyDown={handleGridKeyDown}
                              data-row={idx}
                              data-col={1}
                              className={`${numInputClass} ${row.isLiveSynced ? '!border-emerald-500/50 !bg-emerald-950/30 text-emerald-300' : ''}`}
                              placeholder="0.00"
                            />
                          </td>
                          <td className="p-1.5 border-r border-[#1b2537] text-right">
                            <NumericInput
                              step="0.01"
                              value={row.rate !== undefined ? row.rate : 80.44}
                              onChange={(v) => handleCngSaleCellChange(idx, 'rate', v)}
                              onKeyDown={handleGridKeyDown}
                              data-row={idx}
                              data-col={2}
                              className={numInputClass}
                              placeholder="80.44"
                            />
                          </td>
                          <td className="p-2 border-r border-[#1b2537] text-right font-mono font-semibold text-emerald-400 tabular-nums">
                            ₹ {Number(row.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-1.5 text-center">
                            <button type="button"
                              onClick={() => handleDeleteCngSaleRow(idx)}
                              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                              title="Delete Row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                <tfoot className="bg-[#0f1726] border-t border-[#1e293b] font-mono text-xs select-text text-slate-200">
                  <tr>
                    <td colSpan="2" className="p-2 text-right font-semibold uppercase font-sans border-r border-[#1e293b] text-[11px] text-slate-400">
                      TOTALS:
                    </td>
                    <td className="p-2 text-right font-bold text-emerald-400 border-r border-[#1e293b] tabular-nums">
                      {totalCngSaleKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG
                    </td>
                    <td className="p-2 border-r border-[#1e293b]"></td>
                    <td className="p-2 text-right font-bold text-slate-100 border-r border-[#1e293b] tabular-nums">
                      ₹ {grandTotalCngSaleAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            
            <div className="flex justify-end pt-1">
              <button type="button"
                onClick={handleAddCngSaleRow}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold text-xs bg-[#172033] hover:bg-[#1f2b45] text-slate-300 border border-[#23304a] transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 text-slate-400" />
                <span>+ Add Daily Entry Row</span>
              </button>
            </div>
          </div>

          {/* RIGHT PANEL (~50% WIDTH - lg:col-span-6): UNIFIED CNG REGISTER & JMR RECONCILIATION CARD */}
          <div className="lg:col-span-6 bg-[#121927] rounded-xl border border-[#1e293b] shadow-lg p-3.5 space-y-3">
            
            {/* Unified Card Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#1e293b] pb-2.5">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-xs text-slate-100 uppercase tracking-wide">
                  CNG REGISTER & JMR RECONCILIATION — <span className="text-slate-400 font-normal">{monthName}</span>
                </h3>
              </div>
              <button type="button"
                onClick={handleAddRow}
                className="btn-save-cta !py-1 !px-2.5 !text-[11px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Entry Row</span>
              </button>
            </div>

            {/* 📅 CUSTOM DATE RANGE TOOLBAR & ACTIONS ROW */}
            <div className="bg-[#0e1420] border border-[#1b2537] p-2.5 rounded-lg space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Date Pickers */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-sans">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-400 uppercase text-[11px]">From:</span>
                    <input
                      type="date"
                      value={cngFromDate}
                      onChange={(e) => setCngFromDate(e.target.value)}
                      className="bg-[#172033] border border-[#23304a] rounded px-2 py-1 font-mono text-xs text-slate-100 outline-none focus:border-blue-500 select-text"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-400 uppercase text-[11px]">To:</span>
                    <input
                      type="date"
                      value={cngToDate}
                      onChange={(e) => setCngToDate(e.target.value)}
                      className="bg-[#172033] border border-[#23304a] rounded px-2 py-1 font-mono text-xs text-slate-100 outline-none focus:border-blue-500 select-text"
                    />
                  </div>
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap items-center gap-1">
                  <button type="button"
                    onClick={() => handlePresetRange('week')}
                    className="px-2 py-0.5 rounded bg-[#172033] hover:bg-[#1f2b45] text-slate-300 font-medium text-[11px] border border-[#23304a] transition-all"
                  >
                    This Week
                  </button>
                  <button type="button"
                    onClick={() => handlePresetRange('15th')}
                    className="px-2 py-0.5 rounded bg-[#172033] hover:bg-[#1f2b45] text-slate-300 font-medium text-[11px] border border-[#23304a] transition-all"
                  >
                    1st-15th
                  </button>
                  <button type="button"
                    onClick={() => handlePresetRange('16th')}
                    className="px-2 py-0.5 rounded bg-[#172033] hover:bg-[#1f2b45] text-slate-300 font-medium text-[11px] border border-[#23304a] transition-all"
                  >
                    16th-End
                  </button>
                  <button type="button"
                    onClick={() => handlePresetRange('full')}
                    className="px-2 py-0.5 rounded bg-[#103a27] hover:bg-[#15803d]/50 text-[#34d399] font-medium text-[11px] border border-[#15803d]/40 transition-all"
                  >
                    Full Month
                  </button>
                </div>
              </div>

              {/* Actions: Save & History Dropdown */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1b2537] pt-2">
                <button type="button"
                  onClick={handleSaveReconciliationRecord}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Reconciliation Record</span>
                </button>

                {savedReconciliations.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-400 uppercase">Saved:</span>
                    <select
                      value={selectedSavedRecId}
                      onChange={(e) => handleLoadSavedReconciliation(e.target.value)}
                      className="bg-[#172033] border border-[#23304a] rounded px-2.5 py-1 text-xs font-medium text-slate-100 outline-none focus:border-blue-500 cursor-pointer max-w-[200px] truncate"
                    >
                      <option value="" className="bg-[#121927]">-- Select Saved Period --</option>
                      {savedReconciliations.map((rec) => (
                        <option key={rec.id} value={rec.id} className="bg-[#121927]">
                          {rec.periodLabel} ({rec.savedAt})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* 🔝 TOP SECTION: JMR SETTLEMENT CONTROLS */}
            <div className="space-y-2.5">
              {/* 3-Column Input & Display Row (Directly above green banner) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-end bg-[#0e1420] p-2.5 rounded-lg border border-[#1b2537]">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400 uppercase block font-sans">
                    JMR READING (KG):
                  </label>
                  <NumericInput
                    step="0.01"
                    value={cngJmrInputs.jmrReading}
                    onChange={(v) => setCngJmrInputs(prev => ({ ...prev, jmrReading: v }))}
                    className="w-full input-cell !text-left"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400 uppercase block font-sans">
                    CNG SELLING RATE (₹/KG):
                  </label>
                  <NumericInput
                    step="0.0001"
                    value={cngJmrInputs.cngRate}
                    onChange={(v) => setCngJmrInputs(prev => ({ ...prev, cngRate: v }))}
                    className="w-full input-cell !text-left"
                  />
                </div>

                <div className="space-y-1">
                  <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider font-sans">
                    JMR AMOUNT (₹):
                  </span>
                  <div className="bg-[#172033] border border-[#23304a] rounded px-2.5 py-1 text-right">
                    <span className="font-mono font-bold text-slate-100 text-xs block tabular-nums">
                      ₹ {Y.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Green Final Settlement Banner */}
              <div className="totalizer-banner">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-sans">
                  FINAL JMR NET SETTLEMENT AMOUNT (C):
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold font-mono text-sm tabular-nums">
                    ₹ {C.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="badge-ms">
                    Reconciled
                  </span>
                </div>
              </div>
            </div>

            {/* ⬇️ BOTTOM SECTION: DAILY SALES & PAYMENT REGISTER TABLE */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                  <h4 className="font-semibold text-xs text-slate-300 uppercase tracking-wide">
                    DAILY SALES REGISTER
                  </h4>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Entries: <strong className="text-emerald-400 font-bold">{cngList.length}</strong>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[#1e293b] bg-[#0e1420] shadow-md">
                <table className="w-full text-left border-collapse font-sans text-xs">
                  <thead>
                    <tr className="bg-slate-900/60 text-slate-400 text-[11px] font-semibold uppercase tracking-wider border-b border-[#1e293b]">
                      <th className="p-2 border-r border-[#1e293b] w-10 text-center font-mono">#</th>
                      <th className="p-2 border-r border-[#1e293b] w-40 text-right">PAYMENT DONE (₹)</th>
                      <th className="p-2 border-r border-[#1e293b] text-right bg-[#103a27]/40 text-[#34d399]">CNG SALE (KG) [COL A]</th>
                      <th className="p-2 border-r border-[#1e293b] text-right">CNG AMOUNT (₹) [COL B]</th>
                      <th className="p-2 text-center w-12">act</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#1b2537] font-medium select-text font-mono text-xs">
                    {cngList.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-6 text-center text-slate-500 font-mono">
                          No CNG daily entries recorded for {monthName}. Click <strong>"+ Add Entry Row"</strong> to begin.
                        </td>
                      </tr>
                    ) : (
                      cngList.map((row, idx) => {
                        const payVal = row.paymentDone !== undefined ? row.paymentDone : 0;
                        const kgVal = row.cngSaleKg !== undefined ? row.cngSaleKg : (row.cashSale || 0);
                        const amtVal = row.cngAmount !== undefined ? row.cngAmount : (row.amount || 0);

                        return (
                          <tr key={row.id || `cng-reg-${idx}`} className="hover:bg-[#131b29] transition-colors">
                            <td className="p-2 text-center font-mono text-slate-400 border-r border-[#1b2537]">
                              {idx + 1}
                            </td>
                            <td className="p-1.5 border-r border-[#1b2537] text-right">
                              <NumericInput
                                step="0.01"
                                value={payVal}
                                onChange={(v) => handleCellChange(idx, 'paymentDone', v)}
                                onKeyDown={handleGridKeyDown}
                                data-row={idx}
                                data-col={0}
                                className={numInputClass}
                                placeholder="0.00"
                              />
                            </td>
                            <td className="p-1.5 border-r border-[#1b2537] text-right">
                              <NumericInput
                                step="0.01"
                                value={kgVal}
                                onChange={(v) => handleCellChange(idx, 'cngSaleKg', v)}
                                onKeyDown={handleGridKeyDown}
                                data-row={idx}
                                data-col={1}
                                className={numInputClass}
                                placeholder="0.00"
                              />
                            </td>
                            <td className="p-1.5 border-r border-[#1b2537] text-right">
                              <NumericInput
                                step="0.01"
                                value={amtVal}
                                onChange={(v) => handleCellChange(idx, 'cngAmount', v)}
                                onKeyDown={handleGridKeyDown}
                                data-row={idx}
                                data-col={2}
                                className={numInputClass}
                                placeholder="0.00"
                              />
                            </td>
                            <td className="p-1.5 text-center">
                              <button type="button"
                                onClick={() => handleDeleteRow(idx)}
                                className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                                title="Delete Row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  <tfoot className="bg-[#0f1726] border-t border-[#1e293b] font-mono text-xs select-text text-slate-200">
                    <tr>
                      <td className="p-2 text-right font-semibold uppercase font-sans border-r border-[#1e293b] text-[11px] text-slate-400">
                        TOTALS:
                      </td>
                      <td className="p-2 text-right font-bold text-blue-400 border-r border-[#1e293b] tabular-nums">
                        ₹ {totalPaymentDone.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-right font-bold text-emerald-400 border-r border-[#1e293b] tabular-nums">
                        {tableA.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG
                      </td>
                      <td className="p-2 text-right font-bold text-slate-100 border-r border-[#1e293b] tabular-nums">
                        ₹ {tableB.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-2 flex justify-center">
                <button type="button"
                  onClick={handleAddRow}
                  className="bg-[#172033] hover:bg-[#1f2b45] text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#23304a] transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-slate-400" />
                  <span>+ Add Register Row</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* STANDARD SPREADSHEET VIEW FOR PETROL, DIESEL, SMART FUEL */
        <div className="bg-[#121927] rounded-xl border border-[#1e293b] overflow-hidden shadow-lg p-3.5 space-y-3">
          {/* Table Title Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#1e293b] pb-2.5">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className={`w-4 h-4 ${activeProduct.color}`} />
              <h3 className="font-semibold text-xs text-slate-100 uppercase tracking-wide">
                {activeProduct.name} SELL PATRAK SHEET — <span className="text-slate-400 font-normal">{monthName}</span>
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
              <span>Rate: <strong className="text-slate-100 font-bold font-mono">₹{activeProduct.defaultRate}/L</strong></span>
              <span className="text-slate-600">|</span>
              <span>Total Entries: <strong className="text-blue-400 font-mono">{currentRows.length}</strong></span>
            </div>
          </div>

          {/* Spreadsheet Table */}
          <div className="overflow-x-auto rounded-lg border border-[#1e293b] bg-[#0e1420]">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <thead>
                <tr className="bg-slate-900/60 text-slate-400 text-[11px] font-semibold uppercase tracking-wider border-b border-[#1e293b]">
                  <th className="p-2 border-r border-[#1e293b] w-10 text-center font-mono">#</th>
                  <th className="p-2 border-r border-[#1e293b] w-32">DATE</th>
                  <th className="p-2 border-r border-[#1e293b] text-right bg-[#103a27]/30 text-[#34d399]">CASH SALE ({activeProduct.unit})</th>
                  <th className="p-2 border-r border-[#1e293b] text-right bg-[#422c0d]/30 text-[#fbbf24]">DEBIT ({activeProduct.unit})</th>
                  <th className="p-2 border-r border-[#1e293b] text-right text-blue-400 font-semibold">TOTAL ({activeProduct.unit})</th>
                  <th className="p-2 border-r border-[#1e293b] text-right w-24">RATE (₹)</th>
                  <th className="p-2 border-r border-[#1e293b] text-right font-bold text-slate-100">AMOUNT (₹)</th>
                  <th className="p-2 text-center w-12">act</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#1b2537] font-medium select-text font-mono text-xs">
                {currentRows.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-6 text-center text-slate-500 font-mono">
                      No sell patrak entries recorded for {activeProduct.name} in {monthName}. Click <strong>"+ Add Daily Entry Row"</strong> to begin.
                    </td>
                  </tr>
                ) : (
                  currentRows.map((row, idx) => {
                    const cash = parseFloat(row.cashSale) || 0;
                    const deb = parseFloat(row.debit) || 0;
                    const total = cash + deb;
                    const rate = parseFloat(row.rate) || activeProduct.defaultRate;
                    const amt = total * rate;

                    return (
                      <tr key={row.id || `sell-row-${row.date || idx}`} className="hover:bg-[#131b29] transition-colors">
                        {/* # */}
                        <td className="p-2 text-center font-mono text-slate-400 border-r border-[#1b2537]">
                          {idx + 1}
                        </td>

                        {/* Date */}
                        <td className="p-1.5 border-r border-[#1b2537]">
                          <input
                            type="date"
                            value={row.date}
                            onChange={(e) => handleCellChange(idx, 'date', e.target.value)}
                            onKeyDown={handleGridKeyDown}
                            data-row={idx}
                            data-col={0}
                            className="bg-[#172033] border border-[#23304a] rounded px-2 py-1 font-mono text-xs text-slate-100 outline-none focus:border-blue-500 select-text"
                          />
                        </td>

                        {/* Cash Sale */}
                        <td className="p-1.5 border-r border-[#1b2537] text-right">
                          <NumericInput
                            step="0.01"
                            placeholder="0.00"
                            value={row.cashSale}
                            onChange={(val) => handleCellChange(idx, 'cashSale', val)}
                            onKeyDown={handleGridKeyDown}
                            data-row={idx}
                            data-col={1}
                            className="w-full input-cell !text-right text-emerald-400 font-semibold"
                          />
                        </td>

                        {/* Debit */}
                        <td className="p-1.5 border-r border-[#1b2537] text-right">
                          <NumericInput
                            step="0.01"
                            placeholder="0.00"
                            value={row.debit}
                            onChange={(val) => handleCellChange(idx, 'debit', val)}
                            onKeyDown={handleGridKeyDown}
                            data-row={idx}
                            data-col={2}
                            className="w-full input-cell !text-right text-amber-400 font-semibold"
                          />
                        </td>

                        {/* Total Sale (Calculated) */}
                        <td className="p-2 border-r border-[#1b2537] text-right font-mono text-xs font-semibold text-blue-400 tabular-nums">
                          {total.toFixed(2)}
                        </td>

                        {/* Rate */}
                        <td className="p-1.5 border-r border-[#1b2537] text-right">
                          <NumericInput
                            step="0.01"
                            placeholder="0.00"
                            value={row.rate}
                            onChange={(val) => handleCellChange(idx, 'rate', val)}
                            onKeyDown={handleGridKeyDown}
                            data-row={idx}
                            data-col={3}
                            className="w-full input-cell !text-right"
                          />
                        </td>

                        {/* Amount (Calculated) */}
                        <td className="p-2 border-r border-[#1b2537] text-right font-mono font-bold text-xs text-slate-100 tabular-nums">
                          ₹ {amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Actions */}
                        <td className="p-1.5 text-center">
                          <button type="button"
                            onClick={() => handleDeleteRow(idx)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                            title="Delete Row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Bottom Totals Footer Row */}
              <tfoot className="bg-[#0f1726] border-t border-[#1e293b] font-mono text-xs select-text text-slate-200">
                <tr>
                  <td colSpan="2" className="p-2 text-right font-semibold text-slate-400 uppercase font-sans text-[11px]">
                    TOTALS ({monthName}):
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-emerald-400 text-xs border-r border-[#1e293b] tabular-nums">
                    {totalCashSale.toFixed(2)} {activeProduct.unit}
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-amber-400 text-xs border-r border-[#1e293b] tabular-nums">
                    {totalDebitSale.toFixed(2)} {activeProduct.unit}
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-blue-400 text-xs border-r border-[#1e293b] tabular-nums">
                    {totalVolumeSold.toFixed(2)} {activeProduct.unit}
                  </td>
                  <td className="p-2 border-r border-[#1e293b]"></td>
                  <td className="p-2 text-right font-mono font-bold text-slate-100 text-xs border-r border-[#1e293b] tabular-nums">
                    ₹ {totalRevenueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="p-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Real-time Summary Cards Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            <div className="p-3 rounded-lg bg-[#0e1420] border border-[#1b2537] space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>CASH SALES</span>
              </div>
              <div className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                {totalCashSale.toFixed(2)} <span className="text-xs font-normal text-slate-400">{activeProduct.unit}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0e1420] border border-[#1b2537] space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-amber-400" />
                <span>DEBIT / KHATA SALES</span>
              </div>
              <div className="font-mono text-sm font-bold text-amber-400 tabular-nums">
                {totalDebitSale.toFixed(2)} <span className="text-xs font-normal text-slate-400">{activeProduct.unit}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0e1420] border border-[#1b2537] space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5 text-blue-400" />
                <span>TOTAL VOLUME SOLD</span>
              </div>
              <div className="font-mono text-sm font-bold text-blue-400 tabular-nums">
                {totalVolumeSold.toFixed(2)} <span className="text-xs font-normal text-slate-400">{activeProduct.unit}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0e1420] border border-[#1b2537] space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-emerald-400" />
                <span>TOTAL REVENUE (AMOUNT)</span>
              </div>
              <div className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                ₹ {totalRevenueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
