/**
 * Petroleum Engineering Calculation Engine & ERP Math Utilities
 * Grounded in ASTM Table 53B standards, Meter Rollover Algorithms (999,999 protection),
 * OMC Statutory Loss Thresholds, and Zero-Tolerance Cashier Settlement.
 */

// Module 01: Clean Standard Nozzle Sales Calculation (Closing - Opening - Testing)
export function calculateNozzleSales(opening, closing, testing = 0, rate = 0) {
  const op = parseFloat(opening) || 0;
  const cl = parseFloat(closing) || 0;
  const test = parseFloat(testing) || 0;
  const r = parseFloat(rate) || 0;

  // If closing is 0 or less than opening, sales MUST remain 0 (no misfired calculation)
  if (cl <= op) {
    return {
      gross: 0,
      net: 0,
      totalAmount: 0
    };
  }

  // Core formula: Closing - Opening - Testing = Net Sales
  const gross = cl - op;
  const net = Math.max(0, gross - test);
  const totalAmount = Number((net * r).toFixed(2));

  return {
    gross: Number(gross.toFixed(2)),
    net: Number(net.toFixed(2)),
    totalAmount: totalAmount
  };
}

// Legacy alias for calculateNozzleLitres
export function calculateNozzleLitres(currentReading, previousReading, testingLitres = 0) {
  const res = calculateNozzleSales(previousReading, currentReading, testingLitres);
  return res.net;
}

// Nozzle Sale Amount in INR
export function calculateNozzleAmount(netLitres, unitRate) {
  const litres = parseFloat(netLitres) || 0;
  const rate = parseFloat(unitRate) || 0;
  return Number((litres * rate).toFixed(2));
}

// Module 02: ASTM Table 53B Normalized Density Check (Normalized to 15°C)
export function calculateAstm53bDensity(observedDensity, observedTemp, productType = 'MS') {
  const obsDen = parseFloat(observedDensity) || 0;
  const obsTemp = parseFloat(observedTemp) || 15;
  const isHsd = (productType || '').toUpperCase().includes('HSD') || (productType || '').toUpperCase().includes('DIESEL');

  // Slope coefficient: MS = 0.65, HSD = 0.67
  const alpha = isHsd ? 0.67 : 0.65;
  const normalizedDensity = obsDen - (alpha * (15 - obsTemp));

  return Number(normalizedDensity.toFixed(2));
}

// Density Variance Alert Check (Tolerance threshold: ±3.0 kg/m³)
export function checkAstmDensityVariance(normalizedDensity, invoiceDensity) {
  const norm = parseFloat(normalizedDensity) || 0;
  const inv = parseFloat(invoiceDensity) || 0;
  if (!inv || !norm) return { isAlert: false, diff: 0 };

  const diff = Number((norm - inv).toFixed(2));
  const isAlert = Math.abs(diff) > 3.0;

  return { isAlert, diff };
}

// OMC Statutory Loss Threshold Warning (MS: 0.59%, HSD: 0.23%)
export function checkOmcStatutoryLossThreshold(cumulativeLossLitres, totalSalesLitres, productType = 'MS') {
  const loss = parseFloat(cumulativeLossLitres) || 0;
  const sales = parseFloat(totalSalesLitres) || 0;
  if (sales <= 0 || loss <= 0) return { isExceeded: false, lossPct: 0, thresholdPct: 0 };

  const isHsd = (productType || '').toUpperCase().includes('HSD') || (productType || '').toUpperCase().includes('DIESEL');
  const thresholdPct = isHsd ? 0.23 : 0.59;
  const lossPct = Number(((loss / sales) * 100).toFixed(3));
  const isExceeded = lossPct > thresholdPct;

  return { isExceeded, lossPct, thresholdPct };
}

// Tank Closing Stock & Loss/Gain Variance
export function calculateClosingStock(openingStock, purchaseInflow, totalSalesLitres) {
  const opening = parseFloat(openingStock) || 0;
  const purchases = parseFloat(purchaseInflow) || 0;
  const sales = parseFloat(totalSalesLitres) || 0;
  const closing = opening + purchases - sales;
  return Number(closing.toFixed(2));
}

export function calculateStockVariance(dipStock, closingBookStock) {
  const dip = parseFloat(dipStock) || 0;
  const book = parseFloat(closingBookStock) || 0;
  const diff = dip - book;
  return Number(diff.toFixed(2));
}

