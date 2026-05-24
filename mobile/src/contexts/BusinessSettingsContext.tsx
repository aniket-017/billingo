import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type BusinessSettings } from '../api/client';
import { useAuth } from './AuthContext';

type BusinessSettingsContextValue = {
  settings: BusinessSettings;
  loading: boolean;
  refresh: () => Promise<void>;
  update: (body: Partial<BusinessSettings>) => Promise<BusinessSettings>;
};

const defaultSettings: BusinessSettings = {
  businessName: '',
  address: '',
  phone: '',
  email: '',
  taxId: '',
};

const BusinessSettingsContext = createContext<BusinessSettingsContextValue | null>(null);

export function BusinessSettingsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) {
      setSettings(defaultSettings);
      setLoading(false);
      return;
    }
    try {
      const data = await api.settings.get();
      setSettings(data);
    } catch {
      setSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback(async (body: Partial<BusinessSettings>) => {
    const data = await api.settings.update(body);
    setSettings(data);
    return data;
  }, []);

  return (
    <BusinessSettingsContext.Provider value={{ settings, loading, refresh, update }}>
      {children}
    </BusinessSettingsContext.Provider>
  );
}

export function useBusinessSettings() {
  const ctx = useContext(BusinessSettingsContext);
  if (!ctx) throw new Error('useBusinessSettings must be used within BusinessSettingsProvider');
  return ctx;
}

export function useBusinessDisplayName() {
  const { settings, loading } = useBusinessSettings();
  const name = settings.businessName.trim();
  return { displayName: name || 'Your Business', hasName: Boolean(name), loading };
}
