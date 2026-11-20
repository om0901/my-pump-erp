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
  UserPlus
} from 'lucide-react';
import NumericInput from '../common/NumericInput';

export default function AuthModal() {
  const { authModalMode, closeAuthModal, login, signup, isAuthenticated, setAuthModalMode } = useAuth();
  const { showToast, updateStationProfile } = useApp();

  const isSignup = authModalMode === 'signup';

  // Login Form State
  const [loginField, setLoginField] = useState('info@shitalpetroleum.com');
  const [loginPassword, setLoginPassword] = useState('password123');
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

  if (!authModalMode && isAuthenticated) {
    return null; // Don't render modal when logged in and modal closed
  }

  // Mandatory overlay if logged out
  const isMandatoryModal = !isAuthenticated;

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');
    if (!loginField.trim() || !loginPassword.trim()) {
      setErrorMessage('Please enter Email / Mobile and Password');
      return;
    }

    const user = login(loginField.trim(), loginPassword.trim());
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
  };

  const handleSignupSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!signupForm.fuelStationName.trim()) {
      setErrorMessage('Petrol Pump / Station Name is required.');
      return;
    }
    if (!signupForm.mobile.trim() && !signupForm.email.trim()) {
      setErrorMessage('Please provide a Mobile Number or Email ID.');
      return;
    }
    if (signupForm.password && signupForm.password !== signupForm.confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify.');
      return;
    }

    const newUser = signup(signupForm);
    if (newUser) {
      updateStationProfile({
        fuelStationName: newUser.fuelStationName,
        gstin: newUser.gstin,
        address: newUser.address,
        phone: newUser.mobile,
        email: newUser.email,
        ownerName: newUser.ownerName,
        managerName: newUser.managerName,
        openingShreeSilak: newUser.openingShreeSilak
      });
      showToast(`🎉 Registration Complete! ${newUser.fuelStationName} is now active.`, 'success');
    }
  };

  const handleGoogleAuth = () => {
    // Google OAuth Mock Simulation
    const mockUser = {
      fuelStationName: signupForm.fuelStationName || 'SHITAL PETROL PUMP',
      gstin: signupForm.gstin || '24AAAAA0000A1Z5',
      mobile: signupForm.mobile || '+91 98790 12345',
      email: signupForm.email || 'google.user@shitalpetroleum.com',
      address: signupForm.address || 'Highway Complex, Kheralu',
      ownerName: signupForm.ownerName || 'Google User',
      managerName: signupForm.managerName || 'Shift Manager',
      openingShreeSilak: parseFloat(signupForm.openingShreeSilak) || 50000
    };

    if (isSignup) {
      const u = signup(mockUser);
      updateStationProfile(mockUser);
      showToast(`Signed up with Google successfully!`, 'success');
    } else {
      const u = login(mockUser.email, 'google-auth');
      updateStationProfile(mockUser);
      showToast(`Logged in with Google!`, 'success');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn select-text font-sans overflow-y-auto">
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
                <span className="text-[10px] bg-blue-600/90 text-white font-mono px-2 py-0.5 rounded-full uppercase tracking-wider">v2.0 Light</span>
              </h2>
              <p className="text-xs text-slate-300 font-medium">
                {isSignup ? 'Register New Fuel Station Account' : 'Sign In to Station Workspace'}
              </p>
            </div>
          </div>

          {!isMandatoryModal && (
            <button type="button"
              onClick={closeAuthModal}
              className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
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
            <span>CREATE NEW ACCOUNT</span>
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
            <form onSubmit={(e) => { e.preventDefault(); handleLoginSubmit(e); }} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1.5 font-bold uppercase text-[10px] tracking-wider">
                  Email ID or Mobile Number *
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. info@shitalpetroleum.com or 9879012345"
                    value={loginField}
                    onChange={(e) => setLoginField(e.target.value)}
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
                    placeholder="Enter password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl pl-9 pr-10 py-2.5 text-xs font-medium outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Login Actions */}
              <div className="pt-2 space-y-2.5">
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login to Station Workspace</span>
                </button>

                {/* Google Sign In Button */}
                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  className="w-full py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </div>

              {/* Switch to Signup Prompt */}
              <div className="text-center pt-2 border-t border-slate-200">
                <span className="text-slate-500 font-medium">Don't have a registered station? </span>
                <button
                  type="button"
                  onClick={() => { setAuthModalMode('signup'); setErrorMessage(''); }}
                  className="text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                >
                  Create New Account / Sign Up
                </button>
              </div>
            </form>
          ) : (
            /* ========================================================================= */
            /* 2. SIGNUP FORM (FULL PETROL PUMP REGISTRATION) */
            /* ========================================================================= */
            <form onSubmit={(e) => { e.preventDefault(); handleSignupSubmit(e); }} className="space-y-3.5 text-xs font-semibold">
              
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
                    3. Mobile Number *
                  </label>
                  <div className="relative flex items-center">
                    <Phone className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      required
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
                    4. Email ID
                  </label>
                  <input
                    type="email"
                    placeholder="info@shitalpetroleum.com"
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
                    8. Password
                  </label>
                  <input
                    type="password"
                    placeholder="Create password"
                    value={signupForm.password}
                    onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-bold uppercase text-[10px] tracking-wider">
                    Confirm Password
                  </label>
                  <input
                    type="password"
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
                  className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Register & Setup Station</span>
                </button>

                {/* Google Sign In Button */}
                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  className="w-full py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </div>

              {/* Switch to Login Prompt */}
              <div className="text-center pt-2 border-t border-slate-200">
                <span className="text-slate-500 font-medium">Already have an account? </span>
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