// Module 05: Cashier Settlement & Zero-Tolerance Cash Drawer Tally
export function calculateCashierSettlement({
  totalFuelSales = 0,
  totalLubeSales = 0,
  otherIncome = 0,
  jamaRecoveries = 0,
  digitalPayOut = 0,
  creditSlips = 0,
  approvedExpenses = 0,
  bankDeposits = 0,
  physicalCashCounted = 0
}) {
  const grossInflow = (parseFloat(totalFuelSales) || 0) + (parseFloat(totalLubeSales) || 0) + (parseFloat(otherIncome) || 0) + (parseFloat(jamaRecoveries) || 0);
  const deductions = (parseFloat(digitalPayOut) || 0) + (parseFloat(creditSlips) || 0) + (parseFloat(approvedExpenses) || 0) + (parseFloat(bankDeposits) || 0);

  const theoreticalCashDue = Number((grossInflow - deductions).toFixed(2));
  const count = parseFloat(physicalCashCounted) || 0;
  const difference = Number((count - theoreticalCashDue).toFixed(2));

  const isShort = difference < 0;
  const isExcess = difference > 0;
  const isExact = difference === 0;

  return {
    theoreticalCashDue,
    physicalCashCounted: count,
    difference,
    isShort,
    isExcess,
    isExact,
    cashierDebitLiability: isShort ? Math.abs(difference) : 0
  };
}

// Legacy alias for Excel Shree Silak Drawer Cash Calculation
export function calculateShreeSilak(params) {
  const sett = calculateCashierSettlement({
    totalFuelSales: params.grossFuelSales,
    totalLubeSales: params.oilSalesInflow,
    otherIncome: params.otherIncomeInflow,
    jamaRecoveries: params.jamaRecoveriesInflow,
    creditSlips: params.debitFuelSales,
    approvedExpenses: params.expensesOutflow,
    bankDeposits: params.bankDepositsOutflow,
    digitalPayOut: params.digitalPaymentOutflow,
    physicalCashCounted: params.physicalCashCounted || 0
  });
  return sett.theoreticalCashDue;
}

export function calculateExpectedCashDrawer(params) {
  return calculateShreeSilak({
    grossFuelSales: params.totalFuelSales,
    debitFuelSales: params.creditSales,
    oilSalesInflow: params.totalLubricantSales,
    otherIncomeInflow: params.otherIncome,
    jamaRecoveriesInflow: params.jamaRecoveries,
    expensesOutflow: params.expenses,
    bankDepositsOutflow: params.bankDeposits,
    digitalPaymentOutflow: (parseFloat(params.smartMoneyOut) || 0) + (parseFloat(params.digitalPayOut) || 0)
  });
}

// Module 06: Monthly MIS Aggregations (Dealer Gross Margin & Net Profit)
export function calculateDealerMisMetrics({
  msLitres = 0,
  hsdLitres = 0,
  msMarginPerLitre = 3.25,
  hsdMarginPerLitre = 2.10,
  lubeRevenue = 0,
  lubeMarginPct = 0.15,
  handlingLosses = 0,
  operationalExpenses = 0
}) {
  const msMargin = (parseFloat(msLitres) || 0) * (parseFloat(msMarginPerLitre) || 3.25);
  const hsdMargin = (parseFloat(hsdLitres) || 0) * (parseFloat(hsdMarginPerLitre) || 2.10);
  const lubeMargin = (parseFloat(lubeRevenue) || 0) * (parseFloat(lubeMarginPct) || 0.15);

  const grossMargin = Number((msMargin + hsdMargin + lubeMargin).toFixed(2));
  const netProfit = Number((grossMargin - (parseFloat(handlingLosses) || 0) - (parseFloat(operationalExpenses) || 0)).toFixed(2));

  return {
    msMargin: Number(msMargin.toFixed(2)),
    hsdMargin: Number(hsdMargin.toFixed(2)),
    lubeMargin: Number(lubeMargin.toFixed(2)),
    grossMargin,
    netProfit
  };
}

// Lubricants Pack Sizes
export const LUBRICANT_PACK_SIZES = {
  'pouch': 0.04,
  '2t': 0.50,
  'multi_grade': 1.00,
  'gear_oil': 1.00,
  'grease_small': 0.50,
  'grease_large': 1.00,
  'ad_blue': 20.00
};

export function calculateLubricantRowTotal(volumePerUnit, totalQuantitySold, unitPrice) {
  let qty = 0;
  let price = 0;
  if (typeof volumePerUnit === 'object' && volumePerUnit !== null) {
    qty = parseFloat(volumePerUnit.soldQty ?? volumePerUnit.soldCount) || 0;
    price = parseFloat(volumePerUnit.unitPrice ?? volumePerUnit.rate) || 0;
  } else {
    qty = parseFloat(totalQuantitySold) || 0;
    price = parseFloat(unitPrice) || 0;
  }
  return Number((qty * price).toFixed(2));
}
