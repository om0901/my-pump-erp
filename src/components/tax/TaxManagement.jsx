import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/database';
import { useExcelNavigation } from '../../hooks/useExcelNavigation';
import {
  Landmark,
  Plus,
  Trash2,
  Download,
  Save,
  Printer,
  Calendar,
  ShieldCheck,
  FileCheck,
  Scale,
  ShoppingBag,
  FileText,
  Calculator,
  Percent,
  TrendingUp,
  Tag,
  FolderPlus,
  X,
  Package
} from 'lucide-react';
import NumericInput from '../common/NumericInput';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { syncPurchasingToStockPatrak } from '../../db/storageService';

export const isFuelProduct = (prodName) => {
  if (!prodName) return false;
  const lower = prodName.toLowerCase();
  return (
    lower.includes('petrol') ||
    lower.includes('ms') ||
    lower.includes('diesel') ||
    lower.includes('hsd') ||
    lower.includes('speed') ||
    lower.includes('power') ||
    lower.includes('cng') ||
    lower.includes('fuel')
  );
};

const TAX_SECTIONS = [
  { key: 'purchasing', label: '1. Purchasing', icon: ShoppingBag, color: 'text-purple-600' },
  { key: 'vat', label: '2. VAT', icon: Landmark, color: 'text-amber-600' },
  { key: 'gst', label: '3. GST', icon: FileCheck, color: 'text-blue-600' },
  { key: 'tds', label: '4. TDS', icon: FileText, color: 'text-orange-600' },
  { key: 'weight', label: '5. Weight & Verification', icon: Scale, color: 'text-emerald-600' },
];

const DEFAULT_PRODUCT_CATALOG = [
  {
    category: "Fuels (OMC)",
    items: [
      { id: "fuel-1", name: "Petrol (MS)", defaultUnit: "Liter", defaultTax: "VAT", defaultVat: 13.7, defaultGst: 0 },
      { id: "fuel-2", name: "Diesel (HSD)", defaultUnit: "Liter", defaultTax: "VAT", defaultVat: 14.9, defaultGst: 0 },
      { id: "fuel-3", name: "Speed / Power (Premium)", defaultUnit: "Liter", defaultTax: "VAT", defaultVat: 13.7, defaultGst: 0 },
      { id: "fuel-4", name: "CNG", defaultUnit: "KG", defaultTax: "VAT", defaultVat: 5.0, defaultGst: 0 }
    ]
  },
  {
    category: "Lubricants & Engine Oils",
    items: [
      { id: "lub-1", name: "2T Engine Oil (Pouches/Bottles)", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0 },
      { id: "lub-2", name: "4T 20W-40 Bike Oil", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0 },
      { id: "lub-3", name: "15W-40 Heavy Diesel Engine Oil", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0 },
      { id: "lub-4", name: "Gear Oil EP 90/140", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0 },
      { id: "lub-5", name: "Grease AP3 / MP", defaultUnit: "KG", defaultTax: "GST", defaultGst: 18, defaultVat: 0 }
    ]
  },
  {
    category: "Additives & Specialties",
    items: [
      { id: "sp-1", name: "DEF / AdBlue (EcoClean)", defaultUnit: "Liter", defaultTax: "GST", defaultGst: 18, defaultVat: 0 },
      { id: "sp-2", name: "Distilled Water", defaultUnit: "Bottle", defaultTax: "GST", defaultGst: 18, defaultVat: 0 }
    ]
  }
];

