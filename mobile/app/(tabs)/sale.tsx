import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { api, type Customer, type Product } from '@/src/api/client';
import AddCustomerSheet from '@/src/components/AddCustomerSheet';
import AddProductSheet from '@/src/components/AddProductSheet';
import BarcodeScanner from '@/src/components/BarcodeScanner';
import CartSheet, { type CartItem } from '@/src/components/CartSheet';
import Screen from '@/src/components/Screen';
import Toast from '@/src/components/Toast';
import { useBusinessDisplayName } from '@/src/contexts/BusinessSettingsContext';
import { colors, font, radius, spacing } from '@/src/theme';
import { formatCurrency } from '@/src/utils/format';

export default function SaleScreen() {
  const { displayName } = useBusinessDisplayName();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addCustomerPrefill, setAddCustomerPrefill] = useState('');

  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addProductBarcode, setAddProductBarcode] = useState('');

  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = useMemo(() => cart.reduce((s, i) => s + i.amount, 0), [cart]);

  useEffect(() => {
    api.customers.list().then(setCustomers).catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = productQuery.trim();
    if (!q || q.length < 2) {
      setProductResults([]);
      setShowProductDropdown(false);
      return;
    }
    setProductSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await api.products.list(q);
        setProductResults(results.slice(0, 10));
        setShowProductDropdown(true);
      } catch {
        setProductResults([]);
      } finally {
        setProductSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [productQuery]);

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

  const handleSelectProduct = useCallback(
    (product: Product) => {
      setProductQuery('');
      setProductResults([]);
      setShowProductDropdown(false);
      Keyboard.dismiss();
      addProductToCart(product);
    },
    [addProductToCart]
  );

  const addByBarcode = useCallback(
    async (barcode: string) => {
      const code = barcode.trim();
      if (!code) return;
      try {
        const product = await api.products.getByBarcode(code);
        addProductToCart(product);
      } catch {
        setAddProductBarcode(code);
        setAddProductOpen(true);
      }
    },
    [addProductToCart]
  );

  const handleBarcodeSubmit = useCallback(() => {
    const code = productQuery.trim();
    if (!code) return;
    addByBarcode(code);
    setProductQuery('');
    setShowProductDropdown(false);
  }, [productQuery, addByBarcode]);

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
          setToast({
            message: `Sale completed but WhatsApp failed: ${result.whatsappSend.reason}`,
            type: 'error',
          });
        }
      } else {
        setToast({ message: 'Sale completed', type: 'success' });
      }
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

  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <Screen scroll={false} padded={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.storeName}>{displayName}</Text>
          <Text style={styles.heading}>Quick Sale</Text>
        </View>
        {cart.length > 0 && (
          <Pressable style={styles.cartBadgeBtn} onPress={() => setCartOpen(true)}>
            <Ionicons name="cart" size={22} color={colors.white} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{cartItemCount}</Text>
            </View>
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* Scan Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="scan-outline" size={18} color={colors.primary[600]} />
            <Text style={styles.sectionTitle}>Add Products</Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
            onPress={() => setScannerOpen(true)}>
            <View style={styles.scanIconWrap}>
              <Ionicons name="barcode-outline" size={24} color={colors.white} />
            </View>
            <View style={styles.scanTextWrap}>
              <Text style={styles.scanButtonTitle}>Scan barcode / QR code</Text>
              <Text style={styles.scanButtonSub}>Use camera to scan product</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary[600]} />
          </Pressable>

          {/* Search input */}
          <View style={styles.searchWrap}>
            <View style={styles.searchInputRow}>
              <View style={styles.searchInputContainer}>
                <Ionicons
                  name="search-outline"
                  size={18}
                  color={colors.textMuted}
                  style={styles.searchIcon}
                />
                <TextInput
                  value={productQuery}
                  onChangeText={setProductQuery}
                  placeholder="Search by name or barcode"
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                  returnKeyType="go"
                  onSubmitEditing={handleBarcodeSubmit}
                  onFocus={() => {
                    if (productResults.length > 0) setShowProductDropdown(true);
                  }}
                />
                {productSearching && (
                  <ActivityIndicator size="small" color={colors.primary[500]} style={styles.searchSpinner} />
                )}
                {productQuery.length > 0 && !productSearching && (
                  <Pressable
                    onPress={() => {
                      setProductQuery('');
                      setShowProductDropdown(false);
                    }}
                    hitSlop={8}
                    style={styles.searchClear}>
                    <Ionicons name="close-circle" size={18} color={colors.surface[300]} />
                  </Pressable>
                )}
              </View>
              <Pressable
                style={({ pressed }) => [styles.addBarcodeBtn, pressed && { opacity: 0.8 }]}
                onPress={handleBarcodeSubmit}>
                <Ionicons name="add" size={22} color={colors.white} />
              </Pressable>
            </View>

            {/* Dropdown results */}
            {showProductDropdown && productResults.length > 0 && (
              <ScrollView
                style={styles.dropdown}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                bounces={false}>
                {productResults.map((product, idx) => {
                  const inCart = cart.find((c) => c.productId === product.id);
                  const stock = product.quantityOnHand ?? 0;
                  return (
                    <Pressable
                      key={product.id}
                      style={({ pressed }) => [
                        styles.dropdownItem,
                        pressed && styles.dropdownItemPressed,
                        idx < productResults.length - 1 && styles.dropdownItemBorder,
                      ]}
                      onPress={() => handleSelectProduct(product)}>
                      <View style={styles.dropdownItemLeft}>
                        <Text style={styles.dropdownItemName} numberOfLines={1}>
                          {product.name}
                        </Text>
                        <Text style={styles.dropdownItemMeta}>
                          {formatCurrency(product.price)}
                          {product.barcode ? `  ·  ${product.barcode}` : ''}
                          {stock > 0 ? `  ·  ${stock} in stock` : ''}
                        </Text>
                      </View>
                      {inCart ? (
                        <View style={styles.inCartBadge}>
                          <Text style={styles.inCartText}>{inCart.quantity}x</Text>
                        </View>
                      ) : (
                        <Ionicons name="add-circle-outline" size={22} color={colors.primary[600]} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {showProductDropdown && productQuery.trim().length >= 2 && productResults.length === 0 && !productSearching && (
              <View style={styles.dropdown}>
                <View style={styles.noResults}>
                  <Ionicons name="search" size={18} color={colors.textMuted} />
                  <Text style={styles.noResultsText}>No products found for "{productQuery.trim()}"</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Customer Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={18} color={colors.primary[600]} />
            <Text style={styles.sectionTitle}>Customer</Text>
            <Text style={styles.optionalTag}>Optional</Text>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.addCustomerBtn} onPress={() => openAddCustomer()}>
              <Ionicons name="person-add-outline" size={16} color={colors.primary[600]} />
              <Text style={styles.addCustomerText}>New</Text>
            </Pressable>
          </View>

          {selectedCustomer ? (
            <View style={styles.selectedCustomer}>
              <View style={styles.selectedAvatar}>
                <Ionicons name="person" size={18} color={colors.primary[600]} />
              </View>
              <View style={styles.selectedCustomerInfo}>
                <Text style={styles.selectedName}>{selectedCustomer.name}</Text>
                {selectedCustomer.phone ? (
                  <Text style={styles.customerMeta}>{selectedCustomer.phone}</Text>
                ) : null}
              </View>
              <Pressable style={styles.clearBtn} onPress={() => selectCustomer('')} hitSlop={8}>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.customerSearchWrap}>
                <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginLeft: 12 }} />
                <TextInput
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  placeholder="Search name or phone"
                  placeholderTextColor={colors.textMuted}
                  style={styles.customerSearchInput}
                />
              </View>

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
                    <Text style={[styles.chipText, customerId === c.id && styles.chipTextActive]}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {customerSearch.trim() && filteredCustomers.length === 0 ? (
                <Pressable
                  style={styles.noMatchRow}
                  onPress={() => openAddCustomer(customerSearch.trim())}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary[600]} />
                  <Text style={styles.noMatchText}>
                    Add "{customerSearch.trim()}" as new customer
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      {/* Cart Bar */}
      <Pressable style={styles.cartBar} onPress={() => setCartOpen(true)}>
        <View style={styles.cartBarLeft}>
          <View style={styles.cartBarIcon}>
            <Ionicons name="cart" size={20} color={colors.primary[600]} />
          </View>
          <View>
            <Text style={styles.cartLabel}>
              {cart.length === 0
                ? 'Cart is empty'
                : `${cartItemCount} item${cartItemCount > 1 ? 's' : ''} in cart`}
            </Text>
            <Text style={styles.cartTotal}>{formatCurrency(total)}</Text>
          </View>
        </View>
        <View style={styles.cartBarRight}>
          <Text style={styles.cartAction}>View cart</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
        </View>
      </Pressable>

      {/* Sheets */}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerLeft: {
    flex: 1,
  },
  storeName: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.primary[600],
    letterSpacing: 0.2,
  },
  heading: {
    fontFamily: font.bold,
    fontSize: 24,
    color: colors.text,
    marginTop: 2,
  },
  cartBadgeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: font.bold,
    fontSize: 11,
    color: colors.white,
  },

  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },

  section: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.text,
  },
  optionalTag: {
    fontFamily: font.regular,
    fontSize: 11,
    color: colors.textMuted,
    backgroundColor: colors.surface[100],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    marginLeft: 2,
  },

  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[50],
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primary[100],
    gap: 12,
  },
  scanButtonPressed: {
    backgroundColor: colors.primary[100],
  },
  scanIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTextWrap: {
    flex: 1,
  },
  scanButtonTitle: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.text,
  },
  scanButtonSub: {
    fontFamily: font.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },

  searchWrap: {
    position: 'relative',
    zIndex: 10,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface[50],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    height: 48,
  },
  searchIcon: {
    marginLeft: 12,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    height: 48,
  },
  searchSpinner: {
    marginRight: 12,
  },
  searchClear: {
    marginRight: 12,
  },
  addBarcodeBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },

  dropdown: {
    marginTop: 4,
    maxHeight: 240,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  dropdownItemPressed: {
    backgroundColor: colors.surface[50],
  },
  dropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surface[100],
  },
  dropdownItemLeft: {
    flex: 1,
  },
  dropdownItemName: {
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.text,
  },
  dropdownItemMeta: {
    fontFamily: font.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  inCartBadge: {
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[500],
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  inCartText: {
    fontFamily: font.semiBold,
    fontSize: 12,
    color: colors.primary[700],
  },
  noResults: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  noResultsText: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.textMuted,
  },

  addCustomerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.primary[50],
    borderRadius: 8,
  },
  addCustomerText: {
    fontFamily: font.semiBold,
    fontSize: 13,
    color: colors.primary[600],
  },

  selectedCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    borderRadius: radius.md,
    padding: 12,
    gap: 12,
  },
  selectedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCustomerInfo: {
    flex: 1,
  },
  selectedName: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.text,
  },
  customerMeta: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 1,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface[100],
    alignItems: 'center',
    justifyContent: 'center',
  },

  customerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface[50],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    height: 44,
  },
  customerSearchInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    height: 44,
  },

  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
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

  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
  },
  cartBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cartBarIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartLabel: {
    fontFamily: font.medium,
    fontSize: 12,
    color: colors.primary[100],
  },
  cartTotal: {
    fontFamily: font.bold,
    fontSize: 20,
    color: colors.white,
  },
  cartBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cartAction: {
    fontFamily: font.semiBold,
    fontSize: 14,
    color: colors.white,
  },
});
