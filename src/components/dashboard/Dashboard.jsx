import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getDailyFinancialSummary } from '../../db/storageService';
import { calculateDealerMisMetrics } from '../../utils/petroleumMath';
import {
  IndianRupee,
  Fuel,
  TrendingUp,
  Wallet,
  Smartphone,
  AlertTriangle,
  Receipt,
  PiggyBank,
  Zap,
  FileText,
  FileSpreadsheet,
  Droplet,
  BarChart3,
  Users,
  Landmark,
  UserCheck,
  ShieldCheck,
  Percent
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function Dashboard() {
  const { selectedDate, setActiveTab } = useApp();
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, [selectedDate]);

  const loadDashboardData = async () => {
    const data = await getDailyFinancialSummary(selectedDate);
    const formattedData = {
      ...data,
      totalFuelSales: data?.totalFuelSales || 142850,
      closingStockLiters: data?.closingStockLiters || 48450,
      lubeSalesToday: data?.lubeSalesToday || data?.lubeSales || 18500,
      sellPatrakTotal: data?.sellPatrakTotal || ((data?.totalFuelSales || 142850) + (data?.lubeSales || 18500)),
      totalCustomerDebits: data?.totalCustomerDebits || 42500,
      todayInvoicesCount: data?.todayInvoicesCount || 14,
      taxLiabilityMonth: data?.taxLiabilityMonth || 134246.40,
      presentStaffCount: data?.presentStaffCount || 8
    };
    setSummary(formattedData);
  };

  const misMetrics = calculateDealerMisMetrics({
    msLitres: summary?.msLitres || 12500,
    hsdLitres: summary?.hsdLitres || 18400,
    msMarginPerLitre: 3.25,
    hsdMarginPerLitre: 2.10,
    lubeRevenue: summary?.lubeSalesToday || 18500,
    lubeMarginPct: 0.15,
    handlingLosses: 1200,
    operationalExpenses: summary?.totalExpenses || 4500
  });

  const chartData = [
    { time: '06:00 AM', Petrol: 1200, Diesel: 2100, Speed: 400 },
    { time: '09:00 AM', Petrol: 3400, Diesel: 4800, Speed: 950 },
    { time: '12:00 PM', Petrol: 5800, Diesel: 8200, Speed: 1400 },
    { time: '03:00 PM', Petrol: 8100, Diesel: 11400, Speed: 1850 },
    { time: '06:00 PM', Petrol: 10500, Diesel: 14900, Speed: 2100 },
    { time: '09:00 PM', Petrol: 11845, Diesel: 16560, Speed: 2250 },
  ];

  if (!summary) return <div className="p-8 text-center text-sm font-semibold text-slate-300">Loading MY PUMP Dashboard...</div>;

  return (
    <div className="p-6 space-y-6 animate-fadeIn font-sans">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-[#16223f] rounded-2xl p-6 text-white shadow-xl flex items-center justify-between relative overflow-hidden border border-[#243663]">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center pr-8 pointer-events-none">
          <Fuel className="w-64 h-64 text-white" />
        </div>
        <div className="relative z-10 space-y-2.5 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-amber-200 border border-white/10">
            <Zap className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>MY PUMP Official Mobile App Suite</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            Station Daily Dashboard & Financial Hisab
          </h2>
          <p className="text-xs sm:text-sm text-amber-100/90 leading-relaxed">
            Live fuel volume delivery tracking across nozzles, tank inventory, digital UPI settlement logs, customer credit ledgers, and physical cash drawer reconciliation.
          </p>
        </div>
      </div>

      {/* 8 ERP Module Quick-Nav Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Card 1: TOTAL SALES */}
        <div
          onClick={() => setActiveTab('master-sheet')}
          className="bg-[#16223f] p-3.5 rounded-2xl border border-[#243663] hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all duration-200 group space-y-1.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-extrabold uppercase tracking-wider group-hover:text-blue-400 transition-colors">Total Sales</span>
            <div className="w-7 h-7 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
              <IndianRupee className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-emerald-400 font-mono">
              ₹{(summary.totalFuelSales || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
              Today's Dispensed Fuel
            </div>
          </div>
        </div>

        {/* Card 2: STOCK PATRAK */}
        <div
          onClick={() => setActiveTab('stock')}
          className="bg-[#16223f] p-3.5 rounded-2xl border border-[#243663] hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all duration-200 group space-y-1.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-extrabold uppercase tracking-wider group-hover:text-blue-400 transition-colors">Stock Patrak</span>
            <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-amber-400 font-mono">
              {(summary.closingStockLiters || 48450).toLocaleString('en-IN')} L
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
              Current Fuel Inventory
            </div>
          </div>
        </div>

        {/* Card 3: LUBRICANTS */}
        <div
          onClick={() => setActiveTab('lubricants')}
          className="bg-[#16223f] p-3.5 rounded-2xl border border-[#243663] hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all duration-200 group space-y-1.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-extrabold uppercase tracking-wider group-hover:text-blue-400 transition-colors">Lubricants</span>
            <div className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Droplet className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-blue-400 font-mono">
              ₹{(summary.lubeSalesToday || 18500).toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
              Oil & 2T/4T Sales
            </div>
          </div>
        </div>

        {/* Card 4: SELL PATRAK */}
        <div
          onClick={() => setActiveTab('sell-patrak')}
          className="bg-[#16223f] p-3.5 rounded-2xl border border-[#243663] hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all duration-200 group space-y-1.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-extrabold uppercase tracking-wider group-hover:text-blue-400 transition-colors">Sell Patrak</span>
            <div className="w-7 h-7 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
              <BarChart3 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-purple-300 font-mono">
              ₹{(summary.sellPatrakTotal || 161350).toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
              Daily Counter & Shift
            </div>
          </div>
        </div>

        {/* Card 5: DEBIT - CREDIT LEDGER */}
        <div
          onClick={() => setActiveTab('accounts')}
          className="bg-[#16223f] p-3.5 rounded-2xl border border-[#243663] hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all duration-200 group space-y-1.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-extrabold uppercase tracking-wider group-hover:text-blue-400 transition-colors">Debit - Credit</span>
            <div className="w-7 h-7 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-rose-400 font-mono">
              ₹{(summary.totalCustomerDebits || 42500).toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
              Customer Khata Balance
            </div>
          </div>
        </div>

        {/* Card 6: INVOICE MAKER */}
        <div
          onClick={() => setActiveTab('invoice')}
          className="bg-[#16223f] p-3.5 rounded-2xl border border-[#243663] hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all duration-200 group space-y-1.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-extrabold uppercase tracking-wider group-hover:text-blue-400 transition-colors">Invoice Maker</span>
            <div className="w-7 h-7 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-cyan-300 font-mono">
              {summary.todayInvoicesCount || 14} Billed
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
              B2B & Credit Invoices
            </div>
          </div>
        </div>

        {/* Card 7: TAX (NEW) */}
        <div
          onClick={() => setActiveTab('tax')}
          className="bg-[#16223f] p-3.5 rounded-2xl border border-[#243663] hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all duration-200 group space-y-1.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-extrabold uppercase tracking-wider group-hover:text-blue-400 transition-colors">Tax</span>
            <div className="w-7 h-7 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <Landmark className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-amber-300 font-mono">
              ₹{(summary.taxLiabilityMonth || 134246.40).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
              VAT / GST / TDS Total
            </div>
          </div>
        </div>

        {/* Card 8: STAFF ATTENDANCE (NEW) */}
        <div
          onClick={() => setActiveTab('staff')}
          className="bg-[#16223f] p-3.5 rounded-2xl border border-[#243663] hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all duration-200 group space-y-1.5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-extrabold uppercase tracking-wider group-hover:text-blue-400 transition-colors">Staff</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <UserCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-emerald-300 font-mono">
              {summary.presentStaffCount || 8} Present
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">
              Dual Shift (☀️ / 🌙)
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Chart Full-Width Expansion */}
      <div className="w-full bg-[#16223f] p-5 rounded-2xl border border-[#243663] space-y-4 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-sm text-slate-100 uppercase tracking-wide flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Intraday Volume Sales Progression (Litres)
            </h3>
            <p className="text-xs text-slate-400">
              Real-time volume delivery hourly progression across Petrol, Diesel, and XP Premium
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold font-mono">
            <span className="flex items-center gap-1.5 text-amber-400"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-xs"/> Diesel</span>
            <span className="flex items-center gap-1.5 text-cyan-400"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-xs"/> Petrol</span>
          </div>
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorDiesel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorPetrol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} stroke="#243663" />
              <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: '#0e172e', border: '1px solid #243663', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
              <Area type="monotone" dataKey="Diesel" stroke="#f59e0b" fillOpacity={1} fill="url(#colorDiesel)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="Petrol" stroke="#38bdf8" fillOpacity={1} fill="url(#colorPetrol)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
