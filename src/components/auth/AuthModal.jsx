import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  Fuel,
  Lock,
  Mail,
  Phone,
  Building,
  User,
  MapPin,
  IndianRupee,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  X,
  LogIn,
  UserPlus,
  Loader2,
  Cloud
} from 'lucide-react';
import NumericInput from '../common/NumericInput';

export default function AuthModal() {
  const { authModalMode, closeAuthModal, login, signup, isAuthenticated, setAuthModalMode } = useAuth();
  const { showToast, updateStationProfile } = useApp();

  const isSignup = authModalMode === 'signup';

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Signup Form State
  const [signupForm, setSignupForm] = useState({
    fuelStationName: '',
    gstin: '',
    mobile: '',
    email: '',
    address: '',
    ownerName: '',
    managerName: '',
    password: '',
    confirmPassword: '',
    openingShreeSilak: ''
  });

  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already authenticated and modal is closed, don't render
  if (!authModalMode && isAuthenticated) {
    return null;
  }

  // Non-dismissible mandatory overlay if user is not authenticated
  const isMandatoryModal = !isAuthenticated;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanEmail = loginEmail.trim();
    const cleanPassword = loginPassword.trim();

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage('Please enter both Email and Password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { user, error } = await login(cleanEmail, cleanPassword);
      if (error) {
        setErrorMessage(error.message || 'Login failed. Please check your credentials.');
        return;
      }

      if (user) {
        updateStationProfile({
          fuelStationName: user.fuelStationName,
          gstin: user.gstin,
          address: user.address,
          phone: user.mobile,
          email: user.email,
          ownerName: user.ownerName,
          managerName: user.managerName,
          openingShreeSilak: user.openingShreeSilak
        });
        showToast(`✅ Welcome back to ${user.fuelStationName || 'MY PUMP ERP'}!`, 'success');
      }
    } catch (err) {
      setErrorMessage(err.message || 'An unexpected error occurred during login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!signupForm.fuelStationName.trim()) {
      setErrorMessage('Petrol Pump / Station Name is required.');
      return;
    }
    if (!signupForm.email.trim()) {
      setErrorMessage('A valid Email ID is required for cloud account isolation.');
      return;
    }
    if (!signupForm.password) {
      setErrorMessage('Password is required.');
      return;
    }
    if (signupForm.password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (signupForm.password !== signupForm.confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { user, session, error } = await signup(signupForm);
      if (error) {
        setErrorMessage(error.message || 'Registration failed. Please try again.');
        return;
      }

      if (user) {
        updateStationProfile({
          fuelStationName: user.fuelStationName,
          gstin: user.gstin,
          address: user.address,
          phone: user.mobile,
          email: user.email,
          ownerName: user.ownerName,
          managerName: user.managerName,
          openingShreeSilak: user.openingShreeSilak
        });
        
        if (session) {
          showToast(`🎉 Registration Complete! ${user.fuelStationName} is now active.`, 'success');
        } else {
          showToast(`🎉 Account created for ${user.fuelStationName}! You can now login.`, 'success');
          setAuthModalMode('login');
        }
      }
    } catch (err) {
      setErrorMessage(err.message || 'An unexpected registration error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn select-text font-sans overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden my-auto relative text-slate-900 transition-all">
        
        {/* Top Header Strip */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-white shadow-md shadow-orange-500/30 shrink-0">
              <Fuel className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                <span>MY PUMP ERP</span>
                <span className="text-[10px] bg-emerald-600/90 text-white font-mono px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <Cloud className="w-2.5 h-2.5" /> Supabase Cloud
                </span>
              </h2>
              <p className="text-xs text-slate-300 font-medium">
                {isSignup ? 'Register New Fuel Station & Cloud Workspace' : 'Sign In to Station Account'}
              </p>
            </div>
          </div>

          {!isMandatoryModal && (
            <button
              type="button"
              onClick={closeAuthModal}
              className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Mode Toggle Tabs (Login vs Sign Up) */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => { setAuthModalMode('login'); setErrorMessage(''); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              !isSignup
                ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>LOGIN</span>
          </button>

          <button
            type="button"
            onClick={() => { setAuthModalMode('signup'); setErrorMessage(''); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              isSignup
                ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>CREATE NEW STATION</span>
          </button>
        </div>

        {/* Form Body Area */}
        <div className="p-6 max-h-[calc(85vh-120px)] overflow-y-auto space-y-4">
          
          {/* Error Message Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 1. LOGIN FORM */}
          {/* ========================================================================= */}
          {!isSignup ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1.5 font-bold uppercase text-[10px] tracking-wider">
                  Station Email ID *
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. pump@shitalpetroleum.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1.5 font-bold uppercase text-[10px] tracking-wider">
                  Password *
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter station account password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl pl-9 pr-10 py-2.5 text-xs font-medium outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Login Actions */}
              <div className="pt-2 space-y-2.5">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing In...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Login to Station Workspace</span>
                    </>
                  )}
                </button>
              </div>

              {/* Switch to Signup Prompt */}
              <div className="text-center pt-2 border-t border-slate-200">
                <span className="text-slate-500 font-medium">New fuel station? </span>
                <button
                  type="button"
                  onClick={() => { setAuthModalMode('signup'); setErrorMessage(''); }}
                  className="text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                >
                  Register New Station Account
                </button>
              </div>
            </form>
          ) : (
            /* ========================================================================= */
            /* 2. SIGNUP FORM (FULL PETROL PUMP REGISTRATION) */
            /* ========================================================================= */
            <form onSubmit={handleSignupSubmit} className="space-y-3.5 text-xs font-semibold">
              
              {/* Station Name */}
              <div>
                <label className="block text-slate-700 mb-1 font-bold uppercase text-[10px] tracking-wider">
                  1. Petrol Pump / Station Name *
                </label>
                <div className="relative flex items-center">
                  <Building className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shital Petrol Pump"
                    value={signupForm.fuelStationName}
                    onChange={(e) => setSignupForm({ ...signupForm, fuelStationName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl pl-9 pr-3 py-2 text-xs font-bold outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600 transition-all"
                  />
                </div>
              </div>

              {/* GSTIN & Mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-bold uppercase text-[10px] tracking-wider">
                    2. GSTIN Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 24AAAAA0000A1Z5"
                    value={signupForm.gstin}
                    onChange={(e) => setSignupForm({ ...signupForm, gstin: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-mono uppercase rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-bold uppercase text-[10px] tracking-wider">
                    3. Mobile Number
                  </label>
                  <div className="relative flex items-center">
                    <Phone className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="+91 98790 12345"
                      value={signupForm.mobile}
                      onChange={(e) => setSignupForm({ ...signupForm, mobile: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 text-slate-900 font-mono rounded-xl pl-9 pr-3 py-2 text-xs font-semibold outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Email & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-bold uppercase text-[10px] tracking-wider">
                    4. Station Email ID *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. pump@station.com"
                    value={signupForm.email}
                    onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-bold uppercase text-[10px] tracking-wider">
                    5. Address / Location
                  </label>
                  <input
                    type="text"
                    placeholder="State Highway, Kheralu, Mehsana"
                    value={signupForm.address}
                    onChange={(e) => setSignupForm({ ...signupForm, address: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Owner & Manager Names */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-bold uppercase text-[10px] tracking-wider">
                    6. Owner Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Owner Name"
                    value={signupForm.ownerName}
                    onChange={(e) => setSignupForm({ ...signupForm, ownerName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-bold uppercase text-[10px] tracking-wider">
                    7. Manager Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Shift Manager"
                    value={signupForm.managerName}
                    onChange={(e) => setSignupForm({ ...signupForm, managerName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Passwords */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-bold uppercase text-[10px] tracking-wider">
                    8. Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Min. 6 characters"
                    value={signupForm.password}
                    onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-bold uppercase text-[10px] tracking-wider">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Re-enter password"
                    value={signupForm.confirmPassword}
                    onChange={(e) => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* 🔑 CRITICAL FIELD 9: OPENING SHREE SILAK (INITIAL CASH IN HAND) */}
              <div className="bg-emerald-50/80 border-2 border-emerald-300 p-3 rounded-2xl space-y-1">
                <label className="block text-emerald-950 font-black uppercase text-[11px] tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <IndianRupee className="w-4 h-4 text-emerald-600" />
                    <span>9. Opening Shree Silak (Initial Cash in Hand) (₹)</span>
                  </span>
                  <span className="text-[10px] bg-emerald-200 text-emerald-900 font-mono px-2 py-0.5 rounded-full font-bold">Daily Entry Sync</span>
                </label>
                
                <NumericInput
                  step="100"
                  placeholder="e.g. 50000"
                  value={signupForm.openingShreeSilak}
                  onChange={(val) => setSignupForm({ ...signupForm, openingShreeSilak: val })}
                  className="w-full bg-white border border-emerald-400 focus:border-emerald-600 rounded-xl px-3.5 py-2 font-mono text-sm font-black text-emerald-800 text-right outline-none shadow-xs"
                />

                <p className="text-[11px] text-emerald-800 font-medium pt-0.5">
                  💡 <em>Initial drawer cash balance to start daily operations. Automatically initializes Row 1 of Final Shree Silak in Daily Entry.</em>
                </p>
              </div>

              {/* Actions */}
              <div className="pt-2 space-y-2.5">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-extrabold text-xs shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Station Account...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Register & Setup Station</span>
                    </>
                  )}
                </button>
              </div>

              {/* Switch to Login Prompt */}
              <div className="text-center pt-2 border-t border-slate-200">
                <span className="text-slate-500 font-medium">Already registered? </span>
                <button
                  type="button"
                  onClick={() => { setAuthModalMode('login'); setErrorMessage(''); }}
                  className="text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                >
                  Login to Workspace
                </button>
              </div>

            </form>
          )}

        </div>
      </div>
    </div>
  );
}
