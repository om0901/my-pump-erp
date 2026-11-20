import Dexie from 'dexie';

export const db = new Dexie('MyPumpDB');

// Version 11 - kept for migration continuity (no stores changed)
db.version(11).stores({
  // Engineering Audit Relational Stores
  daily_rates: '++id, date, shiftId',
  nozzle_readings: '++id, date, nozzleId, productName, operatorId, shiftId',
  tank_logs: '++id, date, tankId, productType',
  lube_inventory: '++id, date, productId, productName',
  credit_slips: '++id, date, customerId, customerName, billType',
  shift_settlement: '++id, date, shiftId, cashierName, isShort, isExcess',

  // Excel Core Relational Stores
  shifts: '++id, date, shiftType, savedAt',
  nozzleReadings: '++id, date, nozzleId, productName, operatorId, shiftId',
  fuelStock: '++id, date, product',
  lubricantsMatrix: '++id, productId, productName, date',
  partyAccounts: '++id, partyName, phone',
  ledgerTransactions: '++id, partyId, date, billNo, fuelProduct, type',
  uchhinaAccounts: '++id, personName, date, status',
  staffAttendance: '++id, employeeId, name, role, date, shift, status',

  // Existing Module Stores for Backwards Compatibility
  tanks: '++id, tankName, productType',
  tankLedger: '++id, tankId, date',
  tankDips: '++id, date, shiftId',
  dailyRates: '++id, date, shiftId',
  lubricants: '++id, date, productName',
  lubricantProducts: '++id, productName, unitPack',
  lubricantLedger: '++id, productId, date',
  sellPatrak: '++id, productKey, monthYear, date',
  taxRecords: '++id, section, date, monthYear',
  masterShifts: '++id, date, shiftId',
  customers: '++id, name, phone, vehicleNo',
  ledgerEntries: '++id, customerId, date, type, paymentMode',
  debitEntries: '++id, customerName, date',
  jamaEntries: '++id, customerName, date',
  expenses: '++id, date, category, paymentMode',
  otherIncome: '++id, date, category',
  purchases: '++id, date, invoiceNo, productType',
  cashDenominations: '++id, date, shiftId',
  upiLogs: '++id, date, provider, shiftId',
  invoices: '++id, invoiceNo, date, customerName, isGst',
  attendance: '++id, date, employeeName, shift, status',
  bankDeposits: '++id, date, bankName, slipNo',
  settings: 'key'
});

// Version 12 — Adds permanent shift_archives table
// archiveKey = "YYYY-MM-DD_DAY" or "YYYY-MM-DD_NIGHT" (primary key)
db.version(12).stores({
  // All previous stores carried forward unchanged
  daily_rates: '++id, date, shiftId',
  nozzle_readings: '++id, date, nozzleId, productName, operatorId, shiftId',
  tank_logs: '++id, date, tankId, productType',
  lube_inventory: '++id, date, productId, productName',
  credit_slips: '++id, date, customerId, customerName, billType',
  shift_settlement: '++id, date, shiftId, cashierName, isShort, isExcess',
  shifts: '++id, date, shiftType, savedAt',
  nozzleReadings: '++id, date, nozzleId, productName, operatorId, shiftId',
  fuelStock: '++id, date, product',
  lubricantsMatrix: '++id, productId, productName, date',
  partyAccounts: '++id, partyName, phone',
  ledgerTransactions: '++id, partyId, date, billNo, fuelProduct, type',
  uchhinaAccounts: '++id, personName, date, status',
  staffAttendance: '++id, employeeId, name, role, date, shift, status',
  tanks: '++id, tankName, productType',
  tankLedger: '++id, tankId, date',
  tankDips: '++id, date, shiftId',
  dailyRates: '++id, date, shiftId',
  lubricants: '++id, date, productName',
  lubricantProducts: '++id, productName, unitPack',
  lubricantLedger: '++id, productId, date',
  sellPatrak: '++id, productKey, monthYear, date',
  taxRecords: '++id, section, date, monthYear',
  masterShifts: '++id, date, shiftId',
  customers: '++id, name, phone, vehicleNo',
  ledgerEntries: '++id, customerId, date, type, paymentMode',
  debitEntries: '++id, customerName, date',
  jamaEntries: '++id, customerName, date',
  expenses: '++id, date, category, paymentMode',
  otherIncome: '++id, date, category',
  purchases: '++id, date, invoiceNo, productType',
  cashDenominations: '++id, date, shiftId',
  upiLogs: '++id, date, provider, shiftId',
  invoices: '++id, invoiceNo, date, customerName, isGst',
  attendance: '++id, date, employeeName, shift, status',
  bankDeposits: '++id, date, bankName, slipNo',
  settings: 'key',

  // ★ NEW: Permanent shift archive — keyed by "YYYY-MM-DD_DAY/NIGHT"
  shift_archives: 'archiveKey, date, shiftType, status, savedAt',
});

// Helper to seed clean production default structure in Zero State
export async function seedSampleData() {
  const tankCount = await db.tanks.count();
  if (tankCount === 0) {
    // Seed 3 Clean Production Fuel Tanks with 0 opening stock
    await db.tanks.bulkAdd([
      { tankName: 'PETROL (MS)', productType: 'Motor Spirit (MS)', capacityLitres: 20000, openingStock: 0, purchaseLitres: 0, salesDeduction: 0, closingStock: 0, minThresholdLitres: 3000 },
      { tankName: 'DIESEL (HSD)', productType: 'High Speed Diesel (HSD)', capacityLitres: 25000, openingStock: 0, purchaseLitres: 0, salesDeduction: 0, closingStock: 0, minThresholdLitres: 4000 },
      { tankName: 'SMART FUEL', productType: 'Smart Fuel', capacityLitres: 15000, openingStock: 0, purchaseLitres: 0, salesDeduction: 0, closingStock: 0, minThresholdLitres: 2000 }
    ]);
  }
}
