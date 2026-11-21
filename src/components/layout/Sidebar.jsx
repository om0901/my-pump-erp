import React from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import {
  Layers,
  LayoutDashboard,
  Fuel,
  FileSpreadsheet,
  Droplet,
  BarChart3,
  Users,
  Receipt,
  Calculator,
  FileText,
  Landmark,
  UserCheck,
  Building2,
  Settings,
  ChevronRight,
  LogIn,
  UserPlus
} from 'lucide-react';

export default function Sidebar({ width = 260 }) {
  const { activeTab, setActiveTab } = useApp();
  const { isAuthenticated, openAuthModal } = useAuth();
  const isCompact = width < 140;

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, isPrimary: true },
    { id: 'master-sheet', label: 'Daily Entry', icon: Layers },
    { id: 'stock', label: 'Stock Patrak', icon: FileSpreadsheet },
    { id: 'lubricants', label: 'Lubricants', icon: Droplet },
    { id: 'sell-patrak', label: 'Sell Patrak', icon: BarChart3 },
    { id: 'expenses', label: 'Other Accounts', icon: Receipt },
    { id: 'accounts', label: 'Debit - Credit Ledger', icon: Users },
    { id: 'banking', label: 'Bank Hisab', icon: Building2 },
    { id: 'invoice', label: 'Invoice Maker', icon: FileText },
    { id: 'tax', label: 'Tax', icon: Landmark },
    { id: 'staff', label: 'Staff Attendance', icon: UserCheck },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      style={{ width: `${width}px` }}
      className="bg-[#0c121d] text-slate-200 border-r border-[#1a2335] flex flex-col h-screen sticky top-0 z-20 transition-all duration-75 overflow-hidden shadow-xl p-3 space-y-1"
    >
      {/* Brand Header */}
      <div className={`pb-3 border-b border-[#1a2335] flex items-center ${isCompact ? 'justify-center' : 'gap-2.5 px-1'}`}>
        <div className="relative w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-600 via-orange-500 to-amber-400 flex items-center justify-center text-white shadow-md shadow-orange-500/20 shrink-0">
          <Fuel className="w-4 h-4 text-white" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-[#0c121d] animate-pulse" />
        </div>

        {!isCompact && (
          <div className="overflow-hidden whitespace-nowrap">
            <h1 className="text-[14px] font-semibold text-slate-100 tracking-tight">
              MY PUMP
            </h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">
              Fuel Station ERP
            </p>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto space-y-1 py-1 custom-scrollbar">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button type="button"
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={isCompact ? item.label : undefined}
              className={`w-full flex items-center ${
                isCompact ? 'justify-center px-0 py-2' : 'justify-between px-3 py-2'
              } text-xs transition-colors duration-150 group cursor-pointer ${
                isActive
                  ? 'bg-[#192438] text-white border-l-2 border-blue-500 rounded-r-lg font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#131b29] rounded-lg font-normal'
              }`}
            >
              <div className={`flex items-center ${isCompact ? 'justify-center' : 'gap-2.5'} shrink-0`}>
                <Icon
                  className={`w-4 h-4 transition-transform duration-150 group-hover:scale-105 ${
                    isActive
                      ? 'text-blue-400'
                      : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                {!isCompact && <span className="truncate">{item.label}</span>}
              </div>

              {!isCompact && isActive && (
                <ChevronRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Auth Status & Action Buttons in Sidebar */}
      <div className="pt-2 border-t border-[#1a2335] bg-[#0c121d] space-y-1.5 px-1">
        {!isAuthenticated ? (
          !isCompact ? (
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button"
                onClick={() => openAuthModal('login')}
                className="px-2 py-1.5 rounded-lg bg-[#172033] hover:bg-[#1f2b45] text-blue-400 border border-blue-500/30 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer"
              >
                <LogIn className="w-3 h-3" />
                <span>Login</span>
              </button>

              <button type="button"
                onClick={() => openAuthModal('signup')}
                className="px-2 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-[11px] flex items-center justify-center gap-1 cursor-pointer shadow-xs"
              >
                <UserPlus className="w-3 h-3" />
                <span>Sign Up</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <button type="button"
                onClick={() => openAuthModal('login')}
                className="p-1.5 rounded-lg bg-[#172033] text-blue-400 hover:bg-[#1f2b45]"
                title="Login"
              >
                <LogIn className="w-4 h-4" />
              </button>
              <button type="button"
                onClick={() => openAuthModal('signup')}
                className="p-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700"
                title="Sign Up"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
          )
        ) : (
          !isCompact && (
            <div className="text-[11px] font-semibold text-emerald-400 flex items-center justify-center gap-1.5 py-1 bg-emerald-950/30 rounded-lg border border-emerald-900/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Cloud Connected</span>
            </div>
          )
        )}

        {!isCompact ? (
          <p className="text-[10px] font-normal leading-relaxed tracking-tight text-slate-400 pt-1 text-center">
            Developed By <span className="text-slate-300 font-medium">OM Raval</span>
          </p>
        ) : (
          <div className="text-center text-[9px] font-bold text-slate-400 pt-1">
            MY PUMP
          </div>
        )}
      </div>
    </aside>
  );
}
