'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { authApi, ApiUser, UserRole, RegisterResult, OtpSentResult } from './api';
import { getAccessToken, getSavedUser, clearSession } from './storage';

interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<ApiUser>;
  register: (name: string, email: string, password: string, role?: UserRole) => Promise<RegisterResult>;
  verifyOtp: (email: string, otp: string) => Promise<ApiUser>;
  resendOtp: (email: string, purpose: 'SIGNUP_VERIFICATION' | 'PASSWORD_RESET') => Promise<OtpSentResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    const savedUser = getSavedUser();
    if (token && savedUser) {
      setUser(savedUser);
      authApi
        .me()
        .then(setUser)
        .catch(() => {
          clearSession();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, role: UserRole = 'CONSUMER') => {
    return authApi.register(name, email, password, role);
  }, []);

  const verifyOtp = useCallback(async (email: string, otp: string) => {
    const data = await authApi.verifyOtp(email, otp);
    setUser(data.user);
    return data.user;
  }, []);

  const resendOtp = useCallback(async (email: string, purpose: 'SIGNUP_VERIFICATION' | 'PASSWORD_RESET') => {
    return authApi.resendOtp(email, purpose);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verifyOtp, resendOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
