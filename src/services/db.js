import { db } from '../db/database';

/**
 * Structured Relational Database Service API for MY PUMP ERP.
 * Clean abstraction for IndexedDB tables.
 */

export const shiftService = {
  async getByDate(date, shiftType) {
    return await db.shifts.where({ date, shiftType }).first() || null;
  },
  async save(shiftData) {
    const existing = await db.shifts.where({ date: shiftData.date, shiftType: shiftData.shiftType }).first();
    if (existing) {
      await db.shifts.update(existing.id, { ...shiftData, savedAt: new Date().toISOString() });
      return existing.id;
    }
    return await db.shifts.add({ ...shiftData, savedAt: new Date().toISOString() });
  },
  async getAll() {
    return await db.shifts.toArray();
  }
};

export const partyAccountService = {
  async getAll() {
    return await db.partyAccounts.toArray();
  },
  async add(party) {
    return await db.partyAccounts.add({
      partyName: party.partyName || party.name,
      phone: party.phone || '',
      vehicleNumbers: party.vehicleNumbers || (party.vehicleNo ? [party.vehicleNo] : []),
      openingBalance: parseFloat(party.openingBalance) || 0,
      createdAt: new Date().toISOString()
    });
  },
  async update(id, updates) {
    return await db.partyAccounts.update(id, updates);
  },
  async delete(id) {
    return await db.partyAccounts.delete(id);
  }
};

export const ledgerTransactionService = {
  async getByParty(partyId) {
    return await db.ledgerTransactions.where('partyId').equals(partyId).toArray();
  },
  async getByDate(date) {
    return await db.ledgerTransactions.where('date').equals(date).toArray();
  },
  async add(transaction) {
    return await db.ledgerTransactions.add({
      ...transaction,
      createdAt: new Date().toISOString()
    });
  }
};

export const uchhinaService = {
  async getAll() {
    return await db.uchhinaAccounts.toArray();
  },
  async add(record) {
    return await db.uchhinaAccounts.add({
      personName: record.personName,
      date: record.date || new Date().toISOString().split('T')[0],
      amountGiven: parseFloat(record.amountGiven) || 0,
      amountReturned: parseFloat(record.amountReturned) || 0,
      balance: (parseFloat(record.amountGiven) || 0) - (parseFloat(record.amountReturned) || 0),
      status: (parseFloat(record.amountGiven) || 0) <= (parseFloat(record.amountReturned) || 0) ? 'SETTLED' : 'PENDING'
    });
  },
  async update(id, updates) {
    return await db.uchhinaAccounts.update(id, updates);
  },
  async delete(id) {
    return await db.uchhinaAccounts.delete(id);
  }
};

export const staffAttendanceService = {
  async getByDate(date) {
    return await db.staffAttendance.where('date').equals(date).toArray();
  },
  async save(attendanceData) {
    const existing = await db.staffAttendance.where({ date: attendanceData.date, employeeId: attendanceData.employeeId }).first();
    if (existing) {
      await db.staffAttendance.update(existing.id, attendanceData);
      return existing.id;
    }
    return await db.staffAttendance.add(attendanceData);
  },
  async getAll() {
    return await db.staffAttendance.toArray();
  }
};
