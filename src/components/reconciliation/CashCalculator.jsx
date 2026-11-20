import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/database';
import { getDailyFinancialSummary } from '../../db/storageService';
import { Calculator, Save, Smartphone, CheckCircle2, AlertTriangle, Plus, Trash2, IndianRupee, Layers } from 'lucide-react';
import NumericInput from '../common/NumericInput';

export default function CashCalculator() {
  const { selectedDate, activeShift, showToast } = useApp();
  const [denominations, setDenominations] = useState({
    n2000: 0, n500: 0, n200: 0, n100: 0, n50: 0, n20: 0, n10: 0, coins: 0
  });
  const [upiLogs, setUpiLogs] = useState([]);
  const [financials, setFinancials] = useState(null);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [newUpi, setNewUpi] = useState({ provider: 'PhonePe', transactionRef: '', amount: '' });

  useEffect(() => {
    loadReconciliationData();
  }, [selectedDate, activeShift]);

  const loadReconciliationData = async () => {
    const finData = await getDailyFinancialSummary(selectedDate);
    setFinancials(finData);

    const cashRecord = await db.cashDenominations.where('date').equals(selectedDate).first();
    if (cashRecord) {
      setDenominations({
        n2000: cashRecord.n2000 || 0,
        n500: cashRecord.n500 || 0,
        n200: cashRecord.n200 || 0,
        n100: cashRecord.n100 || 0,
        n50: cashRecord.n50 || 0,
        n20: cashRecord.n20 || 0,
        n10: cashRecord.n10 || 0,
        coins: cashRecord.coins || 0,
      });
    }

    const upis = await db.upiLogs.where('date').equals(selectedDate).toArray();
    setUpiLogs(upis);
  };

  const handleDenominationChange = (key, val) => {
    setDenominations(prev => ({ ...prev, [key]: parseInt(val) || 0 }));
  };

  const calculateCashTotal = () => {
    return (
      (denominations.n2000 * 2000) +
      (denominations.n500 * 500) +
      (denominations.n200 * 200) +
      (denominations.n100 * 100) +
      (denominations.n50 * 50) +
      (denominations.n20 * 20) +
      (denominations.n10 * 10) +
      (denominations.coins * 1)
    );
  };

  const handleSaveCashDenominations = async () => {
    try {
      const totalCash = calculateCashTotal();
      const existing = await db.cashDenominations.where('date').equals(selectedDate).first();

      if (existing) {
        await db.cashDenominations.update(existing.id, { ...denominations, totalCash });
      } else {
        await db.cashDenominations.add({ date: selectedDate, shiftId: activeShift, ...denominations, totalCash });
      }

      showToast('Cash Denominations saved to database!', 'success');
      loadReconciliationData();
    } catch (err) {
      showToast('Error saving cash: ' + err.message, 'error');
    }
  };

  const handleAddUpiLog = async (e) => {
    e.preventDefault();
    try {
      const amountNum = parseFloat(newUpi.amount) || 0;
      await db.upiLogs.add({
        date: selectedDate,
        shiftId: activeShift,
        provider: newUpi.provider,
        transactionRef: newUpi.transactionRef || `UPI-${Date.now()}`,
        amount: amountNum,
      });

      showToast(`Added UPI entry of ₹${amountNum}`, 'success');
      setShowUpiModal(false);
      setNewUpi({ provider: 'PhonePe', transactionRef: '', amount: '' });
      loadReconciliationData();
    } catch (err) {
      showToast('Error adding UPI entry: ' + err.message, 'error');
    }
  };

  const handleDeleteUpiLog = async (id) => {
    try {
      await db.upiLogs.delete(id);
      showToast('UPI transaction deleted', 'info');
      loadReconciliationData();
    } catch (err) {
      showToast('Error deleting UPI: ' + err.message, 'error');
    }
  };

  const actualCashTotal = calculateCashTotal();
  const expectedCash = financials ? financials.expectedCash : 0;
  const cashVariance = actualCashTotal - expectedCash;

  const denomRows = [
    { label: '₹ 2,000 Note', key: 'n2000', multiplier: 2000 },
    { label: '₹ 500 Note', key: 'n500', multiplier: 500 },
    { label: '₹ 200 Note', key: 'n200', multiplier: 200 },
    { label: '₹ 100 Note', key: 'n100', multiplier: 100 },
    { label: '₹ 50 Note', key: 'n50', multiplier: 50 },
    { label: '₹ 20 Note', key: 'n20', multiplier: 20 },
    { label: '₹ 10 Note', key: 'n10', multiplier: 10 },
    { label: 'Coins (₹1, ₹2, ₹5, ₹10)', key: 'coins', multiplier: 1 },
  ];

  return (
    <div className="p-6 space-y-4 animate-fadeIn bg-slate-100 min-h-screen select-text">
      {/* Sleek Top Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-amber-600" />
          <span className="font-extrabold text-sm text-slate-900">Cash & Digital Reconciliation</span>
          <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            Actual: ₹{actualCashTotal.toLocaleString('en-IN')}
          </span>
        </div>

        <button type="button"
          onClick={handleSaveCashDenominations}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs shadow-xs transition-all active:scale-95"
        >
          <Save className="w-4 h-4" />
          <span>Save Cash Counter</span>
        </button>
      </div>

      {/* Reconciliation Formula Banner */}
      {financials && (
        <div className={`bg-white p-5 rounded-2xl border ${cashVariance === 0 ? 'border-emerald-300 bg-emerald-50/50' : cashVariance > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-rose-300 bg-rose-50/50'} shadow-sm`}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white shadow-xs ${cashVariance === 0 ? 'bg-emerald-600' : cashVariance > 0 ? 'bg-amber-600' : 'bg-rose-600'}`}>
                {cashVariance === 0 ? <CheckCircle2 className="w-7 h-7"/> : <AlertTriangle className="w-7 h-7"/>}
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  RECONCILIATION RESULT: {cashVariance === 0 ? 'TALLY EXACT MATCH! (₹0 Difference)' : cashVariance > 0 ? `EXCESS CASH IN DRAWER (+₹${cashVariance.toLocaleString()})` : `SHORTAGE WARNING (-₹${Math.abs(cashVariance).toLocaleString()})`}
                </h3>
                <p className="text-sm text-slate-600 font-mono mt-0.5 font-bold">
                  Expected Cash: ₹{expectedCash.toLocaleString()} | Actual Drawer Cash: ₹{actualCashTotal.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 text-xs font-mono font-bold">
              <div className="text-center px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200">
                <div className="text-[11px] text-slate-500 font-sans uppercase font-bold">Nozzle Sales</div>
                <div className="text-blue-700 text-base font-extrabold font-mono">₹{financials.totalFuelSales.toLocaleString()}</div>
              </div>
              <div className="text-center px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200">
                <div className="text-[11px] text-slate-500 font-sans uppercase font-bold">- Debits</div>
                <div className="text-amber-700 text-base font-extrabold font-mono">₹{financials.totalCustomerDebits.toLocaleString()}</div>
              </div>
              <div className="text-center px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200">
                <div className="text-[11px] text-slate-500 font-sans uppercase font-bold">- Digital UPI</div>
                <div className="text-blue-700 text-base font-extrabold font-mono">₹{financials.totalUpi.toLocaleString()}</div>
              </div>
              <div className="text-center px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200">
                <div className="text-[11px] text-slate-500 font-sans uppercase font-bold">- Expenses</div>
                <div className="text-rose-700 text-base font-extrabold font-mono">₹{financials.totalExpenses.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Left Denomination Counter, Right UPI Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Physical Cash Denomination Box */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 className="font-extrabold text-base text-slate-900">Physical Cash Box Denominations</h3>
            <span className="font-mono text-xl font-extrabold text-emerald-700">
              Total Cash: ₹{actualCashTotal.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="space-y-2.5">
            {denomRows.map((row) => {
              const count = denominations[row.key] || 0;
              const lineTotal = count * row.multiplier;
              return (
                <div key={row.key} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold">
                  <span className="w-44 font-bold text-base text-slate-800">{row.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono text-lg font-extrabold">×</span>
                    <NumericInput
                      min="0"
                      value={count}
                      onChange={(val) => handleDenominationChange(row.key, val)}
                      className="w-24 text-center bg-white border border-slate-300 rounded-xl py-2 px-3 text-lg font-bold font-mono text-slate-900 outline-none focus:border-orange-500 shadow-2xs"
                    />
                  </div>
                  <span className="w-36 text-right font-mono text-base font-bold text-slate-900">
                    = ₹{lineTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Digital / UPI Payments Log */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-extrabold text-base text-slate-900">UPI / Digital Payments Log</h3>
              <p className="text-xs text-slate-500 font-mono font-semibold">PhonePe, Google Pay, Paytm, POS Swipes</p>
            </div>

            {/* Add UPI Button - Vibrant Orange Gradient */}
            <button type="button"
              onClick={() => setShowUpiModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs shadow-xs transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add UPI Log</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase text-xs tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3">Provider</th>
                  <th className="p-3">Txn Ref No</th>
                  <th className="p-3 text-right">Amount (₹)</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-semibold select-text">
                {upiLogs.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-4 text-center text-slate-400 font-mono">No UPI entries recorded today.</td>
                  </tr>
                ) : (
                  upiLogs.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs">
                          {u.provider}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-base font-bold text-slate-800">{u.transactionRef}</td>
                      <td className="p-3 text-right font-mono font-extrabold text-blue-700 text-base">
                        ₹{u.amount.toLocaleString()}
                      </td>
                      <td className="p-3 text-center">
                        <button type="button"
                          onClick={() => handleDeleteUpiLog(u.id)}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Add UPI Log Modal */}
      {showUpiModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-slate-900">Record UPI / Card Transaction</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleAddUpiLog(e); }} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">UPI Provider / Method</label>
                <select
                  value={newUpi.provider}
                  onChange={(e) => setNewUpi({ ...newUpi, provider: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold focus:border-orange-500"
                >
                  <option value="PhonePe">PhonePe QR</option>
                  <option value="Google Pay">Google Pay Business</option>
                  <option value="Paytm QR">Paytm Business QR</option>
                  <option value="POS Card Swipe">POS Debit/Credit Card Swipe</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Transaction Ref / UTR No</label>
                <input
                  type="text"
                  placeholder="e.g. T2608130981"
                  value={newUpi.transactionRef}
                  onChange={(e) => setNewUpi({ ...newUpi, transactionRef: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Amount (₹)</label>
                <NumericInput
                  required
                  placeholder="0.00"
                  value={newUpi.amount}
                  onChange={(val) => setNewUpi({ ...newUpi, amount: val })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono text-base font-bold text-blue-700 focus:border-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowUpiModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-600 text-white font-bold shadow-md transition-all active:scale-95"
                >
                  Save UPI Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
