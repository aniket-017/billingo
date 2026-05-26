import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import Input from '@/src/components/Input';
import Screen from '@/src/components/Screen';
import Toast from '@/src/components/Toast';
import { useAuth } from '@/src/contexts/AuthContext';
import { useBusinessSettings } from '@/src/contexts/BusinessSettingsContext';
import { colors, font, radius, shadows, spacing } from '@/src/theme';
import { formatCurrency, todayIsoDate } from '@/src/utils/format';

type MenuItem = { icon: string; label: string; onPress: () => void; color?: string };

type Stats = { revenue: number; profit: number; count: number };
const EMPTY: Stats = { revenue: 0, profit: 0, count: 0 };

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function MoreScreen() {
  const { logout } = useAuth();
  const { settings, update } = useBusinessSettings();
  const [today, setToday] = useState<Stats>(EMPTY);
  const [month, setMonth] = useState<Stats>(EMPTY);

  const [form, setForm] = useState(settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const loadStats = useCallback(async () => {
    const todayStr = todayIsoDate();
    const monthStart = monthStartIso();
    try {
      const [todayData, monthData] = await Promise.all([
        api.reports.sales(todayStr, todayStr),
        api.reports.sales(monthStart, todayStr),
      ]);
      setToday({ revenue: todayData.summary.revenue, profit: todayData.summary.profit, count: todayData.summary.count });
      setMonth({ revenue: monthData.summary.revenue, profit: monthData.summary.profit, count: monthData.summary.count });
    } catch {
      setToday(EMPTY);
      setMonth(EMPTY);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

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
    { icon: 'bar-chart-outline', label: 'Reports', onPress: () => router.push('/reports'), color: '#8b5cf6' },
    { icon: 'settings-outline', label: 'Business Settings', onPress: () => setSettingsOpen(!settingsOpen) },
  ];

  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });

  return (
    <Screen onRefresh={loadStats}>
      <Text style={st.title}>Dashboard</Text>

      {/* Today */}
      <View style={st.statsCard}>
        <View style={st.statsHeader}>
          <Ionicons name="today-outline" size={16} color={colors.primary[600]} />
          <Text style={st.statsLabel}>Today</Text>
        </View>
        <View style={st.statsGrid}>
          <View style={st.statItem}>
            <Text style={st.statValue}>{formatCurrency(today.revenue)}</Text>
            <Text style={st.statDesc}>Revenue</Text>
          </View>
          <View style={[st.statDivider]} />
          <View style={st.statItem}>
            <Text style={[st.statValue, { color: today.profit >= 0 ? colors.success : colors.danger }]}>
              {formatCurrency(today.profit)}
            </Text>
            <Text style={st.statDesc}>Profit</Text>
          </View>
          <View style={[st.statDivider]} />
          <View style={st.statItem}>
            <Text style={st.statValue}>{today.count}</Text>
            <Text style={st.statDesc}>Sales</Text>
          </View>
        </View>
      </View>

      {/* This Month */}
      <View style={[st.statsCard, { borderLeftColor: '#8b5cf6' }]}>
        <View style={st.statsHeader}>
          <Ionicons name="calendar-outline" size={16} color="#8b5cf6" />
          <Text style={st.statsLabel}>{monthName}</Text>
        </View>
        <View style={st.statsGrid}>
          <View style={st.statItem}>
            <Text style={st.statValue}>{formatCurrency(month.revenue)}</Text>
            <Text style={st.statDesc}>Revenue</Text>
          </View>
          <View style={[st.statDivider]} />
          <View style={st.statItem}>
            <Text style={[st.statValue, { color: month.profit >= 0 ? colors.success : colors.danger }]}>
              {formatCurrency(month.profit)}
            </Text>
            <Text style={st.statDesc}>Profit</Text>
          </View>
          <View style={[st.statDivider]} />
          <View style={st.statItem}>
            <Text style={st.statValue}>{month.count}</Text>
            <Text style={st.statDesc}>Sales</Text>
          </View>
        </View>
      </View>

      {/* Menu */}
      <Text style={st.secLabel}>Menu</Text>
      <Card style={st.menuCard}>
        {menuItems.map((item, i) => (
          <Pressable key={item.label} onPress={item.onPress} style={[st.menuRow, i < menuItems.length - 1 && st.menuRowBorder]}>
            <View style={[st.menuIconWrap, { backgroundColor: (item.color ?? colors.primary[600]) + '15' }]}>
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

  // Stats card
  statsCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary[600],
    ...shadows.card,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  statsLabel: {
    fontFamily: font.semiBold,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: font.bold,
    fontSize: 18,
    color: colors.text,
    marginBottom: 2,
  },
  statDesc: {
    fontFamily: font.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },

  // Menu
  menuCard: { padding: 0, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: spacing.md },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuLabel: { flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.text },

  settingsCard: { marginTop: spacing.sm },
  logoutWrap: { marginTop: spacing.lg, marginBottom: spacing.xl },
});
