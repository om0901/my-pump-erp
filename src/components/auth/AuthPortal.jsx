import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  Fuel,
  Building2,
  User,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  Phone,
  Receipt,
  RotateCcw
} from 'lucide-react';

export default function AuthPortal() {
  const { login, signup, resetPassword } = useAuth();

  // Mode: 'signin' | 'signup' | 'forgot'
  const [mode, setMode] = useState('signin');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [stationName, setStationName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [mobile, setMobile] = useState('');

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);

  // States
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  const switchMode = (newMode) => {
    clearMessages();
    setMode(newMode);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    clearMessages();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your station email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your account password.');
      return;
    }

    setSubmitting(true);
    try {
      const { user, error } = await login(cleanEmail, password);
      if (error) {
        if (error.message?.toLowerCase().includes('invalid login credentials')) {
          setErrorMessage('Invalid email or password. Please verify and try again.');
        } else if (error.message?.toLowerCase().includes('email not confirmed')) {
          setErrorMessage('Email not confirmed. Please check your inbox or disable email confirmation in Supabase.');
        } else {
          setErrorMessage(error.message || 'Failed to sign in. Please try again.');
        }
      } else if (user) {
        setSuccessMessage('Login successful! Loading your station workspace...');
      }
    } catch (err) {
      setErrorMessage(err.message || 'An unexpected error occurred during sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    clearMessages();

    const cleanEmail = email.trim();
    const cleanStation = stationName.trim();
    const cleanOwner = ownerName.trim();

    if (!cleanStation) {
      setErrorMessage('Please enter your Petrol Pump / Fuel Station name.');
      return;
    }
    if (!cleanOwner) {
      setErrorMessage('Please enter the Station Owner or Manager name.');
      return;
    }
    if (!cleanEmail) {
      setErrorMessage('Please enter a valid station email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setSubmitting(true);
    try {
      const { user, error } = await signup({
        email: cleanEmail,
        password: password,
        fuelStationName: cleanStation,
        ownerName: cleanOwner,
        mobile: mobile.trim()
      });

      if (error) {
        if (error.message?.toLowerCase().includes('already registered')) {
          setErrorMessage('This email is already registered. Please switch to Sign In.');
        } else {
          setErrorMessage(error.message || 'Account registration failed. Please try again.');
        }
      } else if (user) {
        setSuccessMessage('Station account created successfully! Entering workspace...');
      }
    } catch (err) {
      setErrorMessage(err.message || 'An unexpected error occurred during sign up.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    clearMessages();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your registered station email address.');
      return;
    }

    setSubmitting(true);
    try {
      let result;
      if (typeof resetPassword === 'function') {
        result = await resetPassword(cleanEmail);
      } else {
        const redirectUrl = typeof window !== 'undefined' ? window.location.origin : '';
        result = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: redirectUrl });
      }

      if (result?.error) {
        setErrorMessage(result.error.message || 'Unable to send password reset email.');
      } else {
        setSuccessMessage(`Password reset link sent to ${cleanEmail}. Please check your inbox.`);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to send password reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 overflow-y-auto p-4 sm:p-6 select-none font-sans">
      {/* Background Decorative Glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container Card */}
      <div className="relative w-full max-w-4xl bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl grid grid-cols-1 md:grid-cols-12 min-h-[580px]">
        {/* Left Feature Showcase Banner (Desktop) */}
        <div className="hidden md:flex md:col-span-5 bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-950 p-8 flex-col justify-between border-r border-slate-800/80 relative overflow-hidden">
          <div className="absolute -top-12 -left-12 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl" />

          {/* Logo & Brand Header */}
          <div className="space-y-3 z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
                <Fuel className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-white">MY PUMP</h1>
                <p className="text-[10px] uppercase font-bold tracking-widest text-blue-400">Enterprise Cloud ERP</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed pt-2">
              Next-generation fuel station management. Dual Jama-Udhar accounting, real-time nozzle readings, and account-isolated cloud synchronization.
            </p>
          </div>

          {/* Value Highlights */}
          <div className="space-y-3.5 z-10 py-6">
            <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-200">Account-Wise RLS Isolation</p>
                <p className="text-[11px] text-slate-400">Your station rates, nozzles, and accounts are 100% private to your user ID.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-200">Live Real-Time Sync</p>
                <p className="text-[11px] text-slate-400">Offline-first local cache with instant Supabase cloud background sync.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
              <Receipt className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-200">Complete Station Books</p>
                <p className="text-[11px] text-slate-400">Daily Entry, Stock & Sell Patrak, Ushina Khata, and Bank Hisab.</p>
              </div>
            </div>
          </div>

          {/* Bottom Security Badge */}
          <div className="z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Enterprise Security 256-bit</span>
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Cloud Live
            </span>
          </div>
        </div>

        {/* Right Authentication Form Area */}
        <div className="md:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
          {/* Top Form Header */}
          <div className="mb-6">
            {mode === 'signin' && (
              <>
                <h2 className="text-2xl font-black text-white tracking-tight">Sign In to Your Station</h2>
                <p className="text-xs text-slate-400 mt-1">Enter your station credentials to access the ERP dashboard</p>
              </>
            )}
            {mode === 'signup' && (
              <>
                <h2 className="text-2xl font-black text-white tracking-tight">Register New Station</h2>
                <p className="text-xs text-slate-400 mt-1">Create an isolated cloud workspace for your petrol pump</p>
              </>
            )}
            {mode === 'forgot' && (
              <>
                <h2 className="text-2xl font-black text-white tracking-tight">Reset Password</h2>
                <p className="text-xs text-slate-400 mt-1">Enter your registered email to receive a secure recovery link</p>
              </>
            )}
          </div>

          {/* Error & Success Banners */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="leading-snug">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs flex items-start gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div className="leading-snug">{successMessage}</div>
            </div>
          )}

          {/* 1. SIGN IN FORM */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Station Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="station@mypump.com"
                    className="w-full bg-slate-950/60 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950/60 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] text-white font-extrabold text-xs shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Station</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-4 text-center border-t border-slate-800 text-xs text-slate-400">
                Don't have a station account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="font-bold text-blue-400 hover:text-blue-300 underline cursor-pointer"
                >
                  Create New Station Account
                </button>
              </div>
            </form>
          )}

          {/* 2. SIGN UP / NEW STATION REGISTRATION */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Station / Pump Name *
                  </label>
                  <div className="relative">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={stationName}
                      onChange={(e) => setStationName(e.target.value)}
                      placeholder="e.g. SHITAL PETROL PUMP"
                      className="w-full bg-slate-950/60 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-all uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Owner / Manager Name *
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. Rajesh Patel"
                      className="w-full bg-slate-950/60 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Station Email *
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="station@mypump.com"
                      className="w-full bg-slate-950/60 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Mobile / Contact (Optional)
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="9876543210"
                      className="w-full bg-slate-950/60 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-all font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Password (Min 6 chars) *
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-950/60 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-all font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Confirm Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-950/60 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-all font-mono"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-[0.99] text-white font-extrabold text-xs shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating Station Account...</span>
                  </>
                ) : (
                  <>
                    <span>Register Station & Enter ERP</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-3 text-center border-t border-slate-800 text-xs text-slate-400">
                Already have a station account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="font-bold text-blue-400 hover:text-blue-300 underline cursor-pointer"
                >
                  Sign In instead
                </button>
              </div>
            </form>
          )}

          {/* 3. FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Registered Station Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="station@mypump.com"
                    className="w-full bg-slate-950/60 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending Recovery Link...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Send Password Reset Email</span>
                  </>
                )}
              </button>

              <div className="pt-3 text-center border-t border-slate-800 text-xs text-slate-400">
                Remember your password?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="font-bold text-blue-400 hover:text-blue-300 underline cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
