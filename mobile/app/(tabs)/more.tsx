import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api, type Product } from '@/src/api/client';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import Input from '@/src/components/Input';
import Screen from '@/src/components/Screen';
import StatCard from '@/src/components/StatCard';
import Toast from '@/src/components/Toast';
import { useAuth } from '@/src/contexts/AuthContext';
import { useBusinessSettings } from '@/src/contexts/BusinessSettingsContext';
import { colors, font, spacing } from '@/src/theme';
import { formatCurrency, todayIsoDate } from '@/src/utils/format';

export default function MoreScreen() {
  const { logout } = useAuth();
  const { settings, update } = useBusinessSettings();
  const [todayRevenue, setTodayRevenue] = useState('—');
  const [todayCount, setTodayCount] = useState('—');
  const [todayProfit, setTodayProfit] = useState('—');

  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockQty, setStockQty] = useState('');
  const [stockNotes, setStockNotes] = useState('');
  const [stockLoading, setStockLoading] = useState(false);

  const [form, setForm] = useState(settings);
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

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!productQuery.trim()) {
        setProducts([]);
        return;
      }
      try {
        const list = await api.products.list(productQuery);
        setProducts(list.slice(0, 8));
      } catch {
        setProducts([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [productQuery]);

  async function handleStockIn() {
    if (!selectedProduct) {
      setToast({ message: 'Select a product', type: 'error' });
      return;
    }
    const qty = Number(stockQty);
    if (!qty || qty <= 0) {
      setToast({ message: 'Enter a valid quantity', type: 'error' });
      return;
    }
    setStockLoading(true);
    try {
      await api.inventory.stockIn({
        productId: selectedProduct.id,
        quantity: qty,
        notes: stockNotes.trim(),
        referenceLabel: 'Mobile stock receive',
      });
      setStockQty('');
      setStockNotes('');
      setSelectedProduct(null);
      setProductQuery('');
      setProducts([]);
      setToast({ message: 'Stock received', type: 'success' });
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Stock receive failed', type: 'error' });
    } finally {
      setStockLoading(false);
    }
  }

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

  return (
    <Screen onRefresh={loadTodayStats}>
      <Text style={styles.title}>More</Text>

      <Text style={styles.sectionTitle}>Today's sales</Text>
      <View style={styles.statsRow}>
        <StatCard label="Revenue" value={todayRevenue} subtitle={`${todayCount} invoices`} />
        <StatCard label="Profit" value={todayProfit} accent={colors.success} />
      </View>

      <Text style={styles.sectionTitle}>Stock receive</Text>
      <Card>
        <Input
          label="Find product"
          value={productQuery}
          onChangeText={setProductQuery}
          placeholder="Search by name or barcode"
        />
        {products.map((p) => (
          <Button
            key={p.id}
            title={`${p.name} (${p.quantityOnHand ?? 0} in stock)`}
            variant={selectedProduct?.id === p.id ? 'primary' : 'secondary'}
            onPress={() => setSelectedProduct(p)}
            style={styles.productPick}
          />
        ))}
        {selectedProduct ? (
          <Text style={styles.selectedLabel}>Selected: {selectedProduct.name}</Text>
        ) : null}
        <Input
          label="Quantity to add"
          value={stockQty}
          onChangeText={setStockQty}
          keyboardType="numeric"
          placeholder="e.g. 10"
        />
        <Input
          label="Notes (optional)"
          value={stockNotes}
          onChangeText={setStockNotes}
          placeholder="Supplier, batch, etc."
        />
        <Button title="Receive stock" onPress={handleStockIn} loading={stockLoading} />
      </Card>

      <Text style={styles.sectionTitle}>Business settings</Text>
      <Card>
        <Input
          label="Business name"
          value={form.businessName}
          onChangeText={(v) => setForm((f) => ({ ...f, businessName: v }))}
        />
        <Input
          label="Phone"
          value={form.phone}
          onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
          keyboardType="phone-pad"
        />
        <Input
          label="Email"
          value={form.email}
          onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Input
          label="Address"
          value={form.address}
          onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
        />
        <Input
          label="Tax ID"
          value={form.taxId}
          onChangeText={(v) => setForm((f) => ({ ...f, taxId: v }))}
        />
        <Button title="Save settings" onPress={handleSaveSettings} loading={settingsLoading} />
      </Card>

      <View style={styles.logoutWrap}>
        <Button title="Sign out" variant="danger" onPress={handleLogout} />
      </View>

      {toast ? (
        <Toast visible={!!toast} message={toast.message} type={toast.type} onHide={() => setToast(null)} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: font.bold,
    fontSize: 26,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: font.semiBold,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  productPick: {
    marginBottom: spacing.sm,
  },
  selectedLabel: {
    fontFamily: font.medium,
    fontSize: 14,
    color: colors.primary[700],
    marginBottom: spacing.sm,
  },
  logoutWrap: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
});
