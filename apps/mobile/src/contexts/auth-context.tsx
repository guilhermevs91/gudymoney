import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setTokens, clearTokens, getAccessToken } from '@/lib/api';

interface AuthUser {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
}

interface AuthLoginData {
  user: { id: string; name: string; email: string };
  tenant: { id: string };
  member?: { role: 'ADMIN' | 'MEMBER' };
  access_token: string;
  refresh_token: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (token) {
        try {
          const payload = JSON.parse(
            Buffer.from(token.split('.')[1]!, 'base64').toString(),
          );
          setUser({
            userId: payload.userId,
            tenantId: payload.tenantId,
            name: payload.name ?? '',
            email: payload.email ?? '',
            role: payload.role,
          });
        } catch {
          await clearTokens();
        }
      }
      setLoading(false);
    })();
  }, []);

  const hydrateUser = async (data: AuthLoginData) => {
    await setTokens(data.access_token, data.refresh_token);
    setUser({
      userId: data.user.id,
      tenantId: data.tenant.id,
      name: data.user.name,
      email: data.user.email,
      role: data.member?.role ?? 'ADMIN',
    });
  };

  const login = async (email: string, password: string) => {
    const res = await api.post<{ data: AuthLoginData }>('/auth/login', { email, password });
    await hydrateUser(res.data);
  };

  const googleLogin = async (idToken: string) => {
    const res = await api.post<{ data: AuthLoginData }>('/auth/google/verify', {
      id_token: idToken,
    });
    await hydrateUser(res.data);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch { /* best effort */ }
    await clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
