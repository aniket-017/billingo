import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import Input from '@/src/components/Input';
import Screen from '@/src/components/Screen';
import StatCard from '@/src/components/StatCard';
import Toast from '@/src/components/Toast';
import { useAuth } from '@/src/contexts/AuthContext';
import { useBusinessSettings } from '@/src/contexts/BusinessSettingsContext';
import { colors, font, radius, shadows, spacing } from '@/src/theme';
import { formatCurrency, todayIsoDate } from '@/src/utils/format';

type MenuItem = { icon: string; label: string; onPress: () => void; color?: string };

export default function MoreScreen() {
  const { logout } = useAuth();
  const { settings, update } = useBusinessSettings();
  const [todayRevenue, setTodayRevenue] = useState('—');
  const [todayCount, setTodayCount] = useState('—');
  const [todayProfit, setTodayProfit] = useState('—');

  const [form, setForm] = useState(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const loadTodayStats = useCallback(async () => {
    try {
      const today = todayIsoDate();
      const data = await api.reports.sales(today, today);
      setTodayRevenue(formatCurrency(data.summary.revenue));
      setTodayCount(String(data.summary.count));
      setTodayProfit(formatCurrency(data.summary.profit));
    } catch {
      setTodayRevenue('—');
      setTodayCount('—');
      setTodayProfit('—');
    }
  }, []);

  useEffect(() => {
    loadTodayStats();
  }, [loadTodayStats]);

  async function handleSaveSettings() {
    setSettingsLoading(true);
    try {
      await update(form);
      setToast({ message: 'Settings saved', type: 'success' });
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Save failed', type: 'error' });
    } finally {
      setSettingsLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  const menuItems: MenuItem[] = [
    { icon: 'bar-chart-outline', label: 'Reports', onPress: () => router.push('/reports') },
    { icon: 'settings-outline', label: 'Business Settings', onPress: () => setSettingsOpen(!settingsOpen) },
  ];

  return (
    <Screen onRefresh={loadTodayStats}>
      <Text style={st.title}>More</Text>

      {/* Today's Quick Stats */}
      <Text style={st.secLabel}>Today's Sales</Text>
      <View style={st.statsRow}>
        <StatCard label="Revenue" value={todayRevenue} subtitle={`${todayCount} invoices`} />
        <StatCard label="Profit" value={todayProfit} accent={colors.success} />
      </View>

      {/* Menu */}
      <Text style={st.secLabel}>Menu</Text>
      <Card style={st.menuCard}>
        {menuItems.map((item, i) => (
          <Pressable key={item.label} onPress={item.onPress} style={[st.menuRow, i < menuItems.length - 1 && st.menuRowBorder]}>
            <View style={[st.menuIconWrap, item.color ? { backgroundColor: item.color + '15' } : undefined]}>
              <Ionicons name={item.icon as any} size={20} color={item.color ?? colors.primary[600]} />
            </View>
            <Text style={st.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.surface[300]} />
          </Pressable>
        ))}
      </Card>

      {/* Business Settings (collapsible) */}
      {settingsOpen ? (
        <Card style={st.settingsCard}>
          <Input label="Business name" value={form.businessName} onChangeText={(v) => setForm((f) => ({ ...f, businessName: v }))} />
          <Input label="Phone" value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" />
          <Input label="Email" value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} keyboardType="email-address" autoCapitalize="none" />
          <Input label="Address" value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} />
          <Input label="Tax ID" value={form.taxId} onChangeText={(v) => setForm((f) => ({ ...f, taxId: v }))} />
          <Button title="Save settings" onPress={handleSaveSettings} loading={settingsLoading} />
        </Card>
      ) : null}

      <View style={st.logoutWrap}>
        <Button title="Sign out" variant="danger" onPress={handleLogout} />
      </View>

      {toast ? <Toast visible={!!toast} message={toast.message} type={toast.type} onHide={() => setToast(null)} /> : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  title: { fontFamily: font.bold, fontSize: 26, color: colors.text, marginBottom: spacing.md },
  secLabel: { fontFamily: font.semiBold, fontSize: 16, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.sm },

  menuCard: { padding: 0, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: spacing.md },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuLabel: { flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.text },

  settingsCard: { marginTop: spacing.sm },
  logoutWrap: { marginTop: spacing.lg, marginBottom: spacing.xl },
});
