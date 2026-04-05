'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setTokens, clearTokens, getAccessToken } from '@/lib/api';
import type { AuthUser } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface AuthLoginResponse {
  data: {
    user: { id: string; name: string; email: string };
    tenant: { id: string; name: string };
    access_token: string;
    refresh_token: string;
    member: { role: 'ADMIN' | 'MEMBER' };
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check if we have a stored token and decode the user
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    // Decode without verification — just to get the payload
    try {
      const payload = JSON.parse(atob(token.split('.')[1]!));
      setUser({
        userId: payload.userId as string,
        tenantId: payload.tenantId as string,
        name: payload.name as string ?? '',
        email: payload.email as string ?? '',
        role: payload.role as 'ADMIN' | 'MEMBER',
      });
    } catch {
      clearTokens();
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<AuthLoginResponse>('/auth/login', { email, password });
    const { data } = res as { data: AuthLoginResponse['data'] };
    setTokens(data.access_token, data.refresh_token);
    setUser({
      userId: data.user.id,
      tenantId: data.tenant.id,
      name: data.user.name,
      email: data.user.email,
      role: data.member.role,
    });
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await api.post<AuthLoginResponse>('/auth/register', { name, email, password });
    const { data } = res as { data: AuthLoginResponse['data'] };
    setTokens(data.access_token, data.refresh_token);
    setUser({
      userId: data.user.id,
      tenantId: data.tenant.id,
      name: data.user.name,
      email: data.user.email,
      role: data.member.role,
    });
  };

  const googleLogin = async (idToken: string) => {
    const res = await api.post<AuthLoginResponse>('/auth/google/verify', { id_token: idToken });
    const { data } = res as { data: AuthLoginResponse['data'] };
    setTokens(data.access_token, data.refresh_token);
    setUser({
      userId: data.user.id,
      tenantId: data.tenant.id,
      name: data.user.name,
      email: data.user.email,
      role: data.member?.role ?? 'ADMIN',
    });
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // best effort
    }
    clearTokens();
    setUser(null);
    window.location.href = '/login';
  };

  const refreshUser = async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]!));
      setUser((prev) =>
        prev ? { ...prev, role: payload.role as 'ADMIN' | 'MEMBER' } : null,
      );
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, googleLogin, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
