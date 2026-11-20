import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FileText, Printer, CheckCircle2, Flame, User, Truck, Phone, IndianRupee } from 'lucide-react';

export default function InvoiceMaker() {
  const { selectedDate, showToast, stationProfile } = useApp();
  const [printFormat, setPrintFormat] = useState('A4'); // 'A4', 'Thermal-80mm', 'Thermal-58mm'
  const [invoice, setInvoice] = useState({
    invoiceNo: `MYP-${Date.now().toString().slice(-6)}`,
    date: selectedDate,
    customerName: 'National Transport Logistics',
    customerPhone: '+91 98765 43210',
    vehicleNo: 'MH-12-PQ-4521',
    productName: 'High Speed Diesel',
    litres: 250.0,
    rate: 89.62,
    paymentMode: 'Cash',
    isGst: true,
  });

  const subtotal = invoice.litres * invoice.rate;
  const taxAmount = invoice.isGst ? subtotal * 0.18 : 0;
  const grandTotal = subtotal + taxAmount;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-4 space-y-3.5 animate-fadeIn bg-[#0c121d] min-h-screen select-text text-slate-200 font-sans">
      {/* Sleek Top Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#121927] p-3 rounded-xl border border-[#1e293b] shadow-lg print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-xs text-slate-100 tracking-wide">Retail & Credit Invoice Maker</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Format Selector */}
          <div className="flex items-center gap-1 bg-[#0e1420] border border-[#1b2537] rounded-lg p-1 text-xs font-semibold">
            <button type="button"
              onClick={() => setPrintFormat('A4')}
              className={`px-2.5 py-1 rounded text-xs transition-all ${printFormat === 'A4' ? 'bg-[#192438] text-white border border-blue-500/50 shadow-xs' : 'text-slate-400 hover:text-slate-200'}`}
            >
              A4 Standard
            </button>
            <button type="button"
              onClick={() => setPrintFormat('Thermal-80mm')}
              className={`px-3 py-1 rounded-lg transition-all ${printFormat === 'Thermal-80mm' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Thermal 80mm
            </button>
            <button type="button"
              onClick={() => setPrintFormat('Thermal-58mm')}
              className={`px-3 py-1 rounded-lg transition-all ${printFormat === 'Thermal-58mm' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Thermal 58mm
            </button>
          </div>

          <button type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition-all active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print Invoice</span>
          </button>
        </div>
      </div>

      {/* Main Layout: Left Invoice Form, Right Live Print Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form Column */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
          <h3 className="font-extrabold text-sm text-slate-900 pb-2 border-b border-slate-200">
            Invoice Details & Customer Data
          </h3>

          <div className="space-y-3 text-xs font-semibold">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 mb-1">Invoice Number</label>
                <input
                  type="text"
                  value={invoice.invoiceNo}
                  onChange={(e) => setInvoice({ ...invoice, invoiceNo: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono font-bold focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={invoice.date}
                  onChange={(e) => setInvoice({ ...invoice, date: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold focus:border-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={invoice.customerName}
                  onChange={(e) => setInvoice({ ...invoice, customerName: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1">Customer Phone</label>
                <input
                  type="text"
                  value={invoice.customerPhone}
                  onChange={(e) => setInvoice({ ...invoice, customerPhone: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono focus:border-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 mb-1">Vehicle Number</label>
                <input
                  type="text"
                  value={invoice.vehicleNo}
                  onChange={(e) => setInvoice({ ...invoice, vehicleNo: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono font-bold uppercase focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1">Tax Calculation</label>
                <button
                  type="button"
                  onClick={() => setInvoice({ ...invoice, isGst: !invoice.isGst })}
                  className={`w-full p-2.5 rounded-xl border font-bold text-xs transition-all ${
                    invoice.isGst
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  {invoice.isGst ? 'GST 18% Applicable' : 'Non-GST Tax Exempt'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 mb-1">Fuel / Product</label>
                <select
                  value={invoice.productName}
                  onChange={(e) => setInvoice({ ...invoice, productName: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold focus:border-orange-500"
                >
                  <option value="High Speed Diesel">High Speed Diesel (HSD)</option>
                  <option value="Motor Spirit (Petrol)">Motor Spirit Petrol (MS)</option>
                  <option value="XP Premium Petrol">XP Premium Petrol</option>
                  <option value="Servo 15W40 Engine Oil 3.5L">Servo 15W40 Engine Oil 3.5L</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Payment Method</label>
                <select
                  value={invoice.paymentMode}
                  onChange={(e) => setInvoice({ ...invoice, paymentMode: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-bold focus:border-orange-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="Credit Account">Credit Ledger Account</option>
                  <option value="UPI / PhonePe">UPI / PhonePe</option>
                  <option value="Card Swipe">POS Card Swipe</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 mb-1">Litres / Quantity</label>
                <input
                  type="number"
                  step="0.01"
                  value={invoice.litres}
                  onChange={(e) => setInvoice({ ...invoice, litres: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono font-bold focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Rate (₹/L)</label>
                <input
                  type="number"
                  step="0.01"
                  value={invoice.rate}
                  onChange={(e) => setInvoice({ ...invoice, rate: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 outline-none font-mono font-bold focus:border-orange-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Printable Receipt Preview */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm flex flex-col items-center justify-center bg-slate-50">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Live Print Document Preview ({printFormat})
          </div>

          {/* Printable Section Container */}
          <div
            id="printable-section"
            className={`bg-white text-black rounded-lg shadow-xl p-6 border border-slate-300 font-sans ${
              printFormat === 'Thermal-80mm'
                ? 'thermal-80mm'
                : printFormat === 'Thermal-58mm'
                ? 'thermal-58mm'
                : 'w-full max-w-md'
            }`}
          >
            {/* Header */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-400">
              <div className="font-black text-base uppercase tracking-tight text-slate-900">
                {stationProfile?.fuelStationName || "SHITAL PETROL PUMP"}
              </div>
              <div className="text-[10px] text-slate-600 font-mono">
                {stationProfile?.address || "State Highway, Kheralu, Mehsana, Gujarat 384325"}
              </div>
              <div className="text-[10px] font-mono text-slate-600">
                GSTIN: {stationProfile?.gstin || "24AAAAA0000A1Z5"} | Phone: {stationProfile?.phone || "+91 98790 12345"}
              </div>
            </div>

            {/* Invoice Meta */}
            <div className="py-2.5 border-b border-dashed border-slate-400 text-[11px] font-mono space-y-1">
              <div className="flex justify-between">
                <span>Invoice #: {invoice.invoiceNo}</span>
                <span>Date: {invoice.date}</span>
              </div>
              <div className="flex justify-between">
                <span>Customer: {invoice.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>Vehicle: {invoice.vehicleNo}</span>
                <span>Mode: {invoice.paymentMode}</span>
              </div>
            </div>

            {/* Line Items */}
            <div className="py-3 border-b border-dashed border-slate-400 text-[11px] font-mono">
              <div className="flex justify-between font-bold border-b border-slate-200 pb-1 mb-1">
                <span>Item</span>
                <span>Qty</span>
                <span>Rate</span>
                <span>Amount</span>
              </div>
              <div className="flex justify-between py-1">
                <span>{invoice.productName.slice(0, 15)}</span>
                <span>{invoice.litres}L</span>
                <span>₹{invoice.rate}</span>
                <span className="font-bold">₹{subtotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Totals */}
            <div className="pt-2.5 font-mono text-[11px] space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              {invoice.isGst && (
                <div className="flex justify-between text-slate-600">
                  <span>GST Tax (18%):</span>
                  <span>₹{taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm text-slate-900 border-t border-slate-900 pt-1.5 mt-1">
                <span>NET PAYABLE:</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-4 text-[10px] text-slate-600 font-mono space-y-0.5">
              <div>Thank You! Drive Safely.</div>
              <div>Save Fuel, Save Environment</div>
              <div className="text-[8px] text-slate-400">Powered by MY PUMP Software</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
