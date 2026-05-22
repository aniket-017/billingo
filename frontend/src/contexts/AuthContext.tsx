import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const TOKEN_KEY = 'auth_token';

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
  login: (token: string, user: NonNullable<User>) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUserState] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((u: User) => setUserState(u), []);

  const login = useCallback((newToken: string, newUser: NonNullable<User>) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUserState(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUserState(null);
  }, []);

  useEffect(() => {
    if (!token) {
      setUserState(null);
      setLoading(false);
      return;
    }
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Invalid session');
        return res.json();
      })
      .then((data) =>
        setUserState({
          id: data.id,
          email: data.email,
          name: data.name || '',
          role: data.role as UserRole,
          businessId: data.businessId,
          businessName: data.businessName,
        })
      )
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUserState(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const value: AuthContextValue = {
    user,
    token,
    loading,
    login,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
