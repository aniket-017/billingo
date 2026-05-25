import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { api, type Customer, type Product } from '@/src/api/client';
import AddCustomerSheet from '@/src/components/AddCustomerSheet';
import AddProductSheet from '@/src/components/AddProductSheet';
import BarcodeScanner from '@/src/components/BarcodeScanner';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import CartSheet, { type CartItem } from '@/src/components/CartSheet';
import Input from '@/src/components/Input';
import Screen from '@/src/components/Screen';
import StatCard from '@/src/components/StatCard';
import Toast from '@/src/components/Toast';
import { useBusinessDisplayName } from '@/src/contexts/BusinessSettingsContext';
import { colors, font, spacing } from '@/src/theme';
import { formatCurrency, todayIsoDate } from '@/src/utils/format';

export default function SaleScreen() {
  const { displayName } = useBusinessDisplayName();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addCustomerPrefill, setAddCustomerPrefill] = useState('');
  const [todayRevenue, setTodayRevenue] = useState('');
  const [todayCount, setTodayCount] = useState('');
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductBarcode, setAddProductBarcode] = useState('');

  const total = useMemo(() => cart.reduce((s, i) => s + i.amount, 0), [cart]);

  const loadTodayStats = useCallback(async () => {
    try {
      const today = todayIsoDate();
      const data = await api.reports.sales(today, today);
      setTodayRevenue(formatCurrency(data.summary.revenue));
      setTodayCount(String(data.summary.count));
    } catch {
      setTodayRevenue('—');
      setTodayCount('—');
    }
  }, []);

  useEffect(() => {
    loadTodayStats();
    api.customers.list().then(setCustomers).catch(() => setCustomers([]));
  }, [loadTodayStats]);

  const addProductToCart = useCallback((product: Product) => {
    const onHand = product.quantityOnHand ?? 0;
    if (onHand <= 0) {
      setToast({ message: `${product.name} saved. Set opening stock to sell it.`, type: 'success' });
      return;
    }
    let blocked = false;
    setCart((prev) => {
      const i = prev.find((x) => x.productId === product.id);
      if (i) {
        if (i.quantity >= onHand) {
          blocked = true;
          return prev;
        }
        const q = i.quantity + 1;
        return prev.map((x) =>
          x.productId === product.id
            ? { ...x, quantity: q, amount: q * x.unitPrice, quantityOnHand: onHand }
            : x
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          barcode: product.barcode,
          quantity: 1,
          unitPrice: product.price,
          amount: product.price,
          quantityOnHand: onHand,
        },
      ];
    });
    if (blocked) {
      setToast({ message: `Only ${onHand} available for ${product.name}`, type: 'error' });
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setToast({ message: `Added ${product.name}`, type: 'success' });
      setCartOpen(true);
    }
  }, []);

  const addByBarcode = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;
    try {
      const product = await api.products.getByBarcode(code);
      const onHand = product.quantityOnHand ?? 0;
      if (onHand <= 0) {
        setToast({ message: `${product.name} is out of stock`, type: 'error' });
        return;
      }
      let blocked = false;
      setCart((prev) => {
        const i = prev.find((x) => x.productId === product.id);
        if (i) {
          if (i.quantity >= onHand) {
            blocked = true;
            return prev;
          }
          const q = i.quantity + 1;
          return prev.map((x) =>
            x.productId === product.id
              ? { ...x, quantity: q, amount: q * x.unitPrice, quantityOnHand: onHand }
              : x
          );
        }
        return [
          ...prev,
          {
            productId: product.id,
            productName: product.name,
            barcode: product.barcode,
            quantity: 1,
            unitPrice: product.price,
            amount: product.price,
            quantityOnHand: onHand,
          },
        ];
      });
      if (blocked) {
        setToast({ message: `Only ${onHand} available for ${product.name}`, type: 'error' });
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setToast({ message: `Added ${product.name}`, type: 'success' });
        setCartOpen(true);
      }
    } catch {
      setAddProductBarcode(code);
      setAddProductOpen(true);
    }
  }, []);

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const q = item.quantity + delta;
          if (q <= 0) return null;
          if (q > item.quantityOnHand) {
            setToast({ message: `Only ${item.quantityOnHand} in stock`, type: 'error' });
            return item;
          }
          return { ...item, quantity: q, amount: q * item.unitPrice };
        })
        .filter(Boolean) as CartItem[]
    );
  }

  function removeItem(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  async function checkout(sendWhatsApp: boolean) {
    if (cart.length === 0) return;
    setLoading(true);
    try {
      const result = await api.invoices.create({
        customerId: customerId || undefined,
        items: cart.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          barcode: i.barcode,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          amount: i.amount,
        })),
        sendWhatsApp,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCart([]);
      setCartOpen(false);
      setCustomerId('');

      if (sendWhatsApp && result.whatsappSend) {
        if (result.whatsappSend.ok) {
          setToast({ message: 'Sale completed & receipt sent on WhatsApp', type: 'success' });
        } else {
          setToast({ message: `Sale completed but WhatsApp failed: ${result.whatsappSend.reason}`, type: 'error' });
        }
      } else {
        setToast({ message: 'Sale completed', type: 'success' });
      }
      loadTodayStats();
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Checkout failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 15);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.email && c.email.toLowerCase().includes(q))
      )
      .slice(0, 15);
  }, [customers, customerSearch]);

  function selectCustomer(id: string) {
    setCustomerId(id);
    if (id) {
      const c = customers.find((x) => x.id === id);
      if (c) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  function onCustomerReady(customer: Customer) {
    setCustomers((prev) => (prev.some((c) => c.id === customer.id) ? prev : [customer, ...prev]));
    setCustomerId(customer.id);
    setCustomerSearch('');
    setToast({ message: `Billing for ${customer.name}`, type: 'success' });
  }

  function openAddCustomer(prefill = '') {
    setAddCustomerPrefill(prefill);
    setAddCustomerOpen(true);
  }

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <Text style={styles.greeting}>{displayName}</Text>
        <Text style={styles.heading}>Quick Sale</Text>
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Today's revenue" value={todayRevenue} subtitle={`${todayCount} invoices`} />
      </View>

      <View style={styles.body}>
        <Card style={styles.scanCard}>
          <Button title="Scan barcode" onPress={() => setScannerOpen(true)} />
          <View style={styles.manualRow}>
            <Input
              value={manualBarcode}
              onChangeText={setManualBarcode}
              placeholder="Or enter barcode manually"
              style={styles.manualInput}
              onSubmitEditing={() => {
                addByBarcode(manualBarcode);
                setManualBarcode('');
              }}
            />
            <Button
              title="Add"
              variant="secondary"
              onPress={() => {
                addByBarcode(manualBarcode);
                setManualBarcode('');
              }}
              style={styles.addBtn}
            />
          </View>
        </Card>

        <Card style={styles.customerCard}>
          <View style={styles.customerHeader}>
            <Text style={styles.sectionTitle}>Customer (optional)</Text>
            <Pressable style={styles.addCustomerBtn} onPress={() => openAddCustomer()}>
              <Ionicons name="person-add-outline" size={18} color={colors.primary[600]} />
              <Text style={styles.addCustomerText}>Add</Text>
            </Pressable>
          </View>

          {selectedCustomer ? (
            <View style={styles.selectedCustomer}>
              <View style={styles.selectedCustomerInfo}>
                <Text style={styles.selectedLabel}>Billing for</Text>
                <Text style={styles.selectedName}>{selectedCustomer.name}</Text>
                {selectedCustomer.phone ? (
                  <Text style={styles.customerMeta}>{selectedCustomer.phone}</Text>
                ) : null}
              </View>
              <Pressable onPress={() => selectCustomer('')} hitSlop={8}>
                <Text style={styles.clearCustomer}>Clear</Text>
              </Pressable>
            </View>
          ) : null}

          <Input
            value={customerSearch}
            onChangeText={setCustomerSearch}
            placeholder="Search name or phone"
            style={styles.customerSearch}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled">
            <Pressable
              style={[styles.chip, !customerId && styles.chipActive]}
              onPress={() => selectCustomer('')}>
              <Text style={[styles.chipText, !customerId && styles.chipTextActive]}>Walk-in</Text>
            </Pressable>
            {filteredCustomers.map((c) => (
              <Pressable
                key={c.id}
                style={[styles.chip, customerId === c.id && styles.chipActive]}
                onPress={() => selectCustomer(c.id)}>
                <Text style={[styles.chipText, customerId === c.id && styles.chipTextActive]}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {customerSearch.trim() && filteredCustomers.length === 0 ? (
            <Pressable
              style={styles.noMatchRow}
              onPress={() => openAddCustomer(customerSearch.trim())}>
              <Ionicons name="add-circle-outline" size={20} color={colors.primary[600]} />
              <Text style={styles.noMatchText}>Add “{customerSearch.trim()}” as new customer</Text>
            </Pressable>
          ) : null}
        </Card>
      </View>

      <Pressable style={styles.cartBar} onPress={() => setCartOpen(true)}>
        <View>
          <Text style={styles.cartLabel}>{cart.length} items in cart</Text>
          <Text style={styles.cartTotal}>{formatCurrency(total)}</Text>
        </View>
        <Text style={styles.cartAction}>View cart →</Text>
      </Pressable>

      <AddCustomerSheet
        visible={addCustomerOpen}
        onClose={() => {
          setAddCustomerOpen(false);
          setAddCustomerPrefill('');
        }}
        onCustomerReady={onCustomerReady}
        customers={customers}
        initialName={addCustomerPrefill}
      />

      <AddProductSheet
        visible={addProductOpen}
        onClose={() => {
          setAddProductOpen(false);
          setAddProductBarcode('');
        }}
        initialBarcode={addProductBarcode}
        fromSale
        lockBarcode
        onSaved={addProductToCart}
      />

      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => {
          addByBarcode(code);
          setScannerOpen(false);
        }}
      />

      <CartSheet
        visible={cartOpen}
        items={cart}
        total={total}
        loading={loading}
        onClose={() => setCartOpen(false)}
        onUpdateQty={updateQty}
        onRemove={removeItem}
        onCheckout={checkout}
        onAddAnother={() => {
          setCartOpen(false);
          setScannerOpen(true);
        }}
        onAddCustomer={() => {
          setCartOpen(false);
          setAddCustomerOpen(true);
        }}
        customerName={selectedCustomer?.name}
      />

      {toast ? (
        <Toast
          visible={!!toast}
          message={toast.message}
          type={toast.type}
          onHide={() => setToast(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  greeting: {
    fontFamily: font.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  heading: {
    fontFamily: font.bold,
    fontSize: 26,
    color: colors.text,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  body: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  scanCard: {
    gap: spacing.md,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  manualInput: {
    flex: 1,
    marginBottom: 0,
  },
  addBtn: {
    minWidth: 72,
    paddingHorizontal: spacing.md,
  },
  customerCard: {
    gap: spacing.sm,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addCustomerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  addCustomerText: {
    fontFamily: font.semiBold,
    fontSize: 14,
    color: colors.primary[600],
  },
  selectedCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    borderRadius: 12,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  selectedCustomerInfo: {
    flex: 1,
  },
  selectedLabel: {
    fontFamily: font.medium,
    fontSize: 11,
    color: colors.primary[600],
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  selectedName: {
    fontFamily: font.semiBold,
    fontSize: 16,
    color: colors.text,
    marginTop: 2,
  },
  clearCustomer: {
    fontFamily: font.semiBold,
    fontSize: 14,
    color: colors.primary[600],
  },
  customerSearch: {
    marginBottom: 0,
  },
  noMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  noMatchText: {
    fontFamily: font.medium,
    fontSize: 14,
    color: colors.primary[600],
    flex: 1,
  },
  sectionTitle: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface[100],
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[500],
  },
  chipText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.primary[700],
  },
  customerMeta: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 16,
  },
  cartLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.primary[100],
  },
  cartTotal: {
    fontFamily: font.bold,
    fontSize: 22,
    color: colors.white,
  },
  cartAction: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.white,
  },
});