export default function TaxManagement() {
  useExcelNavigation();
  const { selectedDate, showToast, stationProfile, productCatalog, updateProductCatalog } = useApp();
  const [activeSection, setActiveSection] = useState('purchasing');
  const [loading, setLoading] = useState(true);

  // Dynamic Product Catalog Modal
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [targetCategory, setTargetCategory] = useState("Lubricants & Engine Oils");
  const [newSubProductName, setNewSubProductName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryItemName, setNewCategoryItemName] = useState("");
  const [newProductTaxType, setNewProductTaxType] = useState("GST");

  // Month-Year Selector
  const [selectedYearMonth, setSelectedYearMonth] = useState(() => {
    const d = new Date(selectedDate || Date.now());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // State arrays for 5 sections
  const [taxData, setTaxData] = useState({
    purchasing: [],
    vat: [],
    gst: [],
    tds: [],
    weight: []
  });

  // Right-Panel Month-End VAT Settlement Inputs state
  const [vatSettlementInputs, setVatSettlementInputs] = useState({
    petrol: { totalSales: 4419892.27, vatRate: 13.70 },
    diesel: { totalSales: 6979310.15, vatRate: 14.90 },
    cng: { totalSales: 1481115.46, vatRate: 5.00 },
    smartFuel: { totalSales: 50000.00, vatRate: 13.70 },
  });

  const getDaysInMonth = (yearMonthStr) => {
    const [y, m] = (yearMonthStr || '2026-08').split('-');
    const year = parseInt(y, 10) || 2026;
    const month = parseInt(m, 10) || 8;
    return new Date(year, month, 0).getDate();
  };

  const generateInitialVatGrid = (yearMonthStr) => {
    const numDays = getDaysInMonth(yearMonthStr);
    const [y, m] = yearMonthStr.split('-');
    const grid = [];

    for (let d = 1; d <= numDays; d++) {
      const dayStr = String(d).padStart(2, '0');
      const formattedDate = `${dayStr}/${m}/${y}`;

      let petrol = 0;
      let diesel = 0;
      let cng = 0;
      let smartFuel = 0;

      if (d === 1) {
        petrol = 417042.30;
        diesel = 793200.03;
        cng = 685628.43;
        smartFuel = 2500.00;
      } else if (d === 2) {
        petrol = 389120.50;
        diesel = 742100.00;
        cng = 612450.20;
        smartFuel = 1800.00;
      } else if (d === 3) {
        petrol = 425600.00;
        diesel = 810500.00;
        cng = 701200.00;
        smartFuel = 3100.00;
      }

      const dailyTotal = Number((petrol + diesel + cng + smartFuel).toFixed(2));

      grid.push({
        day: d,
        dateFormatted: formattedDate,
        isoDate: `${y}-${m}-${dayStr}`,
        petrol,
        diesel,
        cng,
        smartFuel,
        dailyTotal
      });
    }

    return grid;
  };

  const generateInitialTdsGrid = (yearMonthStr) => {
    const numDays = getDaysInMonth(yearMonthStr);
    const [y, m] = yearMonthStr.split('-');
    const grid = [];

    for (let d = 1; d <= numDays; d++) {
      const dayStr = String(d).padStart(2, '0');
      const formattedDate = `${dayStr}/${m}/${y}`;

      let petrolAmt = 0, petrolTds = 0;
      let dieselAmt = 0, dieselTds = 0;
      let cngAmt = 0, cngTds = 0;
      let smartAmt = 0, smartTds = 0;

      if (d === 1) {
        petrolAmt = 150000; petrolTds = 150;
        dieselAmt = 320000; dieselTds = 320;
        cngAmt = 85000; cngTds = 85;
        smartAmt = 12000; smartTds = 12;
      } else if (d === 2) {
        petrolAmt = 142000; petrolTds = 142;
        dieselAmt = 295000; dieselTds = 295;
        cngAmt = 78000; cngTds = 78;
        smartAmt = 9000; smartTds = 9;
      }

      const dailyTdsTotal = Number((petrolTds + dieselTds + cngTds + smartTds).toFixed(2));

      grid.push({
        day: d,
        dateFormatted: formattedDate,
        isoDate: `${y}-${m}-${dayStr}`,
        petrolAmt,
        petrolTds,
        dieselAmt,
        dieselTds,
        cngAmt,
        cngTds,
        smartAmt,
        smartTds,
        dailyTdsTotal
      });
    }

    return grid;
  };

  const computePurchasingRow = (row) => {
    const date = row.date || selectedDate || new Date().toISOString().split('T')[0];
    const supplier = row.supplier || row.saplayer || row.omcLocation || 'IOCL Kandla Depot';
    const product = row.product || 'Petrol (MS)';
    const ratePerLiter = row.ratePerLiter !== undefined ? (parseFloat(row.ratePerLiter) || 0) : (parseFloat(row.basicRate) || 0);

    let volumeOrQty = 0;
    if (row.volumeOrQty !== undefined && row.volumeOrQty !== '') {
      volumeOrQty = parseFloat(row.volumeOrQty) || 0;
    } else if (row.liters !== undefined && parseFloat(row.liters) > 0) {
      volumeOrQty = parseFloat(row.liters) || 0;
    } else if (row.quantity !== undefined) {
      volumeOrQty = parseFloat(row.quantity) || 0;
    } else if (row.liter !== undefined) {
      volumeOrQty = parseFloat(row.liter) || 0;
    }

    const gstPercent = row.gstPercent !== undefined ? (parseFloat(row.gstPercent) || 0) : 0;
    const vatPercent = row.vatPercent !== undefined ? (parseFloat(row.vatPercent) || 0) : (row.vetPercent !== undefined ? (parseFloat(row.vetPercent) || 0) : (isFuelProduct(product) ? 13.7 : 0));
    const tdsPercent = row.tdsPercent !== undefined ? (parseFloat(row.tdsPercent) || 0) : 0.1;

    const baseValue = Number((ratePerLiter * volumeOrQty).toFixed(2));
    const gstAmount = Number(((baseValue * gstPercent) / 100).toFixed(2));
    const vatAmount = Number(((baseValue * vatPercent) / 100).toFixed(2));
    const tdsAmount = Number(((baseValue * tdsPercent) / 100).toFixed(2));
    const totalTax = Number((gstAmount + vatAmount).toFixed(2));
    const finalAmount = Number((baseValue + totalTax - tdsAmount).toFixed(2));

    return {
      ...row,
      id: row.id || `purch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      date,
      supplier,
      saplayer: supplier,
      product,
      ratePerLiter,
      rate: ratePerLiter,
      volumeOrQty,
      quantity: volumeOrQty,
      quntity: volumeOrQty,
      liters: volumeOrQty,
      liter: volumeOrQty,
      gstPercent,
      gstAmount,
      vatPercent,
      vetPercent: vatPercent,
      vatAmount,
      vetAmount: vatAmount,
      tdsPercent,
      tdsAmount,
      totalTax,
      finalAmount,
      finelAmount: finalAmount
    };
  };

  useEffect(() => {
    loadTaxRecords();
  }, [selectedYearMonth]);

  const loadTaxRecords = async () => {
    setLoading(true);
    try {
      const storageKey = `tax_records_${selectedYearMonth}`;
      const rec = await db.settings.get(storageKey);

      if (rec && rec.data) {
        let loadedData = { ...rec.data };
        if (loadedData.vatSettlementInputs) {
          setVatSettlementInputs(loadedData.vatSettlementInputs);
        }

        // Format and migrate purchasing records
        if (Array.isArray(loadedData.purchasing)) {
          loadedData.purchasing = loadedData.purchasing.map(r => computePurchasingRow(r));
        } else {
          loadedData.purchasing = [];
        }
        
        const expectedDays = getDaysInMonth(selectedYearMonth);
        
        // Ensure VAT is formatted as full-month 31-day grid
        if (!loadedData.vat || !Array.isArray(loadedData.vat) || loadedData.vat.length !== expectedDays || loadedData.vat[0]?.day === undefined) {
          const freshVat = generateInitialVatGrid(selectedYearMonth);
          if (Array.isArray(loadedData.vat) && loadedData.vat[0]?.day !== undefined) {
            loadedData.vat.forEach((oldRow, i) => {
              if (i < freshVat.length) freshVat[i] = { ...freshVat[i], ...oldRow };
            });
          }
          loadedData.vat = freshVat;
        }

        // Ensure TDS is formatted as full-month 31-day grid (28 to 31 rows)
        if (!loadedData.tds || !Array.isArray(loadedData.tds) || loadedData.tds.length !== expectedDays || loadedData.tds[0]?.day === undefined) {
          const freshTds = generateInitialTdsGrid(selectedYearMonth);
          if (Array.isArray(loadedData.tds) && loadedData.tds[0]?.day !== undefined) {
            loadedData.tds.forEach((oldRow, i) => {
              if (i < freshTds.length) freshTds[i] = { ...freshTds[i], ...oldRow };
            });
          }
          loadedData.tds = freshTds;
        }

        setTaxData(prev => {
          if (JSON.stringify(prev) === JSON.stringify(loadedData)) return prev;
          if (loadedData.purchasing) {
            syncPurchasingToStockPatrak(loadedData.purchasing);
          }
          return loadedData;
        });
      } else {
        const todayStr = selectedDate || new Date().toISOString().split('T')[0];
        
        // Initial sample records for 5 sections
        const initialData = {
          purchasing: [
            computePurchasingRow({ id: 'purch-1', date: todayStr, supplier: 'IOCL Kandla Depot', product: 'Petrol (MS)', ratePerLiter: 72.40, volumeOrQty: 12000, gstPercent: 0, vatPercent: 13.7, tdsPercent: 0.1 }),
            computePurchasingRow({ id: 'purch-2', date: todayStr, supplier: 'HPCL Hazira Terminal', product: 'Diesel (HSD)', ratePerLiter: 68.10, volumeOrQty: 20000, gstPercent: 0, vatPercent: 14.9, tdsPercent: 0.1 })
          ],
          vat: generateInitialVatGrid(selectedYearMonth),
          gst: [
            { id: 1, date: todayStr, supplierName: 'Servo Lubricants Distributor', gstin: '24AAACD1234F1Z5', invoiceNo: 'INV-8841', taxableValue: 85000, cgstRate: 9, sgstRate: 9, igstRate: 0, cgstAmount: 7650, sgstAmount: 7650, igstAmount: 0, totalTax: 15300, netInvoice: 100300 },
            { id: 2, date: todayStr, supplierName: 'Larsen & Toubro Metering', gstin: '24AABCL9921K1Z2', invoiceNo: 'LT-5510', taxableValue: 42000, cgstRate: 9, sgstRate: 9, igstRate: 0, cgstAmount: 3780, sgstAmount: 3780, igstAmount: 0, totalTax: 7560, netInvoice: 49560 }
          ],
          tds: generateInitialTdsGrid(selectedYearMonth),
          weight: [
            { id: 1, date: todayStr, dispenserNo: 'MPD-1', nozzleInfo: 'N1 (PETROL)', testResult: '5.000 L (Exact)', errorMl: 0, dueMonth: '2026-12', certNo: 'WM-2026-901', officer: 'Inspector K. Patel / Verified', status: 'Valid' },
            { id: 2, date: todayStr, dispenserNo: 'MPD-2', nozzleInfo: 'N3 (DIESEL)', testResult: '4.995 L (-5ml)', errorMl: -5, dueMonth: '2026-09', certNo: 'WM-2026-902', officer: 'Inspector K. Patel / Verified', status: 'Due Soon' }
          ]
        };

        setTaxData(prev => {
          if (JSON.stringify(prev) === JSON.stringify(initialData)) return prev;
          if (initialData.purchasing) {
            syncPurchasingToStockPatrak(initialData.purchasing);
          }
          return initialData;
        });
      }
    } catch (err) {
      console.error('Error loading tax records:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCatalog = async (updatedCatalog) => {
    try {
      await updateProductCatalog(updatedCatalog);
      showToast('Updated Product Catalog!', 'success');
    } catch (err) {
      showToast('Error saving product catalog: ' + err.message, 'error');
    }
  };

  const handleAddItemToCategory = () => {
    if (!newSubProductName.trim()) {
      showToast('Please enter a sub-product name', 'error');
      return;
    }

    const updatedCatalog = productCatalog.map(group => {
      if (group.category === targetCategory) {
        const newItem = {
          id: `item-${Date.now()}`,
          name: newSubProductName.trim(),
          defaultUnit: 'Liter',
          defaultTax: targetCategory.includes('Fuel') ? 'VAT' : 'GST',
          defaultGst: targetCategory.includes('Fuel') ? 0 : 18,
          defaultVat: targetCategory.includes('Fuel') ? 13.7 : 0
        };
        return { ...group, items: [...group.items, newItem] };
      }
      return group;
    });

    handleSaveCatalog(updatedCatalog);
    setNewSubProductName('');
  };

  const handleAddNewCategory = () => {
    if (!newCategoryName.trim()) {
      showToast('Please enter a category name', 'error');
      return;
    }
    const catName = newCategoryName.trim();
    if (productCatalog.some(g => g.category.toLowerCase() === catName.toLowerCase())) {
      showToast('Category already exists', 'error');
      return;
    }

    const initialItemName = newCategoryItemName.trim() || `${catName} Grade 1`;
    const isGst = newProductTaxType === 'GST';
    const newGroup = {
      category: catName,
      items: [
        {
          id: `item-${Date.now()}`,
          name: initialItemName,
          defaultUnit: 'Liter',
          defaultTax: isGst ? 'GST' : 'VAT',
          defaultGst: isGst ? 18 : 0,
          defaultVat: isGst ? 0 : 13.7
        }
      ]
    };

    const updatedCatalog = [...productCatalog, newGroup];
    handleSaveCatalog(updatedCatalog);
    setNewCategoryName('');
    setNewCategoryItemName('');
    setTargetCategory(catName);
  };

  const handleDeleteCatalogItem = (groupIndex, itemIndex) => {
    const updatedCatalog = productCatalog.map((group, gIdx) => {
      if (gIdx === groupIndex) {
        const newItems = group.items.filter((_, iIdx) => iIdx !== itemIndex);
        return { ...group, items: newItems };
      }
      return group;
    }).filter(group => group.items.length > 0);

    handleSaveCatalog(updatedCatalog);
    showToast('Removed item from catalog', 'info');
  };

  const handleDeleteCategory = (categoryName) => {
    const updatedCatalog = productCatalog.filter(group => group.category !== categoryName);
    handleSaveCatalog(updatedCatalog);
    if (targetCategory === categoryName && updatedCatalog.length > 0) {
      setTargetCategory(updatedCatalog[0].category);
    }
    showToast(`Removed category "${categoryName}"`, 'info');
  };

  const handleProductSelect = (index, selectedValue) => {
    if (selectedValue === '__NEW_CUSTOM__') {
      setShowCatalogModal(true);
      return;
    }

    const updated = [...(taxData.purchasing || [])];
    const item = { ...updated[index] };
    item.product = selectedValue;

    // Find product details from catalog
    let matchedGroup = null;
    let matchedItem = null;

    for (const group of productCatalog) {
      const found = group.items?.find(i => i.name === selectedValue);
      if (found) {
        matchedGroup = group;
        matchedItem = found;
        break;
      }
    }

    const catName = matchedGroup ? matchedGroup.category : '';
    const isFuel = isFuelProduct(selectedValue);

    if (isFuel) {
      item.gstPercent = 0;
      item.gstAmount = 0;
      if (matchedItem?.defaultVat !== undefined) {
        item.vatPercent = matchedItem.defaultVat;
      } else if (selectedValue.includes('Diesel')) {
        item.vatPercent = 14.9;
      } else if (selectedValue.includes('CNG')) {
        item.vatPercent = 5.0;
      } else {
        item.vatPercent = 13.7;
      }
    } else {
      // Lubricants, Additives, Specialties -> Standard GST 18% and VAT 0%
      item.gstPercent = matchedItem?.defaultGst !== undefined ? matchedItem.defaultGst : 18;
      item.vatPercent = 0;
      item.vatAmount = 0;
      item.vetAmount = 0;
    }

    // Re-run row auto-calculations
    const rate = parseFloat(item.ratePerLiter !== undefined ? item.ratePerLiter : item.rate) || 0;
    const vol = parseFloat(item.volumeOrQty !== undefined ? item.volumeOrQty : (item.liters || item.quantity || 0)) || 0;
    const gstPct = parseFloat(item.gstPercent) || 0;
    const vatPct = parseFloat(item.vatPercent !== undefined ? item.vatPercent : item.vetPercent) || 0;
    const tdsPct = parseFloat(item.tdsPercent) || 0;

    const baseVal = Number((rate * vol).toFixed(2));
    const gstAmt = Number(((baseVal * gstPct) / 100).toFixed(2));
    const vatAmt = Number(((baseVal * vatPct) / 100).toFixed(2));
    const tdsAmt = Number(((baseVal * tdsPct) / 100).toFixed(2));
    const totTax = Number((gstAmt + vatAmt).toFixed(2));
    const finAmt = Number((baseVal + totTax - tdsAmt).toFixed(2));

    item.volumeOrQty = vol;
    item.quantity = vol;
    item.quntity = vol;
    item.liters = vol;
    item.liter = vol;
    item.gstAmount = gstAmt;
    item.vatAmount = vatAmt;
    item.vetAmount = vatAmt;
    item.tdsAmount = tdsAmt;
    item.totalTax = totTax;
    item.finalAmount = finAmt;
    item.finelAmount = finAmt;

    updated[index] = item;
    setTaxData({ ...taxData, purchasing: updated });
    syncPurchasingToStockPatrak(updated);
  };

  const handleSaveSheet = async (updatedData = taxData) => {
    try {
      const storageKey = `tax_records_${selectedYearMonth}`;
      const saveData = {
        ...updatedData,
        vatSettlementInputs
      };
      await db.settings.put({
        key: storageKey,
        data: saveData,
        updatedAt: new Date().toISOString()
      });
      if (updatedData.purchasing) {
        await syncPurchasingToStockPatrak(updatedData.purchasing);
      }
      showToast('Saved Tax & Statutory Records & Synced Stock Patrak!', 'success');
    } catch (err) {
      showToast('Error saving tax records: ' + err.message, 'error');
    }
  };

  const currentList = taxData[activeSection] || [];

  // Handlers for Row Cell Changes for Standard Lists (Purchasing, GST, Weight)
  const handleCellChange = (index, field, value) => {
    const updated = [...currentList];
    const item = { ...updated[index] };

    if (field === 'date' || field === 'supplier' || field === 'saplayer' || field === 'invoiceNo' || field === 'omcLocation' || field === 'product' || field === 'paymentStatus' || field === 'challanRef' || field === 'status' || field === 'supplierName' || field === 'gstin' || field === 'vendorName' || field === 'section' || field === 'challanNo' || field === 'dispenserNo' || field === 'nozzleInfo' || field === 'testResult' || field === 'dueMonth' || field === 'certNo' || field === 'officer') {
      item[field] = value;
      if (field === 'supplier') item.saplayer = value;
      if (field === 'saplayer') item.supplier = value;
    } else {
      item[field] = value === '' ? '' : (parseFloat(value) || 0);
      if (field === 'ratePerLiter' || field === 'rate') {
        item.ratePerLiter = item[field];
        item.rate = item[field];
      }
      if (field === 'volumeOrQty' || field === 'quantity' || field === 'quntity' || field === 'liters' || field === 'liter') {
        item.volumeOrQty = item[field];
        item.quantity = item[field];
        item.quntity = item[field];
        item.liters = item[field];
        item.liter = item[field];
      }
      if (field === 'vatPercent' || field === 'vetPercent' || field === 'vet %') {
        item.vatPercent = item[field];
        item.vetPercent = item[field];
      }
    }

    // Auto-calculate for Purchasing
    if (activeSection === 'purchasing') {
      const rate = parseFloat(item.ratePerLiter !== undefined ? item.ratePerLiter : item.rate) || 0;
      const vol = parseFloat(item.volumeOrQty !== undefined ? item.volumeOrQty : (item.liters || item.quantity || 0)) || 0;
      const gstPct = parseFloat(item.gstPercent) || 0;
      const vatPct = parseFloat(item.vatPercent !== undefined ? item.vatPercent : item.vetPercent) || 0;
      const tdsPct = parseFloat(item.tdsPercent) || 0;

      const baseVal = Number((rate * vol).toFixed(2));
      const gstAmt = Number(((baseVal * gstPct) / 100).toFixed(2));
      const vatAmt = Number(((baseVal * vatPct) / 100).toFixed(2));
      const tdsAmt = Number(((baseVal * tdsPct) / 100).toFixed(2));
      const totTax = Number((gstAmt + vatAmt).toFixed(2));
      const finAmt = Number((baseVal + totTax - tdsAmt).toFixed(2));

      item.gstAmount = gstAmt;
      item.vatAmount = vatAmt;
      item.vetAmount = vatAmt;
      item.tdsAmount = tdsAmt;
      item.totalTax = totTax;
      item.finalAmount = finAmt;
      item.finelAmount = finAmt;
    }

    // Auto-calculate for GST (Percentage-based tax calculation)
    if (activeSection === 'gst') {
      const taxVal = parseFloat(item.taxableValue) || 0;
      
      // CGST, SGST, IGST Rates entered as percentages (e.g. 9 for 9%)
      const cgstRate = parseFloat(item.cgstRate) || 0;
      const sgstRate = parseFloat(item.sgstRate) || 0;
      const igstRate = parseFloat(item.igstRate) || 0;

      // Calculate actual tax amounts in Rupees
      const cgstAmount = Number(((taxVal * cgstRate) / 100).toFixed(2));
      const sgstAmount = Number(((taxVal * sgstRate) / 100).toFixed(2));
      const igstAmount = Number(((taxVal * igstRate) / 100).toFixed(2));

      const totalTax = Number((cgstAmount + sgstAmount + igstAmount).toFixed(2));
      const netInvoice = Number((taxVal + totalTax).toFixed(2));

      item.cgstAmount = cgstAmount;
      item.sgstAmount = sgstAmount;
      item.igstAmount = igstAmount;
      item.totalTax = totalTax;
      item.netInvoice = netInvoice;
    }

    updated[index] = item;
    const newData = { ...taxData, [activeSection]: updated };
    setTaxData(newData);

    if (activeSection === 'purchasing') {
      syncPurchasingToStockPatrak(updated);
    }
  };

  // Handler for 31-Day VAT Grid
  const handleVatCellChange = (dayIdx, field, value) => {
    const vatList = [...(taxData.vat || [])];
    const row = { ...vatList[dayIdx] };

    const numVal = value === '' ? '' : (parseFloat(value) || 0);
    row[field] = numVal;

    const p = parseFloat(row.petrol) || 0;
    const d = parseFloat(row.diesel) || 0;
    const c = parseFloat(row.cng) || 0;
    const sf = parseFloat(row.smartFuel) || 0;
    row.dailyTotal = Number((p + d + c + sf).toFixed(2));

    vatList[dayIdx] = row;
    const newData = { ...taxData, vat: vatList };
    setTaxData(newData);
  };

  const getRowDateValue = (dayNum) => {
    const [y, m] = (selectedYearMonth || '2026-08').split('-');
    const year = y || '2026';
    const month = m || '08';
    const day = String(dayNum || 1).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleTdsDateChange = (dayIdx, newIsoDate) => {
    const tdsList = [...(taxData.tds || [])];
    const row = { ...tdsList[dayIdx] };
    row.date = newIsoDate;
    row.isoDate = newIsoDate;
    if (newIsoDate) {
      const [y, m, d] = newIsoDate.split('-');
      row.dateFormatted = `${d}/${m}/${y}`;
    }
    tdsList[dayIdx] = row;
    const newData = { ...taxData, tds: tdsList };
    setTaxData(newData);
  };

  const handleVatDateChange = (dayIdx, newIsoDate) => {
    const vatList = [...(taxData.vat || [])];
    const row = { ...vatList[dayIdx] };
    row.date = newIsoDate;
    row.isoDate = newIsoDate;
    if (newIsoDate) {
      const [y, m, d] = newIsoDate.split('-');
      row.dateFormatted = `${d}/${m}/${y}`;
    }
    vatList[dayIdx] = row;
    const newData = { ...taxData, vat: vatList };
    setTaxData(newData);
  };

  // Handler for 31-Day TDS Matrix Grid
  const handleTdsCellChange = (dayIdx, field, value) => {
    const tdsList = [...(taxData.tds || [])];
    const row = { ...tdsList[dayIdx] };

    const numVal = value === '' ? '' : (parseFloat(value) || 0);
    row[field] = numVal;

    const pT = parseFloat(row.petrolTds) || 0;
    const dT = parseFloat(row.dieselTds) || 0;
    const cT = parseFloat(row.cngTds) || 0;
    const sT = parseFloat(row.smartTds) || 0;

    row.dailyTdsTotal = Number((pT + dT + cT + sT).toFixed(2));

    tdsList[dayIdx] = row;
    const newData = { ...taxData, tds: tdsList };
    setTaxData(newData);
  };

  // Handler for Month-End Settlement inputs on Right Panel
  const handleVatSettlementInputChange = (productKey, field, value) => {
    const numVal = value === '' ? '' : (parseFloat(value) || 0);
    setVatSettlementInputs(prev => ({
      ...prev,
      [productKey]: {
        ...prev[productKey],
        [field]: numVal
      }
    }));
  };

  const handleAddEntry = () => {
    const todayStr = selectedDate || new Date().toISOString().split('T')[0];
    let newRecord = {};

    if (activeSection === 'purchasing') {
      newRecord = computePurchasingRow({
        id: `purch-${Date.now()}`,
        date: todayStr,
        supplier: 'IOCL Kandla Depot',
        product: 'Petrol (MS)',
        ratePerLiter: 0,
        volumeOrQty: 0,
        gstPercent: 0,
        vatPercent: 13.7,
        tdsPercent: 0.1
      });
    } else if (activeSection === 'gst') {
      newRecord = { id: Date.now(), date: todayStr, supplierName: 'New Supplier', gstin: '24AAAAA0000A1Z5', invoiceNo: `INV-${Math.floor(1000 + Math.random() * 9000)}`, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0, netInvoice: 0 };
    } else if (activeSection === 'weight') {
      newRecord = { id: Date.now(), date: todayStr, dispenserNo: 'MPD-1', nozzleInfo: 'N1 (PETROL)', testResult: '5.000 L', errorMl: 0, dueMonth: '2026-12', certNo: 'WM-2026-NEW', officer: 'Verified', status: 'Valid' };
    } else if (activeSection === 'vat' || activeSection === 'tds') {
      showToast(`${activeSection.toUpperCase()} register is pre-generated as a 31-day monthly sheet. Edit cell values directly.`, 'info');
      return;
    }

    const updatedList = [...currentList, newRecord];
    const newData = { ...taxData, [activeSection]: updatedList };
    setTaxData(newData);
    if (activeSection === 'purchasing') {
      syncPurchasingToStockPatrak(updatedList);
    }
    showToast(`Added new entry to ${activeSection.toUpperCase()}`, 'info');
  };

  const handleDeleteEntry = (index) => {
    const updated = currentList.filter((_, i) => i !== index);
    const newData = { ...taxData, [activeSection]: updated };
    setTaxData(newData);
    if (activeSection === 'purchasing') {
      syncPurchasingToStockPatrak(updated);
    }
    showToast('Entry removed', 'info');
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

  // Purchasing Totals Calculations
  const purchasingList = taxData.purchasing || [];
  const grandTotalPurchasingVolume = purchasingList.reduce((acc, r) => acc + (parseFloat(r.volumeOrQty !== undefined ? r.volumeOrQty : (r.liters || r.quantity || 0)) || 0), 0);
  const grandTotalPurchasingGst = purchasingList.reduce((acc, r) => acc + (parseFloat(r.gstAmount) || 0), 0);
  const grandTotalPurchasingVat = purchasingList.reduce((acc, r) => acc + (parseFloat(r.vatAmount !== undefined ? r.vatAmount : r.vetAmount) || 0), 0);
  const grandTotalPurchasingTds = purchasingList.reduce((acc, r) => acc + (parseFloat(r.tdsAmount) || 0), 0);
  const grandTotalPurchasingTax = purchasingList.reduce((acc, r) => acc + (parseFloat(r.totalTax) || 0), 0);
  const grandTotalPurchasingFinal = purchasingList.reduce((acc, r) => acc + (parseFloat(r.finalAmount !== undefined ? r.finalAmount : r.finelAmount) || 0), 0);

  // VAT Left-Panel Turnover Totals Calculations
  const vatList = taxData.vat || [];
  const totalVatPetrol = vatList.reduce((acc, r) => acc + (parseFloat(r.petrol) || 0), 0);
  const totalVatDiesel = vatList.reduce((acc, r) => acc + (parseFloat(r.diesel) || 0), 0);
  const totalVatCng = vatList.reduce((acc, r) => acc + (parseFloat(r.cng) || 0), 0);
  const totalVatSmart = vatList.reduce((acc, r) => acc + (parseFloat(r.smartFuel) || 0), 0);
  const grandTotalVat = vatList.reduce((acc, r) => acc + (parseFloat(r.dailyTotal) || 0), 0);

  // TDS 31-Day Matrix Totals Calculations
  const tdsList = taxData.tds || [];
  const totalTdsPetrolAmt = tdsList.reduce((acc, r) => acc + (parseFloat(r.petrolAmt) || 0), 0);
  const totalTdsPetrolTds = tdsList.reduce((acc, r) => acc + (parseFloat(r.petrolTds) || 0), 0);

  const totalTdsDieselAmt = tdsList.reduce((acc, r) => acc + (parseFloat(r.dieselAmt) || 0), 0);
  const totalTdsDieselTds = tdsList.reduce((acc, r) => acc + (parseFloat(r.dieselTds) || 0), 0);

  const totalTdsCngAmt = tdsList.reduce((acc, r) => acc + (parseFloat(r.cngAmt) || 0), 0);
  const totalTdsCngTds = tdsList.reduce((acc, r) => acc + (parseFloat(r.cngTds) || 0), 0);

  const totalTdsSmartAmt = tdsList.reduce((acc, r) => acc + (parseFloat(r.smartAmt) || 0), 0);
  const totalTdsSmartTds = tdsList.reduce((acc, r) => acc + (parseFloat(r.smartTds) || 0), 0);

  const grandTotalTdsDeducted = tdsList.reduce((acc, r) => acc + (parseFloat(r.dailyTdsTotal) || 0), 0);

  // VAT Right-Panel Month-End Settlement Math Calculation Engine
  const computeVatSettlement = (prodKey, baseTurnover) => {
    const input = vatSettlementInputs[prodKey] || { totalSales: 0, vatRate: 0 };
    const X = parseFloat(input.totalSales) || 0;
    const A = parseFloat(input.vatRate) || 0;
    const B = A + 100;
    const Z = B > 0 ? (X * A) / B : 0;
    const netVatPayable = Z - baseTurnover;
    return { X, A, B, Z, baseTurnover, netVatPayable };
  };

  const vatPetrolCalc = computeVatSettlement('petrol', totalVatPetrol);
  const vatDieselCalc = computeVatSettlement('diesel', totalVatDiesel);
  const vatCngCalc = computeVatSettlement('cng', totalVatCng);
  const vatSmartCalc = computeVatSettlement('smartFuel', totalVatSmart);

  const finalTotalVatPayable = vatPetrolCalc.netVatPayable + vatDieselCalc.netVatPayable + vatCngCalc.netVatPayable + vatSmartCalc.netVatPayable;

  // Export CSV
  const handleExportCSV = () => {
    if (activeSection === 'vat') {
      let csv = `31-DAY VAT TURNOVER REGISTER & SETTLEMENT - (${monthName.toUpperCase()})\n\n`;
      csv += `--- LEFT PANEL: 31-DAY DAILY FUEL TURNOVER ---\n`;
      csv += `DAY / DATE,PETROL (MS RS),DIESEL (HSD RS),CNG (CNG RS),SMART FUEL (RS),DAILY TOTAL (RS)\n`;
      vatList.forEach(r => {
        csv += `"${r.dateFormatted}",${r.petrol || 0},${r.diesel || 0},${r.cng || 0},${r.smartFuel || 0},${r.dailyTotal || 0}\n`;
      });
      csv += `"MONTHLY GRAND TOTAL:",${totalVatPetrol},${totalVatDiesel},${totalVatCng},${totalVatSmart},${grandTotalVat}\n\n`;

      csv += `--- RIGHT PANEL: MONTH-END VAT SETTLEMENT ASSESSMENT ---\n`;
      csv += `PRODUCT,TOTAL SALES (RS),VAT RATE (%),TURNOVER (31-DAY),NET VAT PAYABLE (RS)\n`;
      csv += `"PETROL",${vatPetrolCalc.X},${vatPetrolCalc.A},${vatPetrolCalc.baseTurnover},${vatPetrolCalc.netVatPayable.toFixed(2)}\n`;
      csv += `"DIESEL",${vatDieselCalc.X},${vatDieselCalc.A},${vatDieselCalc.baseTurnover},${vatDieselCalc.netVatPayable.toFixed(2)}\n`;
      csv += `"CNG",${vatCngCalc.X},${vatCngCalc.A},${vatCngCalc.baseTurnover},${vatCngCalc.netVatPayable.toFixed(2)}\n`;
      csv += `"SMART FUEL",${vatSmartCalc.X},${vatSmartCalc.A},${vatSmartCalc.baseTurnover},${vatSmartCalc.netVatPayable.toFixed(2)}\n`;
      csv += `"FINAL TOTAL VAT PAYABLE:",,,,${finalTotalVatPayable.toFixed(2)}\n`;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `VAT_SETTLEMENT_REGISTER_${selectedYearMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Exported VAT Settlement Register to CSV!`, 'success');
      return;
    }

    if (activeSection === 'tds') {
      let csv = `31-DAY TDS REGISTER - (${monthName.toUpperCase()})\n`;
      csv += `DAY / DATE,PETROL AMT (RS),PETROL TDS (RS),DIESEL AMT (RS),DIESEL TDS (RS),CNG AMT (RS),CNG TDS (RS),SMART AMT (RS),SMART TDS (RS),DAILY TDS TOTAL (RS)\n`;
      tdsList.forEach(r => {
        csv += `"${r.dateFormatted}",${r.petrolAmt || 0},${r.petrolTds || 0},${r.dieselAmt || 0},${r.dieselTds || 0},${r.cngAmt || 0},${r.cngTds || 0},${r.smartAmt || 0},${r.smartTds || 0},${r.dailyTdsTotal || 0}\n`;
      });
      csv += `"MONTHLY GRAND TOTAL:",${totalTdsPetrolAmt},${totalTdsPetrolTds},${totalTdsDieselAmt},${totalTdsDieselTds},${totalTdsCngAmt},${totalTdsCngTds},${totalTdsSmartAmt},${totalTdsSmartTds},${grandTotalTdsDeducted}\n`;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `TDS_REGISTER_${selectedYearMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Exported 31-Day TDS Register to CSV!`, 'success');
      return;
    }

    if (currentList.length === 0) return;
    let csv = `TAX COMPLIANCE REPORT - ${activeSection.toUpperCase()} (${monthName.toUpperCase()})\n`;
    
    if (activeSection === 'purchasing') {
      csv += `#,DATE,SUPPLIER,PRODUCT,RATE (RS),LITRE / QUANTITY,UNIT,GST (%),GST AMOUNT (RS),VAT (%),VAT AMOUNT (RS),TDS (%),TDS AMOUNT (RS),TOTAL TAX (RS),FINAL AMOUNT (RS)\n`;
      currentList.forEach((r, idx) => {
        const vol = r.volumeOrQty !== undefined ? r.volumeOrQty : (r.liters || r.quantity || 0);
        const unit = isFuelProduct(r.product) ? 'L' : 'Pcs';
        csv += `${idx + 1},"${r.date}","${r.supplier || r.saplayer || ''}","${r.product || ''}",${r.ratePerLiter || 0},${vol},${unit},${r.gstPercent || 0},${r.gstAmount || 0},${r.vatPercent || 0},${r.vatAmount || 0},${r.tdsPercent || 0},${r.tdsAmount || 0},${r.totalTax || 0},${r.finalAmount || 0}\n`;
      });
      csv += `"TOTALS:",,,,,${grandTotalPurchasingVolume},,${grandTotalPurchasingGst.toFixed(2)},,${grandTotalPurchasingVat.toFixed(2)},,${grandTotalPurchasingTds.toFixed(2)},${grandTotalPurchasingTax.toFixed(2)},${grandTotalPurchasingFinal.toFixed(2)}\n`;
    } else if (activeSection === 'gst') {
      csv += `DATE,SUPPLIER NAME,GSTIN,INVOICE NO,TAXABLE VALUE (RS),CGST RATE (%),SGST RATE (%),IGST RATE (%),TOTAL TAX (RS),NET TOTAL (RS)\n`;
      currentList.forEach(r => {
        csv += `"${r.date}","${r.supplierName}","${r.gstin}","${r.invoiceNo}",${r.taxableValue},${r.cgstRate || 0},${r.sgstRate || 0},${r.igstRate || 0},${r.totalTax || 0},${r.netInvoice || 0}\n`;
      });
    } else if (activeSection === 'weight') {
      csv += `DATE,DISPENSER,NOZZLE,TEST RESULT,ERROR (ML),DUE MONTH,CERTIFICATE NO,OFFICER/REMARKS,STATUS\n`;
      currentList.forEach(r => {
        csv += `"${r.date}","${r.dispenserNo}","${r.nozzleInfo}","${r.testResult}",${r.errorMl},"${r.dueMonth}","${r.certNo}","${r.officer}",${r.status}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `TAX_${activeSection.toUpperCase()}_${selectedYearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${activeSection.toUpperCase()} Tax Report to CSV!`, 'success');
  };

  // Landscape PDF Report Generator
  const handlePrintPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(stationProfile?.fuelStationName || 'SHITAL PETROL PUMP', pageWidth / 2, 10, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`TAX & STATUTORY COMPLIANCE REPORT — ${activeSection.toUpperCase()} (${monthName.toUpperCase()})`, pageWidth / 2, 16, { align: 'center' });

      let head = [];
      let body = [];

      if (activeSection === 'vat') {
        head = [['DAY / DATE', 'PETROL (MS ₹)', 'DIESEL (HSD ₹)', 'CNG (CNG ₹)', 'SMART FUEL (₹)', 'DAILY TOTAL (₹)']];
        body = vatList.map((r) => [r.dateFormatted, r.petrol || 0, r.diesel || 0, r.cng || 0, r.smartFuel || 0, r.dailyTotal || 0]);
        body.push(['MONTHLY GRAND TOTAL:', totalVatPetrol, totalVatDiesel, totalVatCng, totalVatSmart, grandTotalVat]);

        autoTable(doc, {
          startY: 20,
          head: head,
          body: body,
          theme: 'grid',
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 1.5 },
        });

        // Add Month-End VAT Settlement Summary Table to PDF
        const finalY = (doc).lastAutoTable.finalY + 8;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('MONTH-END VAT RECONCILIATION & SETTLEMENT ASSESSMENT', 14, finalY);

        const settHead = [['PRODUCT', 'TOTAL SALES (₹)', 'VAT RATE (%)', 'TURNOVER (31-DAY)', 'NET VAT PAYABLE (₹)']];
        const settBody = [
          ['PETROL', vatPetrolCalc.X.toFixed(2), `${vatPetrolCalc.A}%`, vatPetrolCalc.baseTurnover.toFixed(2), vatPetrolCalc.netVatPayable.toFixed(2)],
          ['DIESEL', vatDieselCalc.X.toFixed(2), `${vatDieselCalc.A}%`, vatDieselCalc.baseTurnover.toFixed(2), vatDieselCalc.netVatPayable.toFixed(2)],
          ['CNG', vatCngCalc.X.toFixed(2), `${vatCngCalc.A}%`, vatCngCalc.baseTurnover.toFixed(2), vatCngCalc.netVatPayable.toFixed(2)],
          ['SMART FUEL', vatSmartCalc.X.toFixed(2), `${vatSmartCalc.A}%`, vatSmartCalc.baseTurnover.toFixed(2), vatSmartCalc.netVatPayable.toFixed(2)],
          ['FINAL TOTAL VAT PAYABLE:', '', '', '', finalTotalVatPayable.toFixed(2)]
        ];

        autoTable(doc, {
          startY: finalY + 3,
          head: settHead,
          body: settBody,
          theme: 'grid',
          headStyles: { fillColor: [245, 158, 11], textColor: 255, fontSize: 8, fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2 },
        });

        doc.save(`VAT_SETTLEMENT_ASSESSMENT_${selectedYearMonth}.pdf`);
        showToast(`Generated VAT Assessment PDF Report!`, 'success');
        return;
      }

      if (activeSection === 'tds') {
        head = [
          [
            { content: 'DAY / DATE', rowSpan: 2 },
            { content: 'PETROL', colSpan: 2 },
            { content: 'DIESEL', colSpan: 2 },
            { content: 'CNG', colSpan: 2 },
            { content: 'SMART FUEL', colSpan: 2 },
            { content: 'DAILY TDS (₹)', rowSpan: 2 }
          ],
          ['AMOUNT (₹)', 'TDS (₹)', 'AMOUNT (₹)', 'TDS (₹)', 'AMOUNT (₹)', 'TDS (₹)', 'AMOUNT (₹)', 'TDS (₹)']
        ];

        body = tdsList.map((r) => [
          r.dateFormatted,
          r.petrolAmt || 0, r.petrolTds || 0,
          r.dieselAmt || 0, r.dieselTds || 0,
          r.cngAmt || 0, r.cngTds || 0,
          r.smartAmt || 0, r.smartTds || 0,
          r.dailyTdsTotal || 0
        ]);

        body.push([
          'GRAND TOTAL:',
          totalTdsPetrolAmt, totalTdsPetrolTds,
          totalTdsDieselAmt, totalTdsDieselTds,
          totalTdsCngAmt, totalTdsCngTds,
          totalTdsSmartAmt, totalTdsSmartTds,
          grandTotalTdsDeducted
        ]);

        autoTable(doc, {
          startY: 20,
          head: head,
          body: body,
          theme: 'grid',
          headStyles: { fillColor: [234, 88, 12], textColor: 255, fontSize: 7, fontStyle: 'bold' },
          styles: { fontSize: 7, cellPadding: 1.5 },
        });

        const finalY = (doc).lastAutoTable.finalY + 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`CNG TDS RECONCILIATION (0.10% RATE): Total CNG Turnover ₹ ${totalTdsCngAmt.toFixed(2)} | Reconciled CNG TDS: ₹ ${(totalTdsCngAmt * 0.001).toFixed(2)}`, 14, finalY);

        doc.save(`TDS_REGISTER_${selectedYearMonth}.pdf`);
        showToast(`Generated TDS Register PDF Report!`, 'success');
        return;
      }

      if (activeSection === 'purchasing') {
        head = [['#', 'DATE', 'SUPPLIER', 'PRODUCT', 'RATE (₹)', 'LITRE / QTY', 'GST%', 'GST (₹)', 'VAT%', 'VAT (₹)', 'TDS%', 'TDS (₹)', 'TOT TAX (₹)', 'FINAL AMT (₹)']];
        body = currentList.map((r, i) => {
          const vol = r.volumeOrQty !== undefined ? r.volumeOrQty : (r.liters || r.quantity || 0);
          const unit = isFuelProduct(r.product) ? 'L' : 'Pcs';
          return [
            i + 1,
            r.date,
            r.supplier || r.saplayer || '',
            r.product || '',
            r.ratePerLiter || 0,
            `${vol} ${unit}`,
            `${r.gstPercent || 0}%`,
            (r.gstAmount || 0).toFixed(2),
            `${r.vatPercent || 0}%`,
            (r.vatAmount || 0).toFixed(2),
            `${r.tdsPercent || 0}%`,
            (r.tdsAmount || 0).toFixed(2),
            (r.totalTax || 0).toFixed(2),
            (r.finalAmount || 0).toFixed(2)
          ];
        });
        body.push([
          'TOTALS:', '', '', '', '',
          `${grandTotalPurchasingVolume.toLocaleString('en-IN', { maximumFractionDigits: 2 })} (L/Pcs)`,
          '', grandTotalPurchasingGst.toFixed(2),
          '', grandTotalPurchasingVat.toFixed(2),
          '', grandTotalPurchasingTds.toFixed(2),
          grandTotalPurchasingTax.toFixed(2),
          grandTotalPurchasingFinal.toFixed(2)
        ]);
      } else if (activeSection === 'gst') {
        head = [['#', 'DATE', 'SUPPLIER NAME', 'GSTIN', 'INV NO', 'TAXABLE (₹)', 'CGST (%)', 'SGST (%)', 'IGST (%)', 'TOTAL TAX (₹)', 'NET TOTAL (₹)']];
        body = currentList.map((r, i) => [
          i + 1,
          r.date,
          r.supplierName,
          r.gstin,
          r.invoiceNo,
          r.taxableValue,
          `${r.cgstRate || 0}% (₹${r.cgstAmount || 0})`,
          `${r.sgstRate || 0}% (₹${r.sgstAmount || 0})`,
          `${r.igstRate || 0}% (₹${r.igstAmount || 0})`,
          r.totalTax || 0,
          r.netInvoice || 0
        ]);
      } else if (activeSection === 'weight') {
        head = [['#', 'DATE', 'DISPENSER', 'NOZZLE / PRODUCT', 'TEST RESULT', 'ERROR (ml)', 'STAMP DUE', 'CERT NO', 'STATUS']];
        body = currentList.map((r, i) => [i + 1, r.date, r.dispenserNo, r.nozzleInfo, r.testResult, r.errorMl, r.dueMonth, r.certNo, r.status]);
      }

      autoTable(doc, {
        startY: 20,
        head: head,
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
      });

      doc.save(`TAX_${activeSection.toUpperCase()}_${selectedYearMonth}.pdf`);
      showToast(`Generated ${activeSection.toUpperCase()} Tax PDF Report!`, 'success');
    } catch (err) {
      showToast('Error generating PDF: ' + err.message, 'error');
    }
  };

  if (loading) return <div className="p-8 text-center text-sm font-semibold text-slate-400">Loading Tax & Compliance Register...</div>;

  // Standard input class for high contrast black text (Height strictly 25px)
  const inputClass = "w-full h-[25px] bg-white text-slate-900 font-extrabold placeholder-slate-400 border border-slate-300 rounded-lg px-2 py-0 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-xs font-sans outline-none shadow-2xs select-text";
  const monoInputClass = "w-full h-[25px] bg-white text-slate-900 font-extrabold placeholder-slate-400 border border-slate-300 rounded-lg px-2 py-0 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-xs font-mono outline-none shadow-2xs select-text";
  const numInputClass = "w-full h-[25px] bg-white text-slate-900 font-extrabold placeholder-slate-400 border border-slate-300 rounded-lg px-2 py-0 text-right font-mono text-xs outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs select-text";
  const selectClass = "w-full h-[25px] bg-white text-slate-900 font-extrabold border border-slate-300 rounded-lg px-2 py-0 text-xs outline-none focus:border-blue-600 shadow-2xs cursor-pointer select-text";

  return (
    <div className="p-4 space-y-3.5 animate-fadeIn bg-[#0c121d] min-h-screen select-text font-sans text-slate-200">
      {/* Sleek Top Action Bar & Month Selector */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-[#121927] p-3 rounded-xl border border-[#1e293b] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-xs text-slate-100 tracking-wide">Tax & Statutory Compliance Module</span>
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
                <option key={m.val} value={m.val} className="text-slate-200 bg-[#121927]">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {activeSection !== 'vat' && activeSection !== 'tds' && (
            <button type="button"
              onClick={handleAddEntry}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white shadow-xs transition-all active:scale-95 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Entry</span>
            </button>
          )}

          <button type="button"
            onClick={handlePrintPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all active:scale-95"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>{activeSection === 'vat' ? 'Print VAT Assessment' : activeSection === 'tds' ? 'Print TDS Register' : 'Print Tax Report'}</span>
          </button>

          <button type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all active:scale-95"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export CSV</span>
          </button>

          <button type="button"
            onClick={() => handleSaveSheet()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>Save Sheet</span>
          </button>
        </div>
      </div>

      {/* 5 Tax Section Tabs */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs overflow-x-auto select-none">
        {TAX_SECTIONS.map((sec) => {
          const isActive = sec.key === activeSection;
          const Icon = sec.icon;
          return (
            <button type="button"
              key={sec.key}
              onClick={() => setActiveSection(sec.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs cursor-pointer transition-all duration-150 whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white font-black shadow-md scale-[1.02]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold border border-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : sec.color}`} />
              <span>{sec.label}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                isActive ? 'bg-blue-700/60 text-blue-100' : 'bg-slate-200/80 text-slate-600'
              }`}>
                ({sec.key === 'vat' ? vatList.length : sec.key === 'tds' ? tdsList.length : taxData[sec.key]?.length || 0})
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Workspace View */}
      <div className="space-y-4">
        
        {/* TAB 1: PURCHASING */}
        {activeSection === 'purchasing' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-purple-600" />
                📦 OIL MARKETING COMPANY (OMC) PURCHASING INVOICES — <span className="text-slate-500 font-normal">{monthName}</span>
              </h3>
              
              <button type="button"
                onClick={() => setShowCatalogModal(true)}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 whitespace-nowrap cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <span>🏷️ Manage Products & Lubricants</span>
              </button>
            </div>

            {/* Top Summary Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2 font-mono">
              <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-3 flex flex-col justify-between shadow-2xs">
                <span className="text-[11px] font-bold text-purple-700 font-sans uppercase tracking-wide">Total Billed Volume / Qty</span>
                <span className="text-base font-black text-purple-950 mt-1">{grandTotalPurchasingVolume.toLocaleString('en-IN', { maximumFractionDigits: 2 })} (L / Pcs)</span>
              </div>
              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 flex flex-col justify-between shadow-2xs">
                <span className="text-[11px] font-bold text-amber-700 font-sans uppercase tracking-wide">Total Tax Collected/Paid</span>
                <span className="text-base font-black text-amber-950 mt-1">₹ {grandTotalPurchasingTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 flex flex-col justify-between shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-700 font-sans uppercase tracking-wide">Total Invoiced Value</span>
                <span className="text-base font-black text-emerald-950 mt-1">₹ {grandTotalPurchasingFinal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* 15-Column Dynamic Excel Purchase Table */}
            <div className="overflow-x-auto thick-scrollbar rounded-xl border border-slate-200 shadow-2xs pb-2">
              <table className="w-full text-left border-collapse font-sans text-xs min-w-[1350px]">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-extrabold uppercase tracking-wider border-b border-slate-800">
                    <th className="p-2.5 border-r border-slate-700 w-10 text-center bg-slate-950">#</th>
                    <th className="p-2.5 border-r border-slate-700 w-28">DATE</th>
                    <th className="p-2.5 border-r border-slate-700 w-40">SUPPLIER (saplayer)</th>
                    <th className="p-2.5 border-r border-slate-700 w-48">PRODUCT</th>
                    <th className="p-2.5 border-r border-slate-700 text-right w-28">RATE (₹)</th>
                    <th className="p-2.5 border-r border-slate-700 text-right w-36 bg-blue-900/40">
                      <div className="flex items-center justify-end gap-1">
                        <span>LITRE (L) / QTY (Pcs)</span>
                      </div>
                    </th>
                    <th className="p-2.5 border-r border-slate-700 text-right w-20">GST %</th>
                    <th className="p-2.5 border-r border-slate-700 text-right w-28 bg-blue-900/40">GST AMOUNT</th>
                    <th className="p-2.5 border-r border-slate-700 text-right w-20">VAT %</th>
                    <th className="p-2.5 border-r border-slate-700 text-right w-28 bg-amber-900/40">VAT AMOUNT</th>
                    <th className="p-2.5 border-r border-slate-700 text-right w-20">TDS %</th>
                    <th className="p-2.5 border-r border-slate-700 text-right w-28 bg-orange-900/40">TDS AMOUNT</th>
                    <th className="p-2.5 border-r border-slate-700 text-right w-28 bg-purple-900/40">TOTAL TAX</th>
                    <th className="p-2.5 border-r border-slate-700 text-right w-32 bg-emerald-900/40">FINAL AMOUNT (₹)</th>
                    <th className="p-2.5 text-center w-12">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-semibold select-text">
                  {currentList.map((row, idx) => (
                    <tr key={row.id || idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2 text-center font-mono text-slate-700 font-extrabold border-r border-slate-200">{idx + 1}</td>
                      
                      {/* 1. DATE */}
                      <td className="p-1.5 border-r border-slate-200">
                        <input type="date" value={row.date || ''} onChange={(e) => handleCellChange(idx, 'date', e.target.value)} className={monoInputClass} />
                      </td>

                      {/* 2. SUPPLIER */}
                      <td className="p-1.5 border-r border-slate-200">
                        <input type="text" placeholder="e.g. IOCL Kandla" value={row.supplier || row.saplayer || ''} onChange={(e) => handleCellChange(idx, 'supplier', e.target.value)} className={inputClass} />
                      </td>

                      {/* 3. DYNAMIC PRODUCT SELECTOR */}
                      <td className="p-1.5 border-r border-slate-200">
                        <select
                          value={row.product || 'Petrol (MS)'}
                          onChange={(e) => handleProductSelect(idx, e.target.value)}
                          className={selectClass}
                        >
                          <option value="" disabled>Select Product / Lubricant</option>
                          {productCatalog.map((group) => (
                            <optgroup key={group.category} label={`── ${group.category.toUpperCase()} ──`}>
                              {group.items.map((item) => (
                                <option key={item.id || item.name} value={item.name}>
                                  {item.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                          <option value="__NEW_CUSTOM__" className="font-bold text-blue-600 bg-blue-50">➕ + Add New Custom Product...</option>
                        </select>
                      </td>

                      {/* 4. RATE */}
                      <td className="p-1.5 border-r border-slate-200">
                        <input type="number" step="0.01" min="0" placeholder="0.00" value={row.ratePerLiter !== undefined ? row.ratePerLiter : (row.rate !== undefined ? row.rate : '')} onChange={(e) => handleCellChange(idx, 'ratePerLiter', e.target.value)} className={numInputClass} />
                      </td>

                      {/* 5. DYNAMIC LITRE (L) / QUANTITY (Pcs/Nos) */}
                      <td className="p-1.5 border-r border-slate-200">
                        <div className="relative flex items-center">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={isFuelProduct(row.product) ? "0.00 L" : "0 Pcs"}
                            value={
                              row.volumeOrQty !== undefined
                                ? row.volumeOrQty
                                : (row.liters !== undefined && row.liters > 0)
                                  ? row.liters
                                  : (row.quantity !== undefined ? row.quantity : '')
                            }
                            onChange={(e) => handleCellChange(idx, 'volumeOrQty', e.target.value)}
                            className={`${numInputClass} pr-9 font-extrabold text-slate-900 bg-white`}
                          />
                          <span className={`absolute right-1 text-[10px] font-black px-1 py-0.2 rounded ${
                            isFuelProduct(row.product)
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-purple-100 text-purple-800 border border-purple-300'
                          }`}>
                            {isFuelProduct(row.product) ? 'L' : 'Pcs'}
                          </span>
                        </div>
                      </td>

                      {/* 6. GST % */}
                      <td className="p-1.5 border-r border-slate-200">
                        <input type="number" step="0.1" min="0" placeholder="0" value={row.gstPercent !== undefined ? row.gstPercent : ''} onChange={(e) => handleCellChange(idx, 'gstPercent', e.target.value)} className={numInputClass} />
                      </td>

                      {/* 7. GST AMOUNT (Read-Only) */}
                      <td className="p-1.5 border-r border-slate-200 bg-blue-50/50">
                        <input type="text" readOnly value={(row.gstAmount || 0).toFixed(2)} className="w-full h-[25px] py-0 bg-blue-100/50 text-blue-900 font-extrabold text-right font-mono text-xs px-2 rounded-lg border border-blue-200 cursor-not-allowed outline-none" />
                      </td>

                      {/* 8. VAT % */}
                      <td className="p-1.5 border-r border-slate-200">
                        <input type="number" step="0.1" min="0" placeholder="0" value={row.vatPercent !== undefined ? row.vatPercent : (row.vetPercent !== undefined ? row.vetPercent : '')} onChange={(e) => handleCellChange(idx, 'vatPercent', e.target.value)} className={numInputClass} />
                      </td>

                      {/* 9. VAT AMOUNT (Read-Only) */}
                      <td className="p-1.5 border-r border-slate-200 bg-amber-50/50">
                        <input type="text" readOnly value={(row.vatAmount !== undefined ? row.vatAmount : (row.vetAmount || 0)).toFixed(2)} className="w-full h-[25px] py-0 bg-amber-100/50 text-amber-900 font-extrabold text-right font-mono text-xs px-2 rounded-lg border border-amber-200 cursor-not-allowed outline-none" />
                      </td>

                      {/* 10. TDS % */}
                      <td className="p-1.5 border-r border-slate-200">
                        <input type="number" step="0.01" min="0" placeholder="0" value={row.tdsPercent !== undefined ? row.tdsPercent : ''} onChange={(e) => handleCellChange(idx, 'tdsPercent', e.target.value)} className={numInputClass} />
                      </td>

                      {/* 11. TDS AMOUNT (Read-Only) */}
                      <td className="p-1.5 border-r border-slate-200 bg-orange-50/50">
                        <input type="text" readOnly value={(row.tdsAmount || 0).toFixed(2)} className="w-full h-[25px] py-0 bg-orange-100/50 text-orange-900 font-extrabold text-right font-mono text-xs px-2 rounded-lg border border-orange-200 cursor-not-allowed outline-none" />
                      </td>

                      {/* 12. TOTAL TAX (Read-Only) */}
                      <td className="p-1.5 border-r border-slate-200 bg-purple-50/50">
                        <input type="text" readOnly value={(row.totalTax || 0).toFixed(2)} className="w-full h-[25px] py-0 bg-purple-100/50 text-purple-950 font-extrabold text-right font-mono text-xs px-2 rounded-lg border border-purple-200 cursor-not-allowed outline-none" />
                      </td>

                      {/* 13. FINAL AMOUNT (Read-Only) */}
                      <td className="p-1.5 border-r border-slate-200 bg-emerald-50/60">
                        <input type="text" readOnly value={(row.finalAmount !== undefined ? row.finalAmount : (row.finelAmount || 0)).toFixed(2)} className="w-full h-[25px] py-0 bg-emerald-100/80 text-emerald-950 font-black text-right font-mono text-xs px-2 rounded-lg border border-emerald-300 cursor-not-allowed outline-none" />
                      </td>

                      {/* 14. ACTION */}
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => handleDeleteEntry(idx)} title="Delete Purchase Entry" className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {currentList.length === 0 && (
                    <tr>
                      <td colSpan="15" className="p-8 text-center text-slate-400 font-semibold italic">
                        No purchase invoice entries added yet. Click "+ Add Entry" to record a purchase invoice.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-900 text-white font-extrabold text-xs font-mono border-t-2 border-slate-800">
                    <td colSpan="5" className="p-3 text-right uppercase tracking-wider text-amber-400">TOTALS:</td>
                    <td className="p-3 text-right border-r border-slate-800 text-cyan-300 font-black">
                      {grandTotalPurchasingVolume.toLocaleString('en-IN', { maximumFractionDigits: 2 })} (L/Pcs)
                    </td>
                    <td className="p-3 border-r border-slate-800 text-center text-slate-500">-</td>
                    <td className="p-3 text-right border-r border-slate-800 text-blue-300 font-black">
                      ₹ {grandTotalPurchasingGst.toFixed(2)}
                    </td>
                    <td className="p-3 border-r border-slate-800 text-center text-slate-500">-</td>
                    <td className="p-3 text-right border-r border-slate-800 text-amber-300 font-black">
                      ₹ {grandTotalPurchasingVat.toFixed(2)}
                    </td>
                    <td className="p-3 border-r border-slate-800 text-center text-slate-500">-</td>
                    <td className="p-3 text-right border-r border-slate-800 text-orange-300 font-black">
                      ₹ {grandTotalPurchasingTds.toFixed(2)}
                    </td>
                    <td className="p-3 text-right border-r border-slate-800 text-purple-200 font-black">
                      ₹ {grandTotalPurchasingTax.toFixed(2)}
                    </td>
                    <td className="p-3 text-right border-r border-slate-800 text-emerald-300 font-black text-sm">
                      ₹ {grandTotalPurchasingFinal.toFixed(2)}
                    </td>
                    <td className="p-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: VAT (SPLIT-SCREEN WORKSPACE LAYOUT) */}
        {activeSection === 'vat' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            
            {/* LEFT PANEL (~60% WIDTH): 31-DAY VAT & FUEL TURNOVER REGISTER */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-amber-600" />
                  MONTHLY 31-DAY VAT & FUEL TURNOVER REGISTER — <span className="text-slate-500 font-normal">{monthName}</span>
                </h3>
              </div>

              <div className="overflow-x-auto max-h-[580px] overflow-y-auto rounded-xl border border-slate-300 shadow-xs">
                <table className="w-full text-left border-collapse font-sans text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-200/90 text-slate-900 text-[11px] font-black uppercase tracking-wider border-b border-slate-300 shadow-xs">
                      <th className="p-2 border-r border-slate-300 w-28 text-center bg-slate-300/80">DAY / DATE</th>
                      <th className="p-2 border-r border-slate-300 text-right bg-orange-100/90 text-orange-950">PETROL (₹)</th>
                      <th className="p-2 border-r border-slate-300 text-right bg-blue-100/90 text-blue-950">DIESEL (₹)</th>
                      <th className="p-2 border-r border-slate-300 text-right bg-emerald-100/90 text-emerald-950">CNG (₹)</th>
                      <th className="p-2 border-r border-slate-300 text-right bg-purple-100/90 text-purple-950">SMART (₹)</th>
                      <th className="p-2 text-right bg-slate-800 text-amber-300 font-black">DAILY TOTAL (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold select-text">
                    {vatList.map((row, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/30 transition-colors">
                        <td className="px-3 py-2 text-center whitespace-nowrap bg-slate-50 border-r border-slate-300">
                          <div className="relative inline-block w-full max-w-[150px]">
                            <input
                              type="date"
                              value={row.date || row.isoDate || getRowDateValue(idx + 1)}
                              onChange={(e) => handleVatDateChange(idx, e.target.value)}
                              className="w-full bg-white text-slate-900 font-mono font-semibold text-xs px-2.5 py-1.5 border border-slate-300 rounded-xl shadow-2xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer select-text"
                            />
                          </div>
                        </td>
                        <td className="p-1.5 border-r border-slate-300 bg-orange-50/20">
                          <NumericInput
                            step="0.01"
                            value={row.petrol}
                            onChange={(v) => handleVatCellChange(idx, 'petrol', v)}
                            className="w-full bg-white text-slate-900 font-extrabold placeholder-slate-400 border border-slate-300 rounded-lg px-2 py-1 text-right font-mono text-xs outline-none focus:border-blue-600 shadow-2xs select-text"
                          />
                        </td>
                        <td className="p-1.5 border-r border-slate-300 bg-blue-50/20">
                          <NumericInput
                            step="0.01"
                            value={row.diesel}
                            onChange={(v) => handleVatCellChange(idx, 'diesel', v)}
                            className="w-full bg-white text-slate-900 font-extrabold placeholder-slate-400 border border-slate-300 rounded-lg px-2 py-1 text-right font-mono text-xs outline-none focus:border-blue-600 shadow-2xs select-text"
                          />
                        </td>
                        <td className="p-1.5 border-r border-slate-300 bg-emerald-50/20">
                          <NumericInput
                            step="0.01"
                            value={row.cng}
                            onChange={(v) => handleVatCellChange(idx, 'cng', v)}
                            className="w-full bg-white text-slate-900 font-extrabold placeholder-slate-400 border border-slate-300 rounded-lg px-2 py-1 text-right font-mono text-xs outline-none focus:border-blue-600 shadow-2xs select-text"
                          />
                        </td>
                        <td className="p-1.5 border-r border-slate-300 bg-purple-50/20">
                          <NumericInput
                            step="0.01"
                            value={row.smartFuel}
                            onChange={(v) => handleVatCellChange(idx, 'smartFuel', v)}
                            className="w-full bg-white text-slate-900 font-extrabold placeholder-slate-400 border border-slate-300 rounded-lg px-2 py-1 text-right font-mono text-xs outline-none focus:border-blue-600 shadow-2xs select-text"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-black text-slate-900 bg-slate-100/80">
                          ₹ {(parseFloat(row.dailyTotal) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="border-t-2 border-slate-900 font-mono text-xs select-text">
                      <td className="p-2 text-center font-sans font-black text-slate-900 bg-slate-300 border-r border-slate-400">
                        MONTHLY GRAND TOTAL:
                      </td>
                      <td className="p-2 text-right font-black text-orange-950 bg-orange-100 border-r border-slate-300 text-xs">
                        ₹ {totalVatPetrol.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-right font-black text-blue-950 bg-blue-100 border-r border-slate-300 text-xs">
                        ₹ {totalVatDiesel.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-right font-black text-emerald-950 bg-emerald-100 border-r border-slate-300 text-xs">
                        ₹ {totalVatCng.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-right font-black text-purple-950 bg-purple-100 border-r border-slate-300 text-xs">
                        ₹ {totalVatSmart.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-right font-black text-amber-300 bg-slate-900 text-xs">
                        ₹ {grandTotalVat.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* RIGHT PANEL (~40% WIDTH): MONTH-END VAT RECONCILIATION & SETTLEMENT CARD */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                    <Calculator className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                      MONTH-END VAT RECONCILIATION & SETTLEMENT
                    </h3>
                    <p className="text-[11px] font-semibold text-slate-500">
                      Automated assessment for {monthName}
                    </p>
                  </div>
                </div>
              </div>

              {/* Clean UI Display Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse font-sans text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-200">
                      <th className="p-2.5 border-r border-slate-200">PRODUCT</th>
                      <th className="p-2.5 border-r border-slate-200 text-right w-36">TOTAL SALES (₹)</th>
                      <th className="p-2.5 border-r border-slate-200 text-right w-24">VAT RATE (%)</th>
                      <th className="p-2.5 border-r border-slate-200 text-right">TURNOVER (31-DAY)</th>
                      <th className="p-2.5 text-right font-black bg-amber-100/60 text-amber-950">NET VAT PAYABLE (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-semibold select-text">
                    {/* PETROL ROW */}
                    <tr className="hover:bg-orange-50/20 transition-colors">
                      <td className="p-2.5 font-extrabold text-orange-950 border-r border-slate-200">PETROL</td>
                      <td className="p-2 border-r border-slate-200">
                        <NumericInput
                          step="0.01"
                          value={vatSettlementInputs.petrol.totalSales}
                          onChange={(v) => handleVatSettlementInputChange('petrol', 'totalSales', v)}
                          className={numInputClass}
                        />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <NumericInput
                          step="0.01"
                          value={vatSettlementInputs.petrol.vatRate}
                          onChange={(v) => handleVatSettlementInputChange('petrol', 'vatRate', v)}
                          className={numInputClass}
                        />
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-700 border-r border-slate-200">
                        ₹ {totalVatPetrol.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 text-right font-mono font-black text-orange-950 bg-orange-50/50">
                        ₹ {vatPetrolCalc.netVatPayable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>

                    {/* DIESEL ROW */}
                    <tr className="hover:bg-blue-50/20 transition-colors">
                      <td className="p-2.5 font-extrabold text-blue-950 border-r border-slate-200">DIESEL</td>
                      <td className="p-2 border-r border-slate-200">
                        <NumericInput
                          step="0.01"
                          value={vatSettlementInputs.diesel.totalSales}
                          onChange={(v) => handleVatSettlementInputChange('diesel', 'totalSales', v)}
                          className={numInputClass}
                        />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <NumericInput
                          step="0.01"
                          value={vatSettlementInputs.diesel.vatRate}
                          onChange={(v) => handleVatSettlementInputChange('diesel', 'vatRate', v)}
                          className={numInputClass}
                        />
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-700 border-r border-slate-200">
                        ₹ {totalVatDiesel.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 text-right font-mono font-black text-blue-950 bg-blue-50/50">
                        ₹ {vatDieselCalc.netVatPayable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>

                    {/* CNG ROW */}
                    <tr className="hover:bg-emerald-50/20 transition-colors">
                      <td className="p-2.5 font-extrabold text-emerald-950 border-r border-slate-200">CNG</td>
                      <td className="p-2 border-r border-slate-200">
                        <NumericInput
                          step="0.01"
                          value={vatSettlementInputs.cng.totalSales}
                          onChange={(v) => handleVatSettlementInputChange('cng', 'totalSales', v)}
                          className={numInputClass}
                        />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <NumericInput
                          step="0.01"
                          value={vatSettlementInputs.cng.vatRate}
                          onChange={(v) => handleVatSettlementInputChange('cng', 'vatRate', v)}
                          className={numInputClass}
                        />
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-700 border-r border-slate-200">
                        ₹ {totalVatCng.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 text-right font-mono font-black text-emerald-950 bg-emerald-50/50">
                        ₹ {vatCngCalc.netVatPayable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>

                    {/* SMART FUEL ROW */}
                    <tr className="hover:bg-purple-50/20 transition-colors">
                      <td className="p-2.5 font-extrabold text-purple-950 border-r border-slate-200">SMART FUEL</td>
                      <td className="p-2 border-r border-slate-200">
                        <NumericInput
                          step="0.01"
                          value={vatSettlementInputs.smartFuel.totalSales}
                          onChange={(v) => handleVatSettlementInputChange('smartFuel', 'totalSales', v)}
                          className={numInputClass}
                        />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <NumericInput
                          step="0.01"
                          value={vatSettlementInputs.smartFuel.vatRate}
                          onChange={(v) => handleVatSettlementInputChange('smartFuel', 'vatRate', v)}
                          className={numInputClass}
                        />
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-700 border-r border-slate-200">
                        ₹ {totalVatSmart.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5 text-right font-mono font-black text-purple-950 bg-purple-50/50">
                        ₹ {vatSmartCalc.netVatPayable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Bottom Total Settlement Banner */}
              <div className="font-mono font-extrabold text-xl text-slate-900 bg-amber-100 border border-amber-300 p-4 rounded-2xl flex justify-between items-center shadow-xs">
                <span className="text-xs font-black uppercase text-amber-950 tracking-wider font-sans">
                  FINAL TOTAL VAT PAYABLE (O):
                </span>
                <span className="text-2xl font-black font-mono text-amber-950">
                  ₹ {finalTotalVatPayable.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: GST */}
        {activeSection === 'gst' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-blue-600" />
                🧾 GST COMPLIANCE & INPUT TAX CREDIT (ITC) LEDGER — <span className="text-slate-500 font-normal">{monthName}</span>
              </h3>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 text-xs font-extrabold uppercase tracking-wider border-b border-slate-200">
                    <th className="p-3 border-r border-slate-200 w-12 text-center bg-slate-200/60">#</th>
                    <th className="p-3 border-r border-slate-200 w-32">INVOICE DATE</th>
                    <th className="p-3 border-r border-slate-200">SUPPLIER NAME</th>
                    <th className="p-3 border-r border-slate-200 w-36">GSTIN</th>
                    <th className="p-3 border-r border-slate-200 w-32">INVOICE NO</th>
                    <th className="p-3 border-r border-slate-200 text-right">TAXABLE VALUE (₹)</th>
                    <th className="p-3 border-r border-slate-200 text-right w-24">CGST (%)</th>
                    <th className="p-3 border-r border-slate-200 text-right w-24">SGST (%)</th>
                    <th className="p-3 border-r border-slate-200 text-right w-24">IGST (%)</th>
                    <th className="p-3 border-r border-slate-200 text-right text-slate-900 font-black bg-blue-100/60">TOTAL TAX (₹)</th>
                    <th className="p-3 border-r border-slate-200 text-right text-slate-900 font-black bg-slate-100">NET TOTAL (₹)</th>
                    <th className="p-3 text-center w-16">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-semibold select-text">
                  {currentList.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center font-mono text-slate-700 font-extrabold border-r border-slate-200">{idx + 1}</td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="date" value={row.date} onChange={(e) => handleCellChange(idx, 'date', e.target.value)} className={monoInputClass} />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="text" value={row.supplierName} onChange={(e) => handleCellChange(idx, 'supplierName', e.target.value)} className={inputClass} />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="text" value={row.gstin} onChange={(e) => handleCellChange(idx, 'gstin', e.target.value)} className={`${monoInputClass} uppercase`} />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="text" value={row.invoiceNo} onChange={(e) => handleCellChange(idx, 'invoiceNo', e.target.value)} className={monoInputClass} />
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right">
                        <NumericInput value={row.taxableValue} onChange={(v) => handleCellChange(idx, 'taxableValue', v)} className={numInputClass} />
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right">
                        <NumericInput step="0.1" value={row.cgstRate !== undefined ? row.cgstRate : (row.taxableValue && row.cgst ? Number((row.cgst / row.taxableValue * 100).toFixed(1)) : 9)} onChange={(v) => handleCellChange(idx, 'cgstRate', v)} className={numInputClass} placeholder="9%" />
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right">
                        <NumericInput step="0.1" value={row.sgstRate !== undefined ? row.sgstRate : (row.taxableValue && row.sgst ? Number((row.sgst / row.taxableValue * 100).toFixed(1)) : 9)} onChange={(v) => handleCellChange(idx, 'sgstRate', v)} className={numInputClass} placeholder="9%" />
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right">
                        <NumericInput step="0.1" value={row.igstRate !== undefined ? row.igstRate : 0} onChange={(v) => handleCellChange(idx, 'igstRate', v)} className={numInputClass} placeholder="0%" />
                      </td>
                      {/* TOTAL TAX (₹) CELL */}
                      <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-200 bg-blue-50/60">
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          ₹ {Number(row.totalTax || 0).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>

                      {/* NET TOTAL (₹) CELL */}
                      <td className="px-3 py-2 text-right whitespace-nowrap border-r border-slate-200 bg-slate-100/70">
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          ₹ {Number(row.netTotal || row.netInvoice || 0).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => handleDeleteEntry(idx)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* GST Summary Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 font-mono">
              <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold">
                <span className="text-[11px] text-slate-600 font-sans uppercase block">Total Taxable Value</span>
                <span className="text-base font-black">₹ {currentList.reduce((a, r) => a + (parseFloat(r.taxableValue) || 0), 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 font-bold">
                <span className="text-[11px] text-emerald-800 font-sans uppercase block">Total Input Tax Credit (ITC)</span>
                <span className="text-base font-black">₹ {currentList.reduce((a, r) => a + (parseFloat(r.totalTax) || 0), 0).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TDS (31-DAY MULTI-COLUMN MATRIX REGISTER & RECONCILIATION) */}
        {activeSection === 'tds' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4 text-orange-600" />
                📋 MONTHLY 31-DAY TDS REGISTER (PETROL, DIESEL, CNG, SMART FUEL) — <span className="text-slate-500 font-normal">{monthName}</span>
              </h3>
            </div>

            <div className="overflow-x-auto max-h-[580px] overflow-y-auto rounded-xl border border-slate-300 shadow-xs">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-200/90 text-slate-900 text-xs font-black uppercase tracking-wider border-b border-slate-300">
                    <th rowSpan={2} className="p-2 border-r border-slate-300 w-28 text-center bg-slate-300/80">DAY / DATE</th>
                    <th colSpan={2} className="p-2 border-r border-slate-300 text-center bg-orange-100 text-orange-950">PETROL</th>
                    <th colSpan={2} className="p-2 border-r border-slate-300 text-center bg-blue-100 text-blue-950">DIESEL</th>
                    <th colSpan={2} className="p-2 border-r border-slate-300 text-center bg-emerald-100 text-emerald-950">CNG</th>
                    <th colSpan={2} className="p-2 border-r border-slate-300 text-center bg-purple-100 text-purple-950">SMART FUEL</th>
                    <th rowSpan={2} className="p-2 text-right bg-slate-800 text-amber-300 font-black">DAILY TDS TOTAL (₹)</th>
                  </tr>
                  <tr className="bg-slate-100 text-slate-800 text-[10px] font-extrabold uppercase tracking-wider border-b border-slate-300">
                    <th className="p-1.5 border-r border-slate-300 text-right bg-orange-50">AMOUNT (₹)</th>
                    <th className="p-1.5 border-r border-slate-300 text-right bg-orange-100/70 font-black">TDS (₹)</th>
                    <th className="p-1.5 border-r border-slate-300 text-right bg-blue-50">AMOUNT (₹)</th>
                    <th className="p-1.5 border-r border-slate-300 text-right bg-blue-100/70 font-black">TDS (₹)</th>
                    <th className="p-1.5 border-r border-slate-300 text-right bg-emerald-50">AMOUNT (₹)</th>
                    <th className="p-1.5 border-r border-slate-300 text-right bg-emerald-100/70 font-black">TDS (₹)</th>
                    <th className="p-1.5 border-r border-slate-300 text-right bg-purple-50">AMOUNT (₹)</th>
                    <th className="p-1.5 border-r border-slate-300 text-right bg-purple-100/70 font-black">TDS (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-semibold select-text">
                  {tdsList.map((row, idx) => (
                    <tr key={idx} className="hover:bg-orange-50/20 transition-colors">
                      <td className="px-3 py-2 text-center whitespace-nowrap bg-slate-50 border-r border-slate-300">
                        <div className="relative inline-block w-full max-w-[150px]">
                          <input
                            type="date"
                            value={row.date || row.isoDate || getRowDateValue(idx + 1)}
                            onChange={(e) => handleTdsDateChange(idx, e.target.value)}
                            className="w-full bg-white text-slate-900 font-mono font-semibold text-xs px-2.5 py-1.5 border border-slate-300 rounded-xl shadow-2xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer select-text"
                          />
                        </div>
                      </td>
                      {/* PETROL AMT & TDS */}
                      <td className="p-1 border-r border-slate-300 bg-orange-50/10">
                        <NumericInput step="0.01" value={row.petrolAmt} onChange={(v) => handleTdsCellChange(idx, 'petrolAmt', v)} className={numInputClass} />
                      </td>
                      <td className="p-1 border-r border-slate-300 bg-orange-50/30 font-black">
                        <NumericInput step="0.01" value={row.petrolTds} onChange={(v) => handleTdsCellChange(idx, 'petrolTds', v)} className={numInputClass} />
                      </td>
                      {/* DIESEL AMT & TDS */}
                      <td className="p-1 border-r border-slate-300 bg-blue-50/10">
                        <NumericInput step="0.01" value={row.dieselAmt} onChange={(v) => handleTdsCellChange(idx, 'dieselAmt', v)} className={numInputClass} />
                      </td>
                      <td className="p-1 border-r border-slate-300 bg-blue-50/30 font-black">
                        <NumericInput step="0.01" value={row.dieselTds} onChange={(v) => handleTdsCellChange(idx, 'dieselTds', v)} className={numInputClass} />
                      </td>
                      {/* CNG AMT & TDS */}
                      <td className="p-1 border-r border-slate-300 bg-emerald-50/10">
                        <NumericInput step="0.01" value={row.cngAmt} onChange={(v) => handleTdsCellChange(idx, 'cngAmt', v)} className={numInputClass} />
                      </td>
                      <td className="p-1 border-r border-slate-300 bg-emerald-50/30 font-black">
                        <NumericInput step="0.01" value={row.cngTds} onChange={(v) => handleTdsCellChange(idx, 'cngTds', v)} className={numInputClass} />
                      </td>
                      {/* SMART AMT & TDS */}
                      <td className="p-1 border-r border-slate-300 bg-purple-50/10">
                        <NumericInput step="0.01" value={row.smartAmt} onChange={(v) => handleTdsCellChange(idx, 'smartAmt', v)} className={numInputClass} />
                      </td>
                      <td className="p-1 border-r border-slate-300 bg-purple-50/30 font-black">
                        <NumericInput step="0.01" value={row.smartTds} onChange={(v) => handleTdsCellChange(idx, 'smartTds', v)} className={numInputClass} />
                      </td>
                      <td className="p-2 text-right font-mono font-black text-slate-900 bg-slate-100/80">
                        ₹ {(parseFloat(row.dailyTdsTotal) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-10">
                  <tr className="border-t-2 border-slate-900 font-mono text-xs select-text">
                    <td className="p-2 text-center font-sans font-black text-slate-900 bg-slate-300 border-r border-slate-400">
                      MONTHLY GRAND TOTAL:
                    </td>
                    <td className="p-2 text-right font-bold text-slate-900 bg-orange-100/60 border-r border-slate-300 text-xs">
                      ₹ {totalTdsPetrolAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-black text-orange-950 bg-orange-100 border-r border-slate-300 text-xs">
                      ₹ {totalTdsPetrolTds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-bold text-slate-900 bg-blue-100/60 border-r border-slate-300 text-xs">
                      ₹ {totalTdsDieselAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-black text-blue-950 bg-blue-100 border-r border-slate-300 text-xs">
                      ₹ {totalTdsDieselTds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-bold text-slate-900 bg-emerald-100/60 border-r border-slate-300 text-xs">
                      ₹ {totalTdsCngAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-black text-emerald-950 bg-emerald-100 border-r border-slate-300 text-xs">
                      ₹ {totalTdsCngTds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-bold text-slate-900 bg-purple-100/60 border-r border-slate-300 text-xs">
                      ₹ {totalTdsSmartAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-black text-purple-950 bg-purple-100 border-r border-slate-300 text-xs">
                      ₹ {totalTdsSmartTds.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-black text-amber-300 bg-slate-900 text-xs">
                      ₹ {grandTotalTdsDeducted.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* CNG TDS SETTLEMENT & RECONCILIATION CARD */}
            <div className="bg-emerald-50 border border-emerald-300 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 font-mono shadow-xs">
              <div className="space-y-1">
                <span className="text-xs font-black uppercase text-emerald-950 tracking-wider font-sans block">
                  CNG TDS SETTLEMENT & RECONCILIATION ASSESSMENT (0.10% RATE)
                </span>
                <span className="text-xs font-bold text-emerald-800">
                  Total CNG Turnover: ₹ {totalTdsCngAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })} @ 0.10% Statutory TDS Rate
                </span>
              </div>
              <div className="bg-emerald-100 border border-emerald-400 px-5 py-2.5 rounded-xl font-black text-emerald-950 text-xl shadow-2xs">
                Final Reconciled CNG TDS: ₹ {(totalTdsCngAmt * 0.001).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: WEIGHT & VERIFICATION */}
        {activeSection === 'weight' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-600" />
                ⚖️ WEIGHTS & MEASURES (W&M) STAMPING & VERIFICATION REGISTER — <span className="text-slate-500 font-normal">{monthName}</span>
              </h3>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 text-xs font-extrabold uppercase tracking-wider border-b border-slate-200">
                    <th className="p-3 border-r border-slate-200 w-12 text-center bg-slate-200/60">#</th>
                    <th className="p-3 border-r border-slate-200 w-32">VERIFICATION DATE</th>
                    <th className="p-3 border-r border-slate-200 w-36">DISPENSER / MPD NO</th>
                    <th className="p-3 border-r border-slate-200">NOZZLE ID & PRODUCT</th>
                    <th className="p-3 border-r border-slate-200">5L MEASURE TEST (ml)</th>
                    <th className="p-3 border-r border-slate-200 w-36">STAMPING DUE DATE</th>
                    <th className="p-3 border-r border-slate-200">CERTIFICATE NO</th>
                    <th className="p-3 border-r border-slate-200">INSPECTOR / REMARKS</th>
                    <th className="p-3 text-center w-16">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-semibold select-text">
                  {currentList.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center font-mono text-slate-700 font-extrabold border-r border-slate-200">{idx + 1}</td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="date" value={row.date} onChange={(e) => handleCellChange(idx, 'date', e.target.value)} className={monoInputClass} />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="text" value={row.dispenserNo} onChange={(e) => handleCellChange(idx, 'dispenserNo', e.target.value)} className={inputClass} />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="text" value={row.nozzleInfo} onChange={(e) => handleCellChange(idx, 'nozzleInfo', e.target.value)} className={inputClass} />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="text" value={row.testResult} onChange={(e) => handleCellChange(idx, 'testResult', e.target.value)} className={inputClass} />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="month" value={row.dueMonth} onChange={(e) => handleCellChange(idx, 'dueMonth', e.target.value)} className={monoInputClass} />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="text" value={row.certNo} onChange={(e) => handleCellChange(idx, 'certNo', e.target.value)} className={monoInputClass} />
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        <input type="text" value={row.officer} onChange={(e) => handleCellChange(idx, 'officer', e.target.value)} className={inputClass} />
                      </td>
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => handleDeleteEntry(idx)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* W&M Alert Notice */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 font-mono">
              <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-950">
                <span className="font-sans uppercase">Active Stamped Nozzles</span>
                <span className="font-black text-base">{currentList.length} Verified</span>
              </div>
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between text-xs font-bold text-amber-950">
                <span className="font-sans uppercase">Next Stamping Due Alert</span>
                <span className="font-black text-base">December 2026</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Product Master Catalog Manager Modal */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scaleIn">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Tag className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm uppercase tracking-wide">🏷️ Manage Product & Lubricants Master Catalog</h3>
              </div>
              <button type="button" onClick={() => setShowCatalogModal(false)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto flex-1 font-sans">
              {/* Section 1: Add Sub-Product to Existing Category */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-blue-600" />
                  Add Sub-Product / Lubricant Grade to Existing Category
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-5 space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Select Category:</label>
                    <select
                      value={targetCategory}
                      onChange={(e) => setTargetCategory(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                    >
                      {productCatalog.map((group) => (
                        <option key={group.category} value={group.category}>{group.category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-5 space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Sub-Product / Grade Name:</label>
                    <input
                      type="text"
                      placeholder="e.g. Mak 4T NXT 20W-40 1L"
                      value={newSubProductName}
                      onChange={(e) => setNewSubProductName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button type="button"
                      onClick={handleAddItemToCategory}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-1.5 px-3 rounded-lg shadow-xs transition-all active:scale-95 whitespace-nowrap cursor-pointer"
                    >
                      + Add Item
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 2: Create New Custom Category */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <FolderPlus className="w-4 h-4 text-emerald-600" />
                  Create New Custom Category
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-4 space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Category Name:</label>
                    <input
                      type="text"
                      placeholder="e.g. Car Care / Accessories"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="sm:col-span-4 space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">First Item Name:</label>
                    <input
                      type="text"
                      placeholder="e.g. Windshield Washer Fluid"
                      value={newCategoryItemName}
                      onChange={(e) => setNewCategoryItemName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">Tax Type:</label>
                    <select
                      value={newProductTaxType}
                      onChange={(e) => setNewProductTaxType(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                    >
                      <option value="GST">GST (18%)</option>
                      <option value="VAT">VAT</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <button type="button"
                      onClick={handleAddNewCategory}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-1.5 px-3 rounded-lg shadow-xs transition-all active:scale-95 whitespace-nowrap cursor-pointer"
                    >
                      + Create
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 3: Current Catalog Roster */}
              <div className="space-y-3">
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-purple-600" />
                  Existing Product Roster ({productCatalog.reduce((acc, g) => acc + (g.items?.length || 0), 0)} Items across {productCatalog.length} Categories)
                </h4>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {productCatalog.map((group, gIdx) => (
                    <div key={group.category} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                      {/* Category Header with Delete Action */}
                      <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-slate-900 uppercase tracking-wide">{group.category}</span>
                          <span className="text-[10px] font-mono text-slate-500 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                            {group.items?.length || 0} items
                          </span>
                        </div>

                        <button
                          type="button"
                          title={`Remove Category ${group.category}`}
                          onClick={() => handleDeleteCategory(group.category)}
                          className="text-rose-500 hover:text-rose-700 text-[11px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-md border border-rose-200 hover:bg-rose-50 cursor-pointer transition-all active:scale-95"
                        >
                          <Trash2 className="w-3 h-3 text-rose-500" />
                          <span>Remove Category</span>
                        </button>
                      </div>

                      {/* Sub-Products List */}
                      <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.items?.map((item, iIdx) => (
                          <div
                            key={item.id || item.name}
                            className="flex items-center justify-between py-1.5 px-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors group"
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                              <span className="text-xs font-semibold text-slate-800 truncate">
                                {item.name}
                              </span>
                              <span className="text-[9px] font-mono font-bold text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded shrink-0">
                                {item.defaultTax || 'GST'}
                              </span>
                            </div>
                            <button
                              type="button"
                              title={`Delete ${item.name}`}
                              onClick={() => handleDeleteCatalogItem(gIdx, iIdx)}
                              className="w-6 h-6 flex items-center justify-center rounded text-rose-500 hover:text-white hover:bg-rose-500 transition-all text-xs font-bold shrink-0 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-100 p-3.5 border-t border-slate-200 flex justify-end">
              <button type="button"
                onClick={() => setShowCatalogModal(false)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-5 py-2 rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                Done / Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
