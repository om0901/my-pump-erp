import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';
import { 
  Fuel, 
  Lock, 
  Mail, 
  User, 
  Building2, 
  Phone, 
  ArrowRight, 
  ShieldCheck, 
  Sparkles, 
  Receipt, 
  AlertCircle, 
  CheckCircle2, 
  RotateCcw,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle
} from 'lucide-react';

export default function AuthPortal({ initialMode = 'signin' }) {
  const { login, signup, resetPassword } = useAuth();

  // Mode: 'signin' | 'signup' | 'forgot'
  const [mode, setMode] = useState(initialMode === 'signup' ? 'signup' : 'signin');

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode === 'signup' ? 'signup' : 'signin');
    }
  }, [initialMode]);

  // Common fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sign up fields
  const [stationName, setStationName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Check if env variables are defined in Vite
  const isEnvConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL && 
    import.meta.env.VITE_SUPABASE_ANON_KEY &&
    !import.meta.env.VITE_SUPABASE_URL.includes('your-project-id')
  );

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  const switchMode = (newMode) => {
    clearMessages();
    setMode(newMode);
  };

  // --- 1. SIGN IN HANDLER ---
  const handleSignIn = async (e) => {
    e.preventDefault();
    clearMessages();

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setSubmitting(true);
    console.log('[AuthPortal] Attempting sign in for:', cleanEmail);

    try {
      let result;
      if (typeof login === 'function') {
        result = await login(cleanEmail, password);
      } else {
        result = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });
      }

      console.log('[AuthPortal] Sign In result:', result);

      if (result?.error) {
        const msg = result.error.message || 'Failed to sign in. Please check your credentials.';
        if (msg.toLowerCase().includes('invalid login credentials')) {
          setErrorMessage('Invalid station email or password. Please verify and try again.');
        } else if (msg.toLowerCase().includes('email not confirmed')) {
          setErrorMessage('Email address not yet confirmed. Please verify your email inbox or disable email confirmation in Supabase settings.');
        } else {
          setErrorMessage(msg);
        }
      } else {
        setSuccessMessage('Sign in successful! Loading station workspace...');
      }
    } catch (err) {
      console.error('[AuthPortal] Unexpected error during Sign In:', err);
      setErrorMessage(err.message || 'An unexpected error occurred while signing in.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- 2. SIGN UP HANDLER ---
  const handleSignUp = async (e) => {
    e.preventDefault();
    clearMessages();

    const cleanEmail = email.trim();
    const cleanStation = stationName.trim();
    const cleanOwner = ownerName.trim();

    if (!cleanStation) {
      setErrorMessage('Please enter your Petrol Pump / Station Name.');
      return;
    }
    if (!cleanOwner) {
      setErrorMessage('Please enter the Station Owner or Manager Name.');
      return;
    }
    if (!cleanEmail) {
      setErrorMessage('Please enter a valid station email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter your password.');
      return;
    }

    setSubmitting(true);
    console.log('[AuthPortal] Attempting station registration for:', cleanEmail, cleanStation);

    try {
      let result;
      if (typeof signup === 'function') {
        result = await signup({
          email: cleanEmail,
          password,
          fuelStationName: cleanStation,
          ownerName: cleanOwner,
          mobile: mobile.trim()
        });
      } else {
        result = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              fuelStationName: cleanStation,
              station_name: cleanStation,
              ownerName: cleanOwner,
              owner_name: cleanOwner,
              mobile: mobile.trim()
            }
          }
        });
      }

      console.log('[AuthPortal] Sign Up result:', result);

      const user = result?.user || result?.data?.user;
      const session = result?.session || result?.data?.session;

      if (result?.error) {
        const msg = result.error.message || 'Failed to register station.';
        if (msg.toLowerCase().includes('already registered')) {
          setErrorMessage('An account with this email already exists. Please sign in instead.');
        } else {
          setErrorMessage(msg);
        }
      } else if (user) {
        if (session) {
          setSuccessMessage('Station account created successfully! Entering ERP workspace...');
        } else {
          setSuccessMessage('Account registered successfully! If email confirmation is enabled on your Supabase project, please check your inbox to confirm your email before signing in.');
        }
      }
    } catch (err) {
      console.error('[AuthPortal] Unexpected error during Sign Up:', err);
      setErrorMessage(err.message || 'An unexpected error occurred while creating your account.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- 3. FORGOT PASSWORD HANDLER ---
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    clearMessages();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your registered station email address.');
      return;
    }

    setSubmitting(true);
    console.log('[AuthPortal] Requesting password reset for:', cleanEmail);

    try {
      let result;
      if (typeof resetPassword === 'function') {
        result = await resetPassword(cleanEmail);
      } else {
        const redirectUrl = typeof window !== 'undefined' ? window.location.origin : '';
        result = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: redirectUrl });
      }

      console.log('[AuthPortal] Password reset result:', result);

      if (result?.error) {
        setErrorMessage(result.error.message || 'Unable to send password reset email.');
      } else {
        setSuccessMessage(`Password recovery link sent to ${cleanEmail}. Please check your inbox.`);
      }
    } catch (err) {
      console.error('[AuthPortal] Unexpected error during password reset:', err);
      setErrorMessage(err.message || 'Failed to send password reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-orange-50 via-slate-50 to-amber-50 text-slate-900 overflow-y-auto p-4 sm:p-6 select-none font-sans">
      {/* Background Subtle Warm Ambient Glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container Card */}
      <div className="relative w-full max-w-4xl bg-white border border-orange-100 rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[580px]">
        
        {/* Left Feature Showcase Banner (Light Warm Amber Theme) */}
        <div className="hidden md:flex md:col-span-5 bg-orange-50/80 p-8 flex-col justify-between border-r border-orange-100 relative overflow-hidden">
          <div className="absolute -top-12 -left-12 w-48 h-48 bg-orange-200/30 rounded-full blur-2xl pointer-events-none" />

          {/* Logo & Brand Header */}
          <div className="space-y-3 z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25 text-white">
                <Fuel className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900">MY PUMP</h1>
                <p className="text-[10px] uppercase font-bold tracking-widest text-orange-600">Fuel Station ERP</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed pt-2">
              Next-generation fuel station management. Dual Jama-Udhar accounting, real-time nozzle readings, and account-isolated cloud synchronization.
            </p>
          </div>

          {/* Value Highlights */}
          <div className="space-y-3 z-10 py-6">
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/90 border border-orange-100/90 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">Account-Wise Data Isolation</p>
                <p className="text-[11px] text-slate-600">Strict Row Level Security (RLS). Every station's data is isolated.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/90 border border-orange-100/90 shadow-2xs">
              <Sparkles className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">Dual Sync Architecture</p>
                <p className="text-[11px] text-slate-600">Instant offline local cache with automated background cloud sync.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/90 border border-orange-100/90 shadow-2xs">
              <Receipt className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">Complete Station Ledger</p>
                <p className="text-[11px] text-slate-600">Daily Entry, Stock Patrak, Ushina Khata, and Bank Hisab.</p>
              </div>
            </div>
          </div>

          {/* Bottom Security Footer */}
          <div className="z-10 pt-4 border-t border-orange-200/60 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Enterprise 256-bit Security</span>
            <span className="font-semibold text-slate-600">Offline Ready</span>
          </div>
        </div>

        {/* Right Authentication Form Area - Crisp Clean Pure White Background */}
        <div className="md:col-span-7 bg-white text-slate-900 p-6 sm:p-10 flex flex-col justify-center">
          
          {/* Supabase API Key Configuration Warning (if env keys missing) */}
          {!isEnvConfigured && !isSupabaseConfigured && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-300 text-red-800 text-xs flex items-start gap-2.5 shadow-xs">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="leading-snug">
                <span className="font-bold block">Supabase API Keys Missing in .env!</span>
                Please add <code className="font-mono bg-red-100 px-1 py-0.5 rounded text-[11px]">VITE_SUPABASE_URL</code> and <code className="font-mono bg-red-100 px-1 py-0.5 rounded text-[11px]">VITE_SUPABASE_ANON_KEY</code> to your <code className="font-mono bg-red-100 px-1 py-0.5 rounded text-[11px]">.env</code> file and restart the dev server.
              </div>
            </div>
          )}

          {/* Top Form Header with Crisp Dark Text */}
          <div className="mb-6">
            {mode === 'signin' && (
              <>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Sign In to Station</h2>
                <p className="text-xs text-slate-500 font-medium mt-1">Enter your station credentials to open the ERP workspace</p>
              </>
            )}
            {mode === 'signup' && (
              <>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Register New Station</h2>
                <p className="text-xs text-slate-500 font-medium mt-1">Create an isolated cloud workspace for your petrol pump</p>
              </>
            )}
            {mode === 'forgot' && (
              <>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Reset Password</h2>
                <p className="text-xs text-slate-500 font-medium mt-1">Enter your registered email to receive a secure recovery link</p>
              </>
            )}
          </div>

          {/* Success Banner */}
          {successMessage && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs flex items-start gap-2.5 shadow-xs animate-fadeIn font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <div className="leading-snug">{successMessage}</div>
            </div>
          )}

          {/* Error Banner - High Contrast Bright Red Box */}
          {errorMessage && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-400 text-red-700 text-xs flex items-start gap-2.5 shadow-xs animate-fadeIn font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div className="leading-snug">{errorMessage}</div>
            </div>
          )}

          {/* 1. SIGN IN FORM */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Station Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="station@mypump.com"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-900 font-medium placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-orange-600 hover:text-orange-700 font-bold transition-colors cursor-pointer"
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
                    className="w-full bg-slate-50 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-900 font-mono placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 active:scale-[0.99] text-white font-extrabold text-sm shadow-md shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Signing In to Station...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Station</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-4 text-center border-t border-slate-100 text-xs text-slate-600 font-medium">
                Don't have a station account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="font-extrabold text-orange-600 hover:text-orange-700 underline cursor-pointer"
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
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
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
                      className="w-full bg-slate-50 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 font-medium placeholder:text-slate-400 outline-none transition-all uppercase shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
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
                      className="w-full bg-slate-50 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 font-medium placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
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
                      className="w-full bg-slate-50 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 font-medium placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Mobile / Contact (Optional)
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="9876543210"
                      className="w-full bg-slate-50 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 font-mono placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
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
                      className="w-full bg-slate-50 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 font-mono placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
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
                      className="w-full bg-slate-50 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 font-mono placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 active:scale-[0.99] text-white font-extrabold text-sm shadow-md shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Creating Station Account...</span>
                  </>
                ) : (
                  <>
                    <span>Register Station & Enter ERP</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-3 text-center border-t border-slate-100 text-xs text-slate-600 font-medium">
                Already have a station account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="font-extrabold text-orange-600 hover:text-orange-700 underline cursor-pointer"
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
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Registered Station Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="station@mypump.com"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-900 font-medium placeholder:text-slate-400 outline-none transition-all shadow-2xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-extrabold text-sm shadow-md shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Sending Recovery Link...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Send Password Reset Email</span>
                  </>
                )}
              </button>

              <div className="pt-3 text-center border-t border-slate-100 text-xs text-slate-600 font-medium">
                Remember your password?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="font-extrabold text-orange-600 hover:text-orange-700 underline cursor-pointer"
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
