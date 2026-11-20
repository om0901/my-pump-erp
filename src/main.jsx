// PERMANENT LIGHT MODE ENFORCEMENT
document.documentElement.classList.remove('dark');
document.documentElement.setAttribute('data-theme', 'light');
try {
  localStorage.setItem('mypump_theme', 'light');
} catch (e) {}

// Block unexpected reload executions
if (typeof window !== 'undefined') {
  try {
    window.location.reload = () => console.warn('Blocked window.location.reload() execution');
  } catch (e) {
    // window.location.reload is read-only in strict mode ES modules
  }

  // Intercept any uncaught exceptions or unhandled promise rejections globally
  window.addEventListener('error', (e) => {
    console.error('Handled unhandled error at window level without reload:', e.error || e.message);
    if (e && e.preventDefault) e.preventDefault();
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Handled unhandled promise rejection at window level without reload:', e.reason);
    if (e && e.preventDefault) e.preventDefault();
  });
}

// IMMEDIATE FACTORY RESET & ZERO-STATE ENFORCEMENT
(function enforceZeroProductionState() {
  const PRODUCTION_RESET_KEY = 'my_pump_factory_zero_state_v1';
  if (localStorage.getItem(PRODUCTION_RESET_KEY) !== 'done') {
    // Clear all existing cached demo data
    const allKeys = Object.keys(localStorage);
    allKeys.forEach((key) => {
      if (
        key.startsWith('pump_') ||
        key.startsWith('my_pump_') ||
        key.includes('ledger') ||
        key.includes('stock') ||
        key.includes('shift') ||
        key.includes('lube') ||
        key.includes('bank') ||
        key.includes('sell') ||
        key.includes('parties')
      ) {
        localStorage.removeItem(key);
      }
    });
    // Set clean initial zero stores
    localStorage.setItem('pump_stock_patrak_store', JSON.stringify({ petrol: [], diesel: [], speed: [] }));
    localStorage.setItem('pump_sell_patrak_store', JSON.stringify({ petrol: [], diesel: [], cng: [], speed: [] }));
    localStorage.setItem('pump_bank_hisab_store', JSON.stringify({ accounts: [], transactions: [] }));
    localStorage.setItem('pump_ledger_parties', JSON.stringify([]));
    localStorage.setItem('pump_lubricant_monthly_matrix', JSON.stringify([]));
    localStorage.setItem('my_pump_daily_shifts_archive', JSON.stringify({}));
    
    // Mark reset complete
    localStorage.setItem(PRODUCTION_RESET_KEY, 'done');
    console.log('FACTORY RESET COMPLETE: All mock and dummy records permanently purged.');
  }
})();

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
