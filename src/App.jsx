import React, { useState, useEffect, useRef } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPortal from './components/auth/AuthPortal';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';

import MasterDailySheet from './components/master/MasterDailySheet';
import Dashboard from './components/dashboard/Dashboard';
import DailyNozzleSheet from './components/nozzles/DailyNozzleSheet';
import StockManagement from './components/stock/StockManagement';
import LubricantsStock from './components/stock/LubricantsStock';
import SellPatrak from './components/stock/SellPatrak';
import CustomerLedger from './components/accounts/CustomerLedger';
import ExpenseTracker from './components/accounts/ExpenseTracker';
import InvoiceMaker from './components/invoice/InvoiceMaker';
import TaxManagement from './components/tax/TaxManagement';
import StaffAttendance from './components/staff/StaffAttendance';
import BankHisab from './components/banking/BankHisab';
import BackupSettings from './components/settings/BackupSettings';
import OnboardingModal from './components/onboarding/OnboardingModal';

import { CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Fuel, Loader2 } from 'lucide-react';
import { useExcelNavigation } from './hooks/useExcelNavigation';

function AppContent() {
  const { activeTab, dbReady, toastMessage, stationProfile } = useApp();
  const { authLoading, isAuthenticated, session, currentUser, authModalMode } = useAuth();

  // Onboarding modal lock: If user is onboarded, NEVER open the modal
  const isOnboarded = Boolean(
    stationProfile?.isOnboarded ||
    (currentUser?.id && localStorage.getItem(`mypump_${currentUser.id}_onboarded`) === 'true') ||
    localStorage.getItem('mypump_onboarded') === 'true'
  );

  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboarded);

  useEffect(() => {
    if (isOnboarded) {
      setShowOnboarding(false);
    }
  }, [isOnboarded]);

  // Attach Universal Excel-style 4-arrow key & Enter keyboard navigation across all modules
  useExcelNavigation();

  // --- DRAG-TO-RESIZE SIDEBAR DIVIDER (GEMINI / VS CODE STYLE) ---
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('mypump_sidebar_width');
    return saved ? parseInt(saved, 10) : 260;
  });
  const isResizingRef = useRef(false);

  // Strictly block keyboard reload shortcuts (F5, Ctrl+R) and form navigations,
  // while ensuring window close and app termination are never intercepted.
  useEffect(() => {
    window.onbeforeunload = null;

    const handleKeyDownReloadGuard = (e) => {
      if (e.key === 'F5') {
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        return;
      }
    };

    const handleFormSubmitGuard = (e) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDownReloadGuard, false);
    document.addEventListener('submit', handleFormSubmitGuard, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDownReloadGuard, false);
      document.removeEventListener('submit', handleFormSubmitGuard, true);
    };
  }, []);

  // One-time clean-slate migration for zero production state
  useEffect(() => {
    const SYSTEM_SCHEMA_VERSION = 'v2_clean_production_zero_state';
    const currentVersion = localStorage.getItem('pump_erp_schema_version');

    if (currentVersion !== SYSTEM_SCHEMA_VERSION) {
      const keysToClean = [
        'pump_stock_patrak_store',
        'pump_ledger_parties',
        'pump_ledger_transactions',
        'pump_sell_patrak_store',
        'pump_lubricant_monthly_matrix',
        'my_pump_daily_shifts_archive',
        'my_pump_master_parties_list',
        'my_pump_master_bank_accounts',
        'pump_bank_accounts_master',
        'lube_removed_products',
        'sell_patrak_2026-05',
        'sell_patrak_2026-09'
      ];
      keysToClean.forEach(k => localStorage.removeItem(k));

      localStorage.setItem('pump_erp_schema_version', SYSTEM_SCHEMA_VERSION);
    }
  }, []);

  useEffect(() => {
    const handleAutoSelect = (e) => {
      const target = e.target;
      if (target && target.tagName === 'INPUT' && (target.type === 'number' || target.getAttribute('inputmode') === 'numeric')) {
        setTimeout(() => {
          if (document.activeElement === target && typeof target.select === 'function') {
            target.select();
          }
        }, 10);
      }
    };

    document.addEventListener('focusin', handleAutoSelect);
    return () => document.removeEventListener('focusin', handleAutoSelect);
  }, []);

  // Mouse drag handlers for resizer
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingRef.current) return;
      let newWidth = e.clientX;
      if (newWidth < 100) newWidth = 70; // Snap to compact icon view
      else if (newWidth > 380) newWidth = 380;
      else if (newWidth < 180) newWidth = 180;

      setSidebarWidth(newWidth);
      localStorage.setItem('mypump_sidebar_width', newWidth.toString());
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = (e) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const toggleCompactSidebar = () => {
    const nextWidth = sidebarWidth < 140 ? 260 : 70;
    setSidebarWidth(nextWidth);
    localStorage.setItem('mypump_sidebar_width', nextWidth.toString());
  };

  if (authLoading || !dbReady) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white font-bold text-sm space-y-3">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <div className="text-slate-200">Connecting to MY PUMP Cloud Station...</div>
      </div>
    );
  }

  const renderActiveModule = () => {
    switch (activeTab) {
      case 'master-sheet':
        return <MasterDailySheet />;
      case 'dashboard':
        return <Dashboard />;
      case 'stock':
        return <StockManagement />;
      case 'lubricants':
        return <LubricantsStock />;
      case 'sell-patrak':
        return <SellPatrak />;
      case 'accounts':
        return <CustomerLedger />;
      case 'expenses':
        return <ExpenseTracker />;
      case 'invoice':
        return <InvoiceMaker />;
      case 'tax':
        return <TaxManagement />;
      case 'staff':
        return <StaffAttendance />;
      case 'banking':
        return <BankHisab />;
      case 'settings':
        return <BackupSettings />;
      default:
        return <MasterDailySheet />;
    }
  };

  // --- AUTHENTICATION GATE & ROUTE PROTECTION ---
  if (authLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-white gap-3 select-none">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center animate-pulse shadow-xl shadow-blue-500/20">
          <Fuel className="w-6 h-6 text-white" />
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          <span>Connecting to Station Cloud...</span>
        </div>
      </div>
    );
  }

  // Strict route protection: If no authenticated session, render full-screen AuthPortal gate
  if (!isAuthenticated || !session) {
    return <AuthPortal initialMode={authModalMode || 'signin'} />;
  }

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden">
      {/* 1. Left Sidebar (Dark Slate Theme) */}
      <Sidebar width={sidebarWidth} />

      {/* 2. Drag-To-Resize Divider Line */}
      <div
        onMouseDown={startResizing}
        className="relative w-1 bg-slate-800 hover:bg-blue-500 active:bg-blue-600 cursor-col-resize z-30 transition-colors group flex items-center justify-center shrink-0"
        title="Drag to resize sidebar width"
      >
        {/* Quick Collapse / Expand Snap Button */}
        <button type="button"
          onClick={toggleCompactSidebar}
          title={sidebarWidth < 140 ? 'Expand Sidebar' : 'Collapse Sidebar'}
          className="absolute top-14 -left-3.5 w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-blue-600 flex items-center justify-center shadow-lg transition-all z-40 active:scale-95"
        >
          {sidebarWidth < 140 ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* 3. Right Workspace / Main Content Area (Clean Light Theme) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--bg-primary)]">
        <Header />
        <main className="flex-1 overflow-y-auto relative">
          {renderActiveModule()}
        </main>
      </div>

      {/* First-Time User Onboarding Modal (Appears Strictly Once Ever Per User) */}
      {isAuthenticated && session && !isOnboarded && showOnboarding && (
        <OnboardingModal onClose={() => setShowOnboarding(false)} />
      )}

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-bold ${
            toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : toastMessage.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-slate-900 text-white border-slate-800'
          }`}>
            {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
            <span>{toastMessage.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('MY PUMP ERP Error Boundary Caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center space-y-4">
          <div className="p-4 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-black tracking-tight">MY PUMP Application Error Recovered</h2>
          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
            {this.state.error?.message || 'A render issue occurred. Click below to reload state.'}
          </p>
          <button type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-lg transition-all active:scale-95"
          >
            Recover Software Workspace
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
