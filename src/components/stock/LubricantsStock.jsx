import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/database';
import { calculateLubricantRowTotal } from '../../db/storageService';
import { useExcelNavigation } from '../../hooks/useExcelNavigation';
import {
  Droplet,
  Package,
  IndianRupee,
  Plus,
  Download,
  Printer,
  Search,
  Calendar,
  FileSpreadsheet,
  Trash2,
  X,
  Layers
} from 'lucide-react';
import NumericInput from '../common/NumericInput';

export default function LubricantsStock() {
  useExcelNavigation();
  const {
    selectedDate,
    showToast,
    productCatalog,
    updateProductCatalog,
    lubricants = [],
    lubricantProducts = [],
    addLubricantProduct = () => {},
    deleteLubricantProduct = () => {}
  } = useApp();

  const [loading, setLoading] = useState(true);
  const [lubeSalesRecords, setLubeSalesRecords] = useState([]);

  // Month & Filter State
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return selectedDate ? selectedDate.slice(0, 7) : new Date().toISOString().slice(0, 7);
  });
  const [searchTerm, setSearchTerm] = useState('');

  // Removed Products State (Persisted in localStorage)
  const [removedProducts, setRemovedProducts] = useState(() => {
    try {
      const saved = localStorage.getItem('lube_removed_products');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Stock Matrix Opening & Receipts state (persisted to localStorage)
  const [stockMatrix, setStockMatrix] = useState(() => {
    try {
      const saved = localStorage.getItem(`lube_stock_matrix_${selectedMonth}`);
      return saved ? JSON.parse(saved) : {};
    } catch (err) {
      return {};
    }
  });

  // Re-load stockMatrix & sales records on month change or event trigger
  useEffect(() => {
    let isMounted = true;
    const handleRefresh = () => {
      if (!isMounted) return;
      loadLubeSalesRecords(false);
      try {
        const saved = localStorage.getItem(`lube_stock_matrix_${selectedMonth}`);
        const parsed = saved ? JSON.parse(saved) : {};
        setStockMatrix(prev => (JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed));
      } catch (err) {}
    };

    handleRefresh();

    window.addEventListener('lubricant_matrix_updated', handleRefresh);
    window.addEventListener('pump_product_catalog_updated', handleRefresh);
    window.addEventListener('storage', handleRefresh);

    return () => {
      isMounted = false;
      window.removeEventListener('lubricant_matrix_updated', handleRefresh);
      window.removeEventListener('pump_product_catalog_updated', handleRefresh);
      window.removeEventListener('storage', handleRefresh);
    };
  }, [selectedMonth]);

  // Helper to update stock matrix (opening stock / receipts)
  const updateStockMatrix = (productName, field, value) => {
    const updated = {
      ...stockMatrix,
      [productName]: {
        ...(stockMatrix[productName] || { openingTins: 0, openingLiters: 0, receiptDate: '', receiptTins: 0 }),
        [field]: value
      }
    };
    setStockMatrix(updated);
    try {
      localStorage.setItem(`lube_stock_matrix_${selectedMonth}`, JSON.stringify(updated));
    } catch (err) {
      console.error('Error saving stock matrix to local storage:', err);
    }
  };

  // Modal State for Add Product Row vs Sales Entry
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalTab, setModalTab] = useState('product'); // 'product' | 'entry'

  // New Product Row Form State
  const [newProduct, setNewProduct] = useState({
    name: '',
    volume: '1',
    unit: 'Liter',
    price: '380',
    openingTins: '0',
    openingLiters: '0'
  });

  // Manual Shift Sales Entry Form State
  const [newEntry, setNewEntry] = useState({
    date: selectedDate || new Date().toISOString().split('T')[0],
    productName: '',
    litreVolume: 0,
    soldQty: 0,
    unitPrice: 0,
    totalSaleAmount: 0
  });

  // Load Lubricants Sales Records from IndexedDB
  useEffect(() => {
    loadLubeSalesRecords(true);
  }, [selectedDate, selectedMonth]);

  const loadLubeSalesRecords = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const records = await db.lubricants.toArray();
      setLubeSalesRecords(prev => (JSON.stringify(prev) === JSON.stringify(records) ? prev : records));
    } catch (err) {
      console.error('Error loading lubricant sales records:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  // Derive dynamic days in month (e.g. Sept 2026 = 30 days)
  const { daysArray, daysInMonth } = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const monthIndex = (parseInt(monthStr, 10) || (new Date().getMonth() + 1)) - 1;
    const count = new Date(year, monthIndex + 1, 0).getDate();
    return {
      daysInMonth: count,
      daysArray: Array.from({ length: count }, (_, i) => i + 1)
    };
  }, [selectedMonth]);

  // Extract catalog products list from shared lubricantProducts / productCatalog
  const catalogProducts = useMemo(() => {
    let list = [];

    // 1. First priority: shared lubricantProducts from AppContext
    if (Array.isArray(lubricantProducts) && lubricantProducts.length > 0) {
      lubricantProducts.forEach(item => {
        if (item && item.name) {
          list.push({
            id: item.id || item.name,
            name: item.name,
            unit: item.unit || item.defaultUnit || 'Liter',
            volume: item.volume || item.packVolume || item.defaultVolume || 1.0,
            price: item.price || item.defaultPrice || 0
          });
        }
      });
    }

    // 2. Also incorporate any catalog items not yet in list
    if (productCatalog && Array.isArray(productCatalog)) {
      productCatalog.forEach(group => {
        const catName = (group.category || '').toLowerCase();
        if (catName.includes('lube') || catName.includes('oil') || catName.includes('additive') || catName.includes('specialt') || !catName.includes('fuel')) {
          if (Array.isArray(group.items)) {
            group.items.forEach(item => {
              if (item && item.name && !list.some(p => p.name.toLowerCase() === item.name.toLowerCase())) {
                list.push({
                  id: item.id || item.name,
                  name: item.name,
                  unit: item.defaultUnit || 'Liter',
                  volume: item.defaultVolume || (item.name.toLowerCase().includes('40ml') ? 0.04 : item.name.toLowerCase().includes('500ml') ? 0.50 : 1.0),
                  price: item.defaultPrice || 0
                });
              }
            });
          }
        }
      });
    }

    if (list.length === 0) {
      list = [
        { id: '1', name: '2T Engine Oil (Pouches/Bottles)', unit: 'Liter', volume: 0.04, price: 15 },
        { id: '2', name: '4T 20W-40 Bike Oil', unit: 'Liter', volume: 1.0, price: 380 },
        { id: '3', name: '15W-40 Heavy Diesel Engine Oil', unit: 'Liter', volume: 1.0, price: 420 },
        { id: '4', name: 'Gear Oil EP 90/140', unit: 'Liter', volume: 1.0, price: 350 },
        { id: '5', name: 'Grease AP3 / MP', unit: 'Kg', volume: 1.0, price: 280 },
        { id: '6', name: 'DEF / AdBlue (EcoClean)', unit: 'Liter', volume: 1.0, price: 65 }
      ];
    }
    return list.filter(p => !removedProducts.includes(p.id) && !removedProducts.includes(p.name));
  }, [lubricantProducts, productCatalog, removedProducts]);

  // Sync active register products to shared localStorage key 'pump_lubricant_monthly_matrix'
  useEffect(() => {
    try {
      const activeMatrixList = catalogProducts.map(p => ({
        id: p.id || p.name,
        name: p.name,
        packVolume: p.volume || 1.0,
        unit: p.unit || 'Liter',
        price: p.price || 0
      }));
      localStorage.setItem('pump_lubricant_monthly_matrix', JSON.stringify(activeMatrixList));
      window.dispatchEvent(new Event('lubricant_matrix_updated'));
    } catch (err) {
      console.error('Error syncing pump_lubricant_monthly_matrix:', err);
    }
  }, [catalogProducts]);

  // Filter products by search term
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return catalogProducts;
    const q = searchTerm.toLowerCase().trim();
    return catalogProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [catalogProducts, searchTerm]);

  // Index daily sales from IndexedDB & LIVE sync from MOD DE Section B:
  // Requirement 2:
  // Connect "VOLUME" from MOD DE Section B to "TINS" in MOD LUB.
  // Connect "SOLD QTY" from MOD DE Section B to "LITRE" in MOD LUB.
  const dailySalesMap = useMemo(() => {
    const map = {};

    // 1. Seed historical records from IndexedDB
    lubeSalesRecords.forEach(rec => {
      if (!rec.date || !rec.date.startsWith(selectedMonth)) return;
      const parts = rec.date.split('-');
      const day = parseInt(parts[2], 10);
      if (isNaN(day)) return;

      const pName = rec.productName;
      if (!map[pName]) map[pName] = {};
      if (!map[pName][day]) {
        map[pName][day] = { tins: 0, liters: 0, soldQty: 0, totalVolume: 0, totalAmount: 0 };
      }

      const qty = parseFloat(rec.soldQty) || 0;
      const vol = parseFloat(rec.litreVolume) || 0;
      const amt = parseFloat(rec.totalSaleAmount) || calculateLubricantRowTotal(rec);

      map[pName][day].tins += vol;
      map[pName][day].liters += qty;
      map[pName][day].soldQty += vol;
      map[pName][day].totalVolume += qty;
      map[pName][day].totalAmount += amt;
    });

    // 2. LIVE OVERLAY from MOD DE Section B (lubricants state in AppContext)
    if (selectedDate && selectedDate.startsWith(selectedMonth) && Array.isArray(lubricants)) {
      const parts = selectedDate.split('-');
      const activeDay = parseInt(parts[2], 10);
      if (!isNaN(activeDay)) {
        lubricants.forEach(item => {
          if (!item || !item.productName) return;
          const pName = item.productName;
          if (!map[pName]) map[pName] = {};

          const vol = parseFloat(item.litreVolume !== undefined && item.litreVolume !== null && item.litreVolume !== '' ? item.litreVolume : item.volume) || 0;
          const sold = parseFloat(item.soldQty !== undefined && item.soldQty !== null && item.soldQty !== '' ? item.soldQty : item.soldCount) || 0;
          const amt = parseFloat(item.totalAmount) || (vol * (parseFloat(item.unitPrice) || 0));

          // Connect "VOLUME" from MOD DE Section B to "TINS" in MOD LUB
          // Connect "SOLD QTY" from MOD DE Section B to "LITRE" in MOD LUB
          map[pName][activeDay] = {
            tins: vol,
            liters: sold,
            soldQty: vol,
            totalVolume: sold,
            totalAmount: amt,
            isLiveSynced: true
          };
        });
      }
    }

    return map;
  }, [lubeSalesRecords, selectedMonth, selectedDate, lubricants]);

  // Compute Grand Metrics Across All Products for the Month
  const { totalMonthDispensedVolume, totalMonthSoldQty, totalMonthRevenue } = useMemo(() => {
    let volume = 0;
    let qty = 0;
    let revenue = 0;

    catalogProducts.forEach(prod => {
      daysArray.forEach(d => {
        const cell = dailySalesMap[prod.name]?.[d];
        if (cell) {
          const q = cell.tins !== undefined ? cell.tins : (cell.soldQty || 0);
          const v = cell.liters !== undefined ? cell.liters : (cell.totalVolume || (q * (prod.volume || 1)));
          const a = cell.totalAmount || 0;
          qty += q;
          volume += v;
          revenue += a;
        }
      });
    });

    return {
      totalMonthDispensedVolume: volume,
      totalMonthSoldQty: qty,
      totalMonthRevenue: revenue
    };
  }, [catalogProducts, daysArray, dailySalesMap]);

  // Compute Column Footer Totals across filtered products
  const columnTotals = useMemo(() => {
    let openingTinsTotal = 0;
    let openingLitersTotal = 0;
    let receiptTinsTotal = 0;
    let receiptLitersTotal = 0;
    const dayTotals = {};
    daysArray.forEach(d => { dayTotals[d] = { tins: 0, liters: 0 }; });
    let closingTinsTotal = 0;
    let closingLitersTotal = 0;
    let purchaseTinsTotal = 0;

    filteredProducts.forEach(prod => {
      const openTins = stockMatrix[prod.name]?.openingTins ?? 0;
      const openLiters = openTins * (prod.volume || 1);
      openingTinsTotal += openTins;
      openingLitersTotal += openLiters;

      const recTins = stockMatrix[prod.name]?.receiptTins ?? 0;
      const recLiters = recTins * (prod.volume || 1);
      receiptTinsTotal += recTins;
      receiptLitersTotal += recLiters;
      purchaseTinsTotal += recTins;

      let prodRowTins = 0;
      let prodRowLiters = 0;

      daysArray.forEach(d => {
        const daySales = dailySalesMap[prod.name]?.[d];
        const tins = daySales?.tins !== undefined ? daySales.tins : (daySales?.soldQty || 0);
        const liters = daySales?.liters !== undefined ? daySales.liters : (daySales?.totalVolume || (tins * (prod.volume || 1)));
        prodRowTins += tins;
        prodRowLiters += liters;
        if (dayTotals[d]) {
          dayTotals[d].tins += tins;
          dayTotals[d].liters += liters;
        }
      });

      const closeTins = openTins + recTins - prodRowTins;
      const closeLiters = openLiters + recLiters - prodRowLiters;
      closingTinsTotal += closeTins;
      closingLitersTotal += closeLiters;
    });

    return {
      openingTinsTotal,
      openingLitersTotal,
      receiptTinsTotal,
      receiptLitersTotal,
      dayTotals,
      closingTinsTotal,
      closingLitersTotal,
      purchaseTinsTotal
    };
  }, [filteredProducts, stockMatrix, daysArray, dailySalesMap]);

  // Handle Save New Product Row
  const handleSaveNewProductRow = async (e) => {
    if (e) e.preventDefault();
    if (!newProduct.name || !newProduct.name.trim()) {
      showToast('Please enter a product name', 'error');
      return;
    }

    const prodName = newProduct.name.trim();
    const packVol = parseFloat(newProduct.volume) || 1.0;
    const unitType = newProduct.unit || 'Liter';
    const priceVal = parseFloat(newProduct.price) || 0;
    const openTins = parseFloat(newProduct.openingTins) || 0;
    const openLiters = parseFloat(newProduct.openingLiters) || Number((openTins * packVol).toFixed(2));

    // 1. Update master catalog if product not present
    let catalogCopy = JSON.parse(JSON.stringify(productCatalog || []));
    let lubeCategory = catalogCopy.find(g => {
      const c = (g.category || '').toLowerCase();
      return c.includes('lube') || c.includes('oil');
    });

    if (!lubeCategory) {
      lubeCategory = { category: 'Lubricants & Engine Oils', items: [] };
      catalogCopy.push(lubeCategory);
    }

    const existingItem = lubeCategory.items.find(i => i.name.toLowerCase() === prodName.toLowerCase());
    if (!existingItem) {
      const newItem = {
        id: `lub-${Date.now()}`,
        name: prodName,
        defaultUnit: unitType,
        defaultTax: 'GST',
        defaultGst: 18,
        defaultVat: 0,
        defaultVolume: packVol,
        defaultPrice: priceVal
      };
      lubeCategory.items.push(newItem);

      if (updateProductCatalog) {
        await updateProductCatalog(catalogCopy);
      }
    }

    // Add to shared Lubricants master in AppContext
    addLubricantProduct({
      id: existingItem ? existingItem.id : `lub-${Date.now()}`,
      name: prodName,
      unit: unitType,
      volume: packVol,
      price: priceVal
    });

    // 2. Set opening stock in matrix for current month
    updateStockMatrix(prodName, 'openingTins', openTins);
    updateStockMatrix(prodName, 'openingLiters', openLiters);

    // Un-remove if previously deleted
    if (removedProducts.includes(prodName)) {
      const updatedRemoved = removedProducts.filter(p => p !== prodName);
      setRemovedProducts(updatedRemoved);
      try {
        localStorage.setItem('lube_removed_products', JSON.stringify(updatedRemoved));
      } catch (err) {}
    }

    // 3. Reset form & close modal
    setShowAddModal(false);
    setNewProduct({
      name: '',
      volume: '1',
      unit: 'Liter',
      price: '380',
      openingTins: '0',
      openingLiters: '0'
    });

    showToast(`Added product "${prodName}" to Lubricants Register Matrix!`, 'success');
  };

  // Handle Delete Product Row from Register Matrix
  const handleDeleteProductRow = async (targetId, targetName) => {
    if (!window.confirm(`Are you sure you want to remove product row "${targetName}" from the register?`)) {
      return;
    }

    try {
      // 1. Add to local removed list (failsafe & instant UI update)
      const newRemoved = Array.from(new Set([...removedProducts, targetId, targetName]));
      setRemovedProducts(newRemoved);
      try {
        localStorage.setItem('lube_removed_products', JSON.stringify(newRemoved));
      } catch (err) {
        console.error('Error saving removed products to local storage:', err);
      }

      // 2. Remove product from global productCatalog state & IndexedDB
      if (productCatalog && Array.isArray(productCatalog)) {
        const updatedCatalog = productCatalog.map(group => ({
          ...group,
          items: (group.items || []).filter(item => {
            const matchesId = targetId && item.id === targetId;
            const matchesName = item.name && item.name.trim().toLowerCase() === targetName.trim().toLowerCase();
            return !matchesId && !matchesName;
          })
        }));

        if (updateProductCatalog) {
          await updateProductCatalog(updatedCatalog);
        }
      }

      // 3. Clean up month stockMatrix for target product
      const updatedMatrix = { ...stockMatrix };
      if (updatedMatrix[targetName]) {
        delete updatedMatrix[targetName];
        setStockMatrix(updatedMatrix);
        try {
          localStorage.setItem(`lube_stock_matrix_${selectedMonth}`, JSON.stringify(updatedMatrix));
        } catch (err) {
          console.error('Error saving updated stock matrix:', err);
        }
      }

      // 4. Remove from shared Lubricants master in AppContext
      deleteLubricantProduct(targetId, targetName);

      // 5. Dispatch global event
      window.dispatchEvent(new Event('pump_product_catalog_updated'));
      window.dispatchEvent(new Event('lubricant_matrix_updated'));

      showToast(`Removed "${targetName}" from Lubricants Register Matrix`, 'success');
    } catch (err) {
      console.error('Error removing product row:', err);
      showToast('Error removing product row: ' + err.message, 'error');
    }
  };

  // Handle Export CSV (Monthly Matrix Spreadsheet)
  const handleExportCSV = () => {
    const headers = [
      'Product Name', 'Pack Volume',
      'Opening Stock (Tins)', 'Opening Stock (Liter)',
      'Receipt Date', 'Receipt Stock (Tins)', 'Receipt Stock (Liter)',
      ...daysArray.map(d => `Day ${d} Tins`),
      ...daysArray.map(d => `Day ${d} Liter`),
      'Closing Stock (Tins)', 'Closing Stock (Liter)',
      'Parchej / Total Purchases (Tins)'
    ];

    const rows = catalogProducts.map(prod => {
      const openingTins = stockMatrix[prod.name]?.openingTins ?? 0;
      const openingLiter = (openingTins * (prod.volume || 1)).toFixed(2);
      const receiptDate = stockMatrix[prod.name]?.receiptDate || '';
      const receiptTins = stockMatrix[prod.name]?.receiptTins ?? 0;
      const receiptLiter = (receiptTins * (prod.volume || 1)).toFixed(2);

      let rowTins = 0;
      let rowLiter = 0;

      const dayTinsCols = daysArray.map(d => {
        const tins = dailySalesMap[prod.name]?.[d]?.soldQty || 0;
        rowTins += tins;
        return tins;
      });

      const dayLiterCols = daysArray.map(d => {
        const liters = dailySalesMap[prod.name]?.[d]?.totalVolume || ((dailySalesMap[prod.name]?.[d]?.soldQty || 0) * (prod.volume || 1));
        rowLiter += liters;
        return liters.toFixed(2);
      });

      const closingTins = openingTins + receiptTins - rowTins;
      const closingLiter = (parseFloat(openingLiter) + parseFloat(receiptLiter) - rowLiter).toFixed(2);

      return [
        `"${prod.name.replace(/"/g, '""')}"`,
        `"${prod.volume}L"`,
        openingTins, openingLiter,
        receiptDate, receiptTins, receiptLiter,
        ...dayTinsCols,
        ...dayLiterCols,
        closingTins, closingLiter,
        receiptTins
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `LUBRICANTS_MONTHLY_REGISTER_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported Monthly Lubricant Register Matrix to CSV', 'success');
  };

  const handlePrintPDF = () => {
    window.print();
  };

  // Add Manual Entry Submit
  const handleAddManualSubmit = async (e) => {
    e.preventDefault();
    if (!newEntry.productName) {
      showToast('Please select or enter a product name', 'error');
      return;
    }

    const qty = parseFloat(newEntry.soldQty) || 0;
    const price = parseFloat(newEntry.unitPrice) || 0;
    const vol = parseFloat(newEntry.litreVolume) || 0;
    const total = calculateLubricantRowTotal({ litreVolume: vol, soldQty: qty, unitPrice: price });

    const record = {
      date: newEntry.date || selectedDate,
      productName: newEntry.productName,
      litreVolume: vol,
      soldQty: qty,
      unitPrice: price,
      totalSaleAmount: total,
      entrySource: 'manual',
      updatedAt: new Date().toISOString()
    };

    try {
      const newId = await db.lubricants.add(record);
      setLubeSalesRecords(prev => [...prev, { ...record, id: newId }]);
      setShowAddModal(false);
      showToast(`Added manual lube sale entry for ${record.productName}`, 'success');
    } catch (err) {
      showToast('Error adding record: ' + err.message, 'error');
    }
  };

  return (
    <div className="p-4 space-y-3.5 font-sans bg-[#0c121d] min-h-screen text-slate-200">
      {/* MINIMAL TOP CONTROL STRIP */}
      <div className="bg-[#121927] border border-[#1e293b] rounded-xl p-3 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#0e1420] text-amber-400 border border-[#1b2537]">
            <Droplet className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-semibold text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <span>Monthly Lubricants Stock & Sales Register Matrix</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">
              Monthly ledger tracking opening stock, daily sales (Days 1–{daysInMonth}), and closing inventory.
            </p>
          </div>
        </div>

        {/* Right Top Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* ERP CTA Action Button */}
          <button type="button"
            onClick={() => {
              setModalTab('product');
              setShowAddModal(true);
            }}
            className="btn-save-cta"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add New Product Row</span>
          </button>

          <button type="button"
            onClick={handleExportCSV}
            className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            title="Export Monthly Register Matrix to CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button type="button"
            onClick={handlePrintPDF}
            className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            title="Print Monthly Spreadsheet Register"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>


      {/* FILTER STRIP: Month Picker & Search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span>Select Month:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 cursor-pointer"
          />
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search product name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-56 md:w-72 bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* EXCEL-STYLE MONTHLY LUBRICANT REGISTER SPREADSHEET MATRIX */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden" data-grid-container>
        <div className="p-3 border-b border-slate-200 bg-slate-100/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-blue-700" />
            <h2 className="text-xs font-black uppercase text-slate-900 tracking-wider">
              MONTHLY LUBRICANTS SPREADSHEET MATRIX ({selectedMonth})
            </h2>
          </div>
          <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">
            {daysInMonth} Days Matrix
          </span>
        </div>

        <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-left text-xs border-collapse font-mono select-text">
            <thead>
              {/* Multi-Tier Header Tier 1 */}
              <tr className="bg-slate-100 text-slate-800 font-extrabold uppercase text-[10px] border-b border-slate-300">
                <th rowSpan={2} className="bg-sky-100 border border-slate-300 text-slate-900 font-black p-2.5 sticky left-0 z-30 min-w-[200px] text-left shadow-sm">
                  Product Name
                </th>
                <th colSpan={2} className="bg-amber-100 border border-slate-300 text-amber-900 font-black p-1.5 text-center text-xs">
                  Opening Stock
                </th>
                <th colSpan={3} className="bg-blue-100 border border-slate-300 text-blue-900 font-black p-1.5 text-center text-xs">
                  Receipt Stock
                </th>
                {daysArray.map(day => (
                  <th key={day} colSpan={2} className="bg-slate-100 border border-slate-300 text-slate-800 font-black p-1 text-center text-xs min-w-[75px]">
                    Day {day}
                  </th>
                ))}
                <th colSpan={2} className="bg-rose-100 border border-slate-300 text-rose-900 font-black p-1.5 text-center text-xs">
                  Closing Stock
                </th>
                <th rowSpan={2} className="bg-amber-100 border border-slate-300 text-slate-900 font-black p-2 text-center text-xs min-w-[90px]">
                  Parchej / Total Pur.
                </th>
              </tr>

              {/* Multi-Tier Header Tier 2 */}
              <tr className="bg-slate-200 text-slate-700 font-bold uppercase text-[9px] border-b border-slate-300">
                {/* Opening Sub-headers */}
                <th className="bg-amber-50 border border-slate-300 text-amber-900 p-1 text-center font-black">Tins</th>
                <th className="bg-amber-50 border border-slate-300 text-amber-900 p-1 text-center font-black">Liter</th>

                {/* Receipt Sub-headers */}
                <th className="bg-blue-50 border border-slate-300 text-blue-900 p-1 text-center font-black">Date</th>
                <th className="bg-blue-50 border border-slate-300 text-blue-900 p-1 text-center font-black">Tins</th>
                <th className="bg-blue-50 border border-slate-300 text-blue-900 p-1 text-center font-black">Liter</th>

                {/* Days 1..N Sub-headers */}
                {daysArray.map(day => (
                  <React.Fragment key={day}>
                    <th className="bg-slate-50 border border-slate-300 text-slate-700 p-1 text-center font-bold">Tins</th>
                    <th className="bg-slate-50 border border-slate-300 text-slate-700 p-1 text-center font-bold">Liter</th>
                  </React.Fragment>
                ))}

                {/* Closing Sub-headers */}
                <th className="bg-rose-50 border border-slate-300 text-rose-900 p-1 text-center font-black">Tins</th>
                <th className="bg-rose-50 border border-slate-300 text-rose-900 p-1 text-center font-black">Liter</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 font-semibold font-mono text-xs">
              {loading ? (
                <tr>
                  <td colSpan={10 + daysArray.length * 2} className="p-8 text-center text-slate-400 font-bold">
                    Loading Lubricants Monthly Register...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={10 + daysArray.length * 2} className="p-8 text-center text-slate-400 font-bold">
                    No products found matching "{searchTerm}"
                  </td>
                </tr>
              ) : (
                filteredProducts.map((prod) => {
                  const openingTins = stockMatrix[prod.name]?.openingTins ?? 0;
                  const openingLiter = Number((openingTins * (prod.volume || 1)).toFixed(2));

                  const receiptDate = stockMatrix[prod.name]?.receiptDate || '';
                  const receiptTins = stockMatrix[prod.name]?.receiptTins ?? 0;
                  const receiptLiter = Number((receiptTins * (prod.volume || 1)).toFixed(2));

                  let rowTotalTins = 0;
                  let rowTotalLiter = 0;

                  return (
                    <tr key={prod.id || prod.name} className="grid-row bg-white hover:bg-amber-50/40 transition-colors group">
                      {/* Sticky Product Name Column */}
                      <td className="grid-cell p-2 font-bold text-slate-900 sticky left-0 bg-white shadow-sm z-20 font-sans border border-slate-300 group-hover:bg-amber-50/90 transition-colors">
                        <div className="flex items-center justify-between gap-1.5 min-w-[170px]">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate max-w-[120px] text-xs font-bold text-slate-900" title={prod.name}>
                              {prod.name}
                            </span>
                            <span className="text-[10px] text-blue-700 font-mono font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                              {prod.volume}L
                            </span>
                          </div>

                          {/* Compact Red Trash Delete Button */}
                          <button
                            type="button"
                            title={`Delete ${prod.name} from register`}
                            onClick={() => handleDeleteProductRow(prod.id || prod.name, prod.name)}
                            className="p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-40 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Opening Stock (Editable Inputs) */}
                      <td className="grid-cell p-1 text-center border border-slate-300 bg-amber-50/30">
                        <input
                          type="number"
                          value={openingTins || ''}
                          onChange={(e) => {
                            const tins = parseFloat(e.target.value) || 0;
                            updateStockMatrix(prod.name, 'openingTins', tins);
                            updateStockMatrix(prod.name, 'openingLiters', Number((tins * (prod.volume || 1)).toFixed(2)));
                          }}
                          className="w-14 text-center bg-white border border-slate-300 rounded px-1 py-0.5 font-mono text-xs font-bold text-amber-900 outline-none focus:border-amber-500"
                          placeholder="0"
                        />
                      </td>
                      <td className="grid-cell p-1 text-right border border-slate-300 font-bold text-amber-800 bg-amber-50/30 tabular-nums">
                        {openingLiter} L
                      </td>

                      {/* Receipt Stock (Editable Inputs) */}
                      <td className="grid-cell p-1 text-center border border-slate-300 bg-blue-50/30">
                        <input
                          type="text"
                          value={receiptDate}
                          onChange={(e) => updateStockMatrix(prod.name, 'receiptDate', e.target.value)}
                          className="w-14 text-center bg-white border border-slate-300 rounded px-1 py-0.5 font-mono text-[10px] font-bold text-slate-800 outline-none focus:border-blue-500"
                          placeholder="DD/MM"
                        />
                      </td>
                      <td className="grid-cell p-1 text-center border border-slate-300 bg-blue-50/30">
                        <input
                          type="number"
                          value={receiptTins || ''}
                          onChange={(e) => updateStockMatrix(prod.name, 'receiptTins', parseFloat(e.target.value) || 0)}
                          className="w-14 text-center bg-white border border-slate-300 rounded px-1 py-0.5 font-mono text-xs font-bold text-blue-900 outline-none focus:border-blue-500"
                          placeholder="0"
                        />
                      </td>
                      <td className="grid-cell p-1 text-right border border-slate-300 font-bold text-blue-800 bg-blue-50/30 tabular-nums">
                        {receiptLiter} L
                      </td>

                      {/* Day-wise Matrix (Days 1 to N) */}
                      {daysArray.map(day => {
                        const daySales = dailySalesMap[prod.name]?.[day];
                        const tins = daySales?.tins !== undefined ? daySales.tins : (daySales?.soldQty || 0);
                        const liters = daySales?.liters !== undefined ? daySales.liters : (daySales?.totalVolume || (tins * (prod.volume || 1)));
                        rowTotalTins += tins;
                        rowTotalLiter += liters;

                        const hasSales = tins > 0;

                        return (
                          <React.Fragment key={day}>
                            <td className={`grid-cell p-1 text-center border border-slate-300 font-bold tabular-nums ${hasSales ? 'bg-amber-100/60 text-amber-950 font-black' : 'text-slate-400'}`}>
                              {tins || '-'}
                            </td>
                            <td className={`grid-cell p-1 text-right border border-slate-300 font-bold tabular-nums ${hasSales ? 'bg-blue-100/60 text-blue-950 font-black' : 'text-slate-400'}`}>
                              {hasSales ? `${liters.toFixed(2)}` : '-'}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      {/* Closing Stock */}
                      {(() => {
                        const closingTins = openingTins + receiptTins - rowTotalTins;
                        const closingLiter = Number((openingLiter + receiptLiter - rowTotalLiter).toFixed(2));
                        const isNegative = closingTins < 0;

                        return (
                          <>
                            <td className={`grid-cell p-1 text-center border border-slate-300 font-black tabular-nums ${isNegative ? 'bg-rose-100 text-rose-700' : 'bg-rose-50 text-rose-900'}`}>
                              {closingTins}
                            </td>
                            <td className={`grid-cell p-1 text-right border border-slate-300 font-black tabular-nums ${isNegative ? 'bg-rose-100 text-rose-700' : 'bg-rose-50 text-rose-900'}`}>
                              {closingLiter} L
                            </td>
                          </>
                        );
                      })()}

                      {/* Parchej / Total Purchases */}
                      <td className="grid-cell p-1 text-center border border-slate-300 font-black text-slate-900 bg-amber-50/60 tabular-nums">
                        {receiptTins} Pcs
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Matrix Column Footer Totals */}
            <tfoot className="bg-slate-200 text-slate-900 font-extrabold border-t-2 border-slate-400">
              <tr className="bg-slate-200 text-xs font-mono">
                <td className="p-2 sticky left-0 z-20 bg-slate-200 border border-slate-300 font-black text-slate-900 uppercase">
                  TOTAL MATRIX
                </td>
                <td className="p-1 text-center border border-slate-300 font-black text-amber-950">
                  {columnTotals.openingTinsTotal}
                </td>
                <td className="p-1 text-right border border-slate-300 font-black text-amber-950 tabular-nums">
                  {columnTotals.openingLitersTotal.toFixed(2)} L
                </td>
                <td className="p-1 text-center border border-slate-300 text-slate-400 font-normal">
                  -
                </td>
                <td className="p-1 text-center border border-slate-300 font-black text-blue-950">
                  {columnTotals.receiptTinsTotal}
                </td>
                <td className="p-1 text-right border border-slate-300 font-black text-blue-950 tabular-nums">
                  {columnTotals.receiptLitersTotal.toFixed(2)} L
                </td>
                {daysArray.map(day => (
                  <React.Fragment key={day}>
                    <td className="p-1 text-center border border-slate-300 font-black text-slate-900">
                      {columnTotals.dayTotals[day]?.tins || 0}
                    </td>
                    <td className="p-1 text-right border border-slate-300 font-black text-slate-900 tabular-nums">
                      {(columnTotals.dayTotals[day]?.liters || 0).toFixed(2)}
                    </td>
                  </React.Fragment>
                ))}
                <td className="p-1 text-center border border-slate-300 font-black text-rose-950">
                  {columnTotals.closingTinsTotal}
                </td>
                <td className="p-1 text-right border border-slate-300 font-black text-rose-950 tabular-nums">
                  {columnTotals.closingLitersTotal.toFixed(2)} L
                </td>
                <td className="p-1 text-center border border-slate-300 font-black text-slate-950">
                  {columnTotals.purchaseTinsTotal} Pcs
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* MODAL: ADD NEW PRODUCT TO REGISTER */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Droplet className="w-5 h-5 text-orange-600" />
                <h3 className="font-black text-base text-slate-900 flex items-center gap-1.5">
                  <span>🛢️ Add New Product to Register</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setModalTab('product')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all ${modalTab === 'product' ? 'bg-orange-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}
              >
                Add New Product Row
              </button>
              <button
                type="button"
                onClick={() => setModalTab('entry')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all ${modalTab === 'entry' ? 'bg-orange-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600'}`}
              >
                Manual Daily Sales Entry
              </button>
            </div>

            {/* TAB 1: NEW PRODUCT DEFINITION FORM */}
            {modalTab === 'product' && (
              <form onSubmit={(e) => { e.preventDefault(); handleSaveNewProductRow(e); }} className="space-y-4 font-sans">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">PRODUCT NAME</label>
                  <input
                    type="text"
                    placeholder="e.g. Servo 4T, 2T Pouch, Multi Grade"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">PACK SIZE / VOLUME</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 1, 0.5, 0.04"
                      value={newProduct.volume}
                      onChange={(e) => {
                        const volStr = e.target.value;
                        const volNum = parseFloat(volStr) || 1;
                        const openTinsNum = parseFloat(newProduct.openingTins) || 0;
                        setNewProduct({
                          ...newProduct,
                          volume: volStr,
                          openingLiters: (openTinsNum * volNum).toFixed(2)
                        });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 block mb-1">UNIT</label>
                    <select
                      value={newProduct.unit}
                      onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-orange-500 cursor-pointer"
                    >
                      <option value="Liter">Liter (L)</option>
                      <option value="ml">Milliliter (ml)</option>
                      <option value="Kg">Kilogram (Kg)</option>
                      <option value="Tins/Pcs">Tins/Pcs</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">DEFAULT SELLING RATE (₹)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 380"
                    value={newProduct.price}
                    onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none focus:border-orange-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="text-xs font-bold text-amber-800 block mb-1">OPENING TINS / PCS</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={newProduct.openingTins}
                      onChange={(e) => {
                        const tinsStr = e.target.value;
                        const tinsNum = parseFloat(tinsStr) || 0;
                        const volNum = parseFloat(newProduct.volume) || 1;
                        setNewProduct({
                          ...newProduct,
                          openingTins: tinsStr,
                          openingLiters: (tinsNum * volNum).toFixed(2)
                        });
                      }}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-amber-800 block mb-1">OPENING LITERS</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={newProduct.openingLiters}
                      onChange={(e) => setNewProduct({ ...newProduct, openingLiters: e.target.value })}
                      className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
                  >
                    Add Product Row
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: MANUAL DAILY SALES ENTRY FORM */}
            {modalTab === 'entry' && (
              <form onSubmit={(e) => { e.preventDefault(); handleAddManualSubmit(e); }} className="space-y-4 font-sans">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Transaction Date</label>
                  <input
                    type="date"
                    value={newEntry.date}
                    onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-slate-900 outline-none focus:border-orange-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Product Name</label>
                  <select
                    value={newEntry.productName}
                    onChange={(e) => {
                      const pName = e.target.value;
                      const match = catalogProducts.find(p => p.name === pName);
                      const vol = match?.volume || 1.0;
                      const price = match?.price || 0;
                      const qty = parseFloat(newEntry.soldQty) || 1;
                      setNewEntry({
                        ...newEntry,
                        productName: pName,
                        litreVolume: vol,
                        unitPrice: price,
                        totalSaleAmount: calculateLubricantRowTotal({ litreVolume: vol, soldQty: qty, unitPrice: price })
                      });
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:border-orange-500 cursor-pointer"
                  >
                    {catalogProducts.map(p => (
                      <option key={p.id || p.name} value={p.name}>{p.name} ({p.volume}L)</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Litre / Volume (L)</label>
                    <NumericInput
                      step="0.001"
                      value={newEntry.litreVolume}
                      onChange={(val) => setNewEntry({ ...newEntry, litreVolume: val })}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-sm text-blue-700 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Sold Qty (Pcs)</label>
                    <NumericInput
                      value={newEntry.soldQty}
                      onChange={(val) => {
                        const qty = parseFloat(val) || 0;
                        const price = parseFloat(newEntry.unitPrice) || 0;
                        const vol = parseFloat(newEntry.litreVolume) || 0;
                        setNewEntry({
                          ...newEntry,
                          soldQty: val,
                          totalSaleAmount: calculateLubricantRowTotal({ litreVolume: vol, soldQty: qty, unitPrice: price })
                        });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-sm text-amber-700 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Unit Price (₹)</label>
                    <NumericInput
                      step="0.01"
                      value={newEntry.unitPrice}
                      onChange={(val) => {
                        const price = parseFloat(val) || 0;
                        const qty = parseFloat(newEntry.soldQty) || 0;
                        const vol = parseFloat(newEntry.litreVolume) || 0;
                        setNewEntry({
                          ...newEntry,
                          unitPrice: val,
                          totalSaleAmount: calculateLubricantRowTotal({ litreVolume: vol, soldQty: qty, unitPrice: price })
                        });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-sm text-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold uppercase text-slate-600 mb-1">Total Sale Amount (₹)</label>
                    <NumericInput
                      step="0.01"
                      value={newEntry.totalSaleAmount}
                      onChange={(val) => setNewEntry({ ...newEntry, totalSaleAmount: val })}
                      className="w-full bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-2 font-mono font-bold text-sm text-emerald-700 outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-md cursor-pointer"
                  >
                    Save Entry
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
