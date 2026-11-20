import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const DEFAULT_USER_PROFILE = {
  id: 'usr_demo_1',
  email: 'info@shitalpetroleum.com',
  mobile: '+91 98790 12345',
  fuelStationName: 'SHITAL PETROL PUMP',
  gstin: '24AAAAA0000A1Z5',
  address: 'State Highway, Kheralu, Mehsana, Gujarat 384325',
  ownerName: 'Owner',
  managerName: 'Shift Manager',
  openingShreeSilak: 50000
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('mypump_current_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_USER_PROFILE, ...parsed };
        }
      }
    } catch (e) {}
    return DEFAULT_USER_PROFILE;
  });

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const saved = localStorage.getItem('mypump_authenticated');
    return saved !== null ? saved === 'true' : true; // Default logged in so software opens seamlessly
  });

  // authModalMode: null | 'login' | 'signup'
  const [authModalMode, setAuthModalMode] = useState(null);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('mypump_current_user', JSON.stringify(currentUser));
      // Keep station profile synced in localStorage
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
    }
  }, [currentUser]);

  const login = (emailOrMobile, password) => {
    // Authenticate user & hydrate profile
    const existing = currentUser || DEFAULT_USER_PROFILE;
    const updatedUser = {
      ...existing,
      email: emailOrMobile.includes('@') ? emailOrMobile : existing.email,
      mobile: !emailOrMobile.includes('@') ? emailOrMobile : existing.mobile,
    };
    setCurrentUser(updatedUser);
    setIsAuthenticated(true);
    localStorage.setItem('mypump_authenticated', 'true');
    setAuthModalMode(null);
    return updatedUser;
  };

  const signup = (formData) => {
    const newUser = {
      id: `usr_${Date.now()}`,
      email: formData.email || 'pump@station.com',
      mobile: formData.mobile || '+91 98765 43210',
      fuelStationName: formData.fuelStationName?.trim() || 'SHITAL PETROL PUMP',
      gstin: formData.gstin?.trim() || '24AAAAA0000A1Z5',
      address: formData.address?.trim() || 'State Highway, Kheralu',
      ownerName: formData.ownerName?.trim() || 'Station Owner',
      managerName: formData.managerName?.trim() || 'Shift Manager',
      openingShreeSilak: parseFloat(formData.openingShreeSilak) || 0
    };

    setCurrentUser(newUser);
    setIsAuthenticated(true);
    localStorage.setItem('mypump_authenticated', 'true');
    setAuthModalMode(null);
    return newUser;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.setItem('mypump_authenticated', 'false');
    setAuthModalMode('login');
  };

  const openAuthModal = (mode = 'login') => {
    setAuthModalMode(mode);
  };

  const closeAuthModal = () => {
    setAuthModalMode(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        isAuthenticated,
        setIsAuthenticated,
        authModalMode,
        setAuthModalMode,
        login,
        signup,
        logout,
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
    return {
      currentUser: DEFAULT_USER_PROFILE,
      isAuthenticated: true,
      authModalMode: null,
      login: () => {},
      signup: () => {},
      logout: () => {},
      openAuthModal: () => {},
      closeAuthModal: () => {}
    };
  }
  return context;
}
