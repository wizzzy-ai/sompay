import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import api, { setAccessToken, clearAccessToken } from './api/axios';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await api.get('/auth/me');
        setUser(response.data.user);
      } catch (error) {
        setUser(null);
        sessionStorage.removeItem('token'); // Clear invalid token
        clearAccessToken();
      } finally {
        setLoading(false);
      }
    };

    const token = sessionStorage.getItem('token');
    if (token) {
      setAccessToken(token);
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback((token, userData) => {
    sessionStorage.setItem('token', token);
    setAccessToken(token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    sessionStorage.removeItem('token');
    clearAccessToken();
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data.user);
      return response.data.user;
    } catch (error) {
      setUser(null);
      sessionStorage.removeItem('token');
      clearAccessToken();
      throw error;
    }
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    refreshUser,
  }), [user, loading, login, logout, refreshUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
