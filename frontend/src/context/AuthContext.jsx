import { useState, useEffect, useCallback } from 'react';
import { login as loginApi, signup as signupApi, logout as logoutApi } from '../api/authApi';
import { parseJwt } from '../utils/jwt';
import { AuthContext } from './authContextInstance';

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('accessToken'));
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem('refreshToken'));
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;
    const payload = parseJwt(token);
    return payload ? { userId: payload.sub, exp: payload.exp } : null;
  });
  const [loading, setLoading] = useState(false);

  // Sync state if localStorage or tokens change
  const handleTokenUpdate = useCallback((newAccessToken, newRefreshToken) => {
    if (newAccessToken) {
      localStorage.setItem('accessToken', newAccessToken);
      setAccessToken(newAccessToken);
      const payload = parseJwt(newAccessToken);
      if (payload) {
        setUser({ userId: payload.sub, exp: payload.exp });
      }
    }
    if (newRefreshToken) {
      localStorage.setItem('refreshToken', newRefreshToken);
      setRefreshToken(newRefreshToken);
    }
  }, []);

  const handleClearAuth = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  }, []);

  // Listen to axios interceptor events
  useEffect(() => {
    const onLogoutEvent = () => {
      handleClearAuth();
    };

    const onTokenRefreshed = (e) => {
      const { accessToken: nextAccess, refreshToken: nextRefresh } = e.detail || {};
      handleTokenUpdate(nextAccess, nextRefresh);
    };

    window.addEventListener('auth:logout', onLogoutEvent);
    window.addEventListener('auth:token-refreshed', onTokenRefreshed);

    return () => {
      window.removeEventListener('auth:logout', onLogoutEvent);
      window.removeEventListener('auth:token-refreshed', onTokenRefreshed);
    };
  }, [handleClearAuth, handleTokenUpdate]);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const response = await loginApi(email, password);
      const { accessToken: newAccess, refreshToken: newRefresh } = response.data;
      handleTokenUpdate(newAccess, newRefresh);
      return response.data;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (email, password) => {
    setLoading(true);
    try {
      const response = await signupApi(email, password);
      return response.data;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    const currentRefreshToken = refreshToken || localStorage.getItem('refreshToken');
    try {
      if (currentRefreshToken) {
        await logoutApi(currentRefreshToken);
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      handleClearAuth();
    }
  };

  const value = {
    user,
    accessToken,
    refreshToken,
    isAuthenticated: Boolean(accessToken && user?.userId),
    loading,
    login,
    signup,
    logout,
    handleTokenUpdate,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
