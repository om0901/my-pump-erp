import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // authModalMode: null | 'login' | 'signup'
  const [authModalMode, setAuthModalMode] = useState(null);

  // Helper to construct a clean user profile from Supabase User & Metadata,
  // prioritizing saved user-scoped station profile over initial signup metadata
  const mapSupabaseUser = (user) => {
    if (!user) return null;
    const meta = user.user_metadata || {};

    let savedLocal = null;
    try {
      const s = localStorage.getItem(`mypump_${user.id}_station_profile`) || localStorage.getItem('station_profile');
      if (s) {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === 'object') savedLocal = parsed;
      }
    } catch (e) {}

    return {
      id: user.id,
      email: user.email,
      fuelStationName: savedLocal?.fuelStationName || meta.fuelStationName || meta.station_name || '',
      ownerName: savedLocal?.ownerName || meta.ownerName || meta.owner_name || '',
      managerName: savedLocal?.managerName || meta.managerName || '',
      mobile: savedLocal?.phone || savedLocal?.mobile || meta.mobile || '',
      gstin: savedLocal?.gstin || meta.gstin || '',
      address: savedLocal?.address || meta.address || '',
      openingShreeSilak: savedLocal?.openingShreeSilak !== undefined ? parseFloat(savedLocal.openingShreeSilak) : (parseFloat(meta.openingShreeSilak) || 0),
      isOnboarded: savedLocal?.isOnboarded !== undefined ? savedLocal.isOnboarded : (meta.isOnboarded !== undefined ? meta.isOnboarded : false),
      createdAt: user.created_at
    };
  };

  // Keep mypump_current_user synced in localStorage safely without overwriting station_profile
  useEffect(() => {
    if (currentUser?.id) {
      try {
        localStorage.setItem('mypump_current_user', JSON.stringify({
          id: currentUser.id,
          email: currentUser.email,
          fuelStationName: currentUser.fuelStationName,
          ownerName: currentUser.ownerName
        }));
      } catch (e) {}
    }
  }, [currentUser]);

  // Initial session restoration and real-time auth state listener
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('[AuthContext] Error restoring session:', error.message);
        }

        if (mounted) {
          if (initialSession?.user) {
            setSession(initialSession);
            setCurrentUser(mapSupabaseUser(initialSession.user));
            setIsAuthenticated(true);
            setAuthModalMode(null);
          } else {
            setSession(null);
            setCurrentUser(null);
            setIsAuthenticated(false);
            setAuthModalMode('login'); // Mandatory login overlay when logged out
          }
        }
      } catch (err) {
        console.error('[AuthContext] Session init error:', err);
        if (mounted) {
          setIsAuthenticated(false);
          setAuthModalMode('login');
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      if (newSession?.user) {
        setSession(newSession);
        setCurrentUser(mapSupabaseUser(newSession.user));
        setIsAuthenticated(true);
        setAuthModalMode(null);
      } else {
        setSession(null);
        setCurrentUser(null);
        setIsAuthenticated(false);
        setAuthModalMode('login');
      }
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  /**
   * Enterprise Supabase Sign In with Email and Password
   */
  const login = async (email, password) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      console.log('[AuthContext] Initiating Supabase signInWithPassword for:', cleanEmail);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password.trim()
      });

      console.log('[AuthContext] Supabase signInWithPassword response:', {
        userId: data?.user?.id,
        hasSession: Boolean(data?.session),
        error: error?.message
      });

      if (error) {
        throw error;
      }

      if (data?.user) {
        const mapped = mapSupabaseUser(data.user);
        setCurrentUser(mapped);
        setSession(data.session);
        setIsAuthenticated(true);
        setAuthModalMode(null);
        return { user: mapped, session: data.session, error: null };
      }
      return { user: null, error: new Error('No user returned by authentication provider') };
    } catch (err) {
      console.error('[AuthContext] Login error caught:', err);
      return { user: null, error: err };
    }
  };

  /**
   * Enterprise Supabase Sign Up with Petrol Pump Profile Metadata
   */
  const signup = async (formData) => {
    try {
      const cleanEmail = formData.email?.trim().toLowerCase();
      const password = formData.password?.trim();
      console.log('[AuthContext] Initiating Supabase signUp for:', cleanEmail);

      const userMetadata = {
        fuelStationName: formData.fuelStationName?.trim() || 'SHITAL PETROL PUMP',
        ownerName: formData.ownerName?.trim() || 'Station Owner',
        managerName: formData.managerName?.trim() || 'Shift Manager',
        mobile: formData.mobile?.trim() || '',
        gstin: formData.gstin?.trim() || '',
        address: formData.address?.trim() || '',
        openingShreeSilak: parseFloat(formData.openingShreeSilak) || 0
      };

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: userMetadata
        }
      });

      console.log('[AuthContext] Supabase signUp response:', {
        userId: data?.user?.id,
        hasSession: Boolean(data?.session),
        identities: data?.user?.identities?.length,
        error: error?.message
      });

      if (error) {
        throw error;
      }

      if (data?.user) {
        const mapped = mapSupabaseUser(data.user);
        if (data.session) {
          setCurrentUser(mapped);
          setSession(data.session);
          setIsAuthenticated(true);
          setAuthModalMode(null);
        }
        return { user: mapped, session: data.session, error: null };
      }
      return { user: null, error: new Error('User creation failed') };
    } catch (err) {
      console.error('[AuthContext] Signup error caught:', err);
      return { user: null, error: err };
    }
  };

  /**
   * Enterprise Supabase Sign Out
   */
  const logout = async () => {
    setAuthLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[AuthContext] SignOut warning:', err);
    } finally {
      setCurrentUser(null);
      setSession(null);
      setIsAuthenticated(false);
      setAuthModalMode('login');
      setAuthLoading(false);
    }
  };

  /**
   * Enterprise Supabase Password Reset
   */
  const resetPassword = async (email) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const { data, error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl
      });
      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      console.error('[AuthContext] ResetPassword error:', err);
      return { data: null, error: err };
    }
  };

  const openAuthModal = (mode = 'login') => {
    setAuthModalMode(mode);
  };

  const closeAuthModal = () => {
    // Only allow closing if already authenticated
    if (isAuthenticated) {
      setAuthModalMode(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        session,
        isAuthenticated,
        setIsAuthenticated,
        authLoading,
        authModalMode,
        setAuthModalMode,
        login,
        signIn: login,
        signup,
        logout,
        signOut: logout,
        resetPassword,
        openAuthModal,
        closeAuthModal
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
