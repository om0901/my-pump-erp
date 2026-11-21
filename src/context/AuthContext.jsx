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

  // Helper to construct a clean user profile from Supabase User & Metadata
  const mapSupabaseUser = (user) => {
    if (!user) return null;
    const meta = user.user_metadata || {};
    return {
      id: user.id,
      email: user.email,
      fuelStationName: meta.fuelStationName || 'SHITAL PETROL PUMP',
      ownerName: meta.ownerName || 'Station Owner',
      managerName: meta.managerName || 'Shift Manager',
      mobile: meta.mobile || '',
      gstin: meta.gstin || '',
      address: meta.address || '',
      openingShreeSilak: parseFloat(meta.openingShreeSilak) || 0,
      createdAt: user.created_at
    };
  };

  // Sync station profile with localStorage whenever currentUser changes
  useEffect(() => {
    if (currentUser) {
      const stationProf = {
        fuelStationName: currentUser.fuelStationName,
        gstin: currentUser.gstin,
        address: currentUser.address,
        phone: currentUser.mobile,
        email: currentUser.email,
        ownerName: currentUser.ownerName,
        managerName: currentUser.managerName,
        openingShreeSilak: currentUser.openingShreeSilak
      };
      localStorage.setItem('station_profile', JSON.stringify(stationProf));
      localStorage.setItem(`mypump_${currentUser.id}_station_profile`, JSON.stringify(stationProf));
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
    setAuthLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password.trim()
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
        return { user: mapped, error: null };
      }
      return { user: null, error: new Error('No user returned') };
    } catch (err) {
      console.error('[AuthContext] Login error:', err);
      return { user: null, error: err };
    } finally {
      setAuthLoading(false);
    }
  };

  /**
   * Enterprise Supabase Sign Up with Petrol Pump Profile Metadata
   */
  const signup = async (formData) => {
    setAuthLoading(true);
    try {
      const cleanEmail = formData.email?.trim().toLowerCase();
      const password = formData.password?.trim();

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
      return { user: null, error: new Error('User creation failed') };
    } catch (err) {
      console.error('[AuthContext] Signup error:', err);
      return { user: null, error: err };
    } finally {
      setAuthLoading(false);
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
