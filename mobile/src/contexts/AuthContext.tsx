import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getStoredToken, setStoredToken } from '../api/client';

export type UserRole = 'user' | 'business_admin' | 'platform_admin';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  businessId?: string | null;
  businessName?: string;
} | null;

interface AuthContextValue {
  user: User;
  token: string | null;
  loading: boolean;
  login: (token: string, user: NonNullable<User>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const login = useCallback(async (newToken: string, newUser: NonNullable<User>) => {
    await setStoredToken(newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    await setStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const stored = await getStoredToken();
      if (cancelled) return;

      if (!stored) {
        setToken(null);
        setUser(null);
        setLoading(false);
        return;
      }

      setToken(stored);
      try {
        const data = await api.auth.me();
        if (cancelled) return;
        setUser({
          id: data.id,
          email: data.email,
          name: data.name || '',
          role: data.role as UserRole,
          businessId: data.businessId,
          businessName: data.businessName,
        });
      } catch {
        if (cancelled) return;
        await setStoredToken(null);
        setToken(null);
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
