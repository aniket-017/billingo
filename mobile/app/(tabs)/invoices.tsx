import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  api,
  type Invoice,
  type StockInInvoice,
  type StockMovement,
  type WhatsAppDeliveryStatus,
} from '@/src/api/client';
import Screen from '@/src/components/Screen';
import { colors, font, radius, spacing } from '@/src/theme';
import { formatExpiryDisplay } from '@/src/utils/expiry';
import { daysAgoIsoDate, formatCurrency, formatDate, todayIsoDate } from '@/src/utils/format';

function movementProductName(m: StockMovement): string {
  if (m.product?.name) return m.product.name;
  if (typeof m.productId === 'object' && m.productId && 'name' in m.productId) {
    return m.productId.name;
  }
  return 'Product';
}

function StockInLineItem({ m }: { m: StockMovement }) {
  const meta: string[] = [];
  if (m.batchNo) meta.push(`Batch ${m.batchNo}`);
  if (m.expiryDate) meta.push(`Exp ${formatExpiryDisplay(m.expiryDate)}`);
  if (m.dealerName) meta.push(m.dealerName);
  const prices: string[] = [];
  if ((m.sellingPrice ?? 0) > 0) prices.push(`Sell ${formatCurrency(m.sellingPrice!)}`);
  if ((m.mrp ?? 0) > 0) prices.push(`MRP ${formatCurrency(m.mrp!)}`);
  if ((m.costPrice ?? 0) > 0) prices.push(`Cost ${formatCurrency(m.costPrice!)}`);
  const hasPackaging =
    (m.numBoxes ?? 1) > 1 || (m.stripsPerBox ?? 1) > 1 || (m.tabletsPerStrip ?? 1) > 1;

  return (
    <View style={st.itemRow}>
      <View style={st.itemTop}>
        <Text style={st.itemName}>{movementProductName(m)}</Text>
        <Text style={st.itemAmount}>+{m.quantity}</Text>
      </View>
      {hasPackaging ? (
        <Text style={st.itemMeta}>
          {m.numBoxes ?? 1} Box × {m.stripsPerBox ?? 1} Strip × {m.tabletsPerStrip ?? 1} Tab
        </Text>
      ) : null}
      {meta.length > 0 ? <Text style={st.itemMeta}>{meta.join(' · ')}</Text> : null}
      {prices.length > 0 ? <Text style={st.itemMeta}>{prices.join(' · ')}</Text> : null}
      {m.notes ? <Text style={st.itemNotes}>{m.notes}</Text> : null}
      <Text style={st.itemType}>{m.type === 'OPENING' ? 'Opening stock' : 'Stock in'}</Text>
    </View>
  );
}

function whatsappBadge(status?: WhatsAppDeliveryStatus | null) {
  if (!status) return null;
  const map: Record<string, { icon: 'checkmark-done' | 'checkmark' | 'close-circle'; color: string; label: string }> = {
    sent: { icon: 'checkmark', color: colors.textMuted, label: 'Sent' },
    delivered: { icon: 'checkmark-done', color: colors.primary[600], label: 'Delivered' },
    read: { icon: 'checkmark-done', color: '#25D366', label: 'Read' },
    failed: { icon: 'close-circle', color: colors.danger, label: 'Failed' },
  };
  const info = map[status];
  if (!info) return null;
  return (
    <View style={[badgeStyles.badge, { backgroundColor: info.color + '18' }]}>
      <Ionicons name={info.icon as any} size={13} color={info.color} />
      <Text style={[badgeStyles.text, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  text: { fontFamily: font.medium, fontSize: 11 },
});

const PAGE_SIZE = 20;

export default function InvoicesScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'stock_out' | 'stock_in'>('stock_out');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppResult, setWhatsAppResult] = useState<string | null>(null);
  const [stockInInvoices, setStockInInvoices] = useState<StockInInvoice[]>([]);
  const [stockInPage, setStockInPage] = useState(1);
  const [stockInTotalPages, setStockInTotalPages] = useState(1);
  const [stockInLoadingMore, setStockInLoadingMore] = useState(false);
  const [selectedStockIn, setSelectedStockIn] = useState<StockInInvoice | null>(null);

  const load = useCallback(async (p = 1, append = false) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const from = daysAgoIsoDate(30);
      const to = todayIsoDate();
      const data = await api.invoices.list(from, to, p, PAGE_SIZE);
      setInvoices((prev) => append ? [...prev, ...data.items] : data.items);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch {
      if (!append) setInvoices([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const loadStockIn = useCallback(async (p = 1, append = false) => {
    if (p === 1) setLoading(true);
    else setStockInLoadingMore(true);
    try {
      const data = await api.invoices.listStockIn(p, PAGE_SIZE);
      setStockInInvoices((prev) => append ? [...prev, ...data.items] : data.items);
      setStockInPage(data.page);
      setStockInTotalPages(data.totalPages);
    } catch {
      if (!append) setStockInInvoices([]);
    } finally {
      setLoading(false);
      setStockInLoadingMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(1);
      loadStockIn(1);
    }, [load, loadStockIn])
  );

  async function openDetail(inv: Invoice) {
    setSelected(inv);
    setDetailLoading(true);
    setWhatsAppResult(null);
    try {
      const full = await api.invoices.get(inv.id);
      setSelected(full);
    } catch {
      // keep list version
    } finally {
      setDetailLoading(false);
    }
  }

  async function resendWhatsApp() {
    if (!selected) return;
    setSendingWhatsApp(true);
    setWhatsAppResult(null);
    try {
      const { whatsappSend } = await api.invoices.resendWhatsApp(selected.id);
      if (whatsappSend.ok) {
        setWhatsAppResult('Receipt sent on WhatsApp');
        setSelected((prev) => prev ? { ...prev, whatsappStatus: 'sent' } : prev);
        setInvoices((prev) =>
          prev.map((inv) => inv.id === selected.id ? { ...inv, whatsappStatus: 'sent' } : inv)
        );
      } else {
        const reason = !whatsappSend.ok ? whatsappSend.reason : 'unknown';
        const msg = reason === 'invalid_phone'
          ? 'Customer has no valid phone number'
          : reason === 'config_missing'
          ? 'WhatsApp not configured'
          : `Failed to send: ${reason}`;
        setWhatsAppResult(msg);
      }
    } catch (e) {
      setWhatsAppResult(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSendingWhatsApp(false);
    }
  }

  async function openStockInDetail(inv: StockInInvoice) {
    setSelectedStockIn(inv);
    try {
      const full = await api.invoices.getStockIn(inv.id);
      setSelectedStockIn(full);
    } catch {
      // keep list version
    }
  }

  const listData: Array<Invoice | StockInInvoice> =
    mode === 'stock_out' ? invoices : stockInInvoices;

  return (
    <Screen scroll={false} padded={false}>
      <FlatList<Invoice | StockInInvoice>
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={st.listContent}
        stickyHeaderIndices={[0]}
        refreshing={loading}
        onRefresh={() => (mode === 'stock_out' ? load(1) : loadStockIn(1))}
        ListHeaderComponent={
          <View style={st.stickyHeader}>
            <Text style={st.title}>Invoices</Text>
            <Text style={st.subtitle}>Last 30 days</Text>

            <View style={st.modeSwitchWrap}>
              <Pressable
                onPress={() => setMode('stock_out')}
                style={[st.modeBtn, mode === 'stock_out' && st.modeBtnActive]}
              >
                <Ionicons
                  name="trending-down-outline"
                  size={16}
                  color={mode === 'stock_out' ? colors.primary[700] : colors.textMuted}
                />
                <Text style={[st.modeBtnText, mode === 'stock_out' && st.modeBtnTextActive]}>Stock Out</Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('stock_in')}
                style={[st.modeBtn, mode === 'stock_in' && st.modeBtnActive]}
              >
                <Ionicons
                  name="trending-up-outline"
                  size={16}
                  color={mode === 'stock_in' ? colors.primary[700] : colors.textMuted}
                />
                <Text style={[st.modeBtnText, mode === 'stock_in' && st.modeBtnTextActive]}>Stock In</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) =>
          mode === 'stock_out' ? (
            <Pressable onPress={() => openDetail(item as Invoice)}>
              <View style={st.card}>
                <View style={st.rowTop}>
                  <Text style={st.number}>{(item as Invoice).invoiceNumber}</Text>
                  <Text style={st.total}>{formatCurrency((item as Invoice).total)}</Text>
                </View>
                <View style={st.rowBottom}>
                  <Text style={st.meta}>
                    {formatDate((item as Invoice).date)}
                    {(item as Invoice).customer?.name ? ` · ${(item as Invoice).customer?.name}` : ''}
                  </Text>
                  {whatsappBadge((item as Invoice).whatsappStatus)}
                </View>
              </View>
            </Pressable>
          ) : (
            <Pressable onPress={() => openStockInDetail(item as StockInInvoice)}>
              <View style={st.card}>
                <View style={st.rowTop}>
                  <Text style={st.number}>{(item as StockInInvoice).invoiceNumber || 'Stock-In Invoice'}</Text>
                  <Text style={st.total}>
                    {((item as StockInInvoice).invoiceTotal ?? 0) > 0 ? formatCurrency((item as StockInInvoice).invoiceTotal as number) : ''}
                  </Text>
                </View>
                <View style={st.rowBottom}>
                  <Text style={st.meta}>
                    {(item as StockInInvoice).invoiceDate ? formatDate((item as StockInInvoice).invoiceDate!) : 'No date'}
                    {(item as StockInInvoice).supplierName ? ` · ${(item as StockInInvoice).supplierName}` : ''}
                  </Text>
                </View>
              </View>
            </Pressable>
          )
        }
        ListFooterComponent={
          <>
            {mode === 'stock_out' && page < totalPages ? (
              <Pressable style={st.loadMoreBtn} onPress={() => load(page + 1, true)}>
                {loadingMore ? (
                  <ActivityIndicator size="small" color={colors.primary[600]} />
                ) : (
                  <Text style={st.loadMoreText}>Load more</Text>
                )}
              </Pressable>
            ) : null}
            {mode === 'stock_in' && stockInPage < stockInTotalPages ? (
              <Pressable style={st.loadMoreBtn} onPress={() => loadStockIn(stockInPage + 1, true)}>
                {stockInLoadingMore ? (
                  <ActivityIndicator size="small" color={colors.primary[600]} />
                ) : (
                  <Text style={st.loadMoreText}>Load more</Text>
                )}
              </Pressable>
            ) : null}
            {!loading && mode === 'stock_out' && invoices.length === 0 ? (
              <Text style={st.empty}>No stock-out invoices in the last 30 days</Text>
            ) : null}
            {!loading && mode === 'stock_in' && stockInInvoices.length === 0 ? (
              <Text style={st.empty}>No stock-in invoices found</Text>
            ) : null}
          </>
        }
      />

      <Modal
        visible={!!selected}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setSelected(null)}>
        <Pressable style={st.modalBackdrop} onPress={() => setSelected(null)} />
        <View style={[st.modalSheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          {selected ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={st.modalTitle}>{selected.invoiceNumber}</Text>
              <View style={st.modalMetaRow}>
                <Text style={st.modalMeta}>{formatDate(selected.date)}</Text>
                {whatsappBadge(selected.whatsappStatus)}
              </View>
              {selected.customer?.name ? (
                <Text style={st.customerName}>{selected.customer.name}</Text>
              ) : null}

              {detailLoading ? (
                <Text style={st.loadingText}>Loading details…</Text>
              ) : (
                <>
                  {selected.items?.map((item, idx) => (
                    <View key={idx} style={st.itemRow}>
                      <View style={st.itemTop}>
                        <Text style={st.itemName}>{item.productName}</Text>
                        <Text style={st.itemAmount}>{formatCurrency(item.amount)}</Text>
                      </View>
                      <Text style={st.itemMeta}>
                        {item.quantity} × {formatCurrency(item.unitPrice)}
                      </Text>
                    </View>
                  ))}
                  <View style={st.totalRow}>
                    <Text style={st.totalLabel}>Total</Text>
                    <Text style={st.totalValue}>{formatCurrency(selected.total)}</Text>
                  </View>

                  <Pressable
                    style={[st.whatsappBtn, sendingWhatsApp && st.whatsappBtnDisabled]}
                    disabled={sendingWhatsApp}
                    onPress={resendWhatsApp}>
                    <Ionicons name="logo-whatsapp" size={18} color={colors.white} />
                    <Text style={st.whatsappBtnText}>
                      {sendingWhatsApp ? 'Sending…' : 'Send receipt on WhatsApp'}
                    </Text>
                  </Pressable>

                  {whatsAppResult ? (
                    <Text style={[
                      st.whatsappResult,
                      whatsAppResult.startsWith('Receipt sent') && st.whatsappResultSuccess,
                    ]}>
                      {whatsAppResult}
                    </Text>
                  ) : null}
                </>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={!!selectedStockIn}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setSelectedStockIn(null)}>
        <Pressable style={st.modalBackdrop} onPress={() => setSelectedStockIn(null)} />
        <View style={[st.modalSheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          {selectedStockIn ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={st.modalTitle}>{selectedStockIn.invoiceNumber || 'Stock-In Invoice'}</Text>
              <Text style={st.modalMeta}>
                {selectedStockIn.invoiceDate ? formatDate(selectedStockIn.invoiceDate) : 'No date'}
              </Text>
              {selectedStockIn.supplierName ? (
                <Text style={st.customerName}>{selectedStockIn.supplierName}</Text>
              ) : null}

              {[
                ['Supplier GST', selectedStockIn.supplierGst || selectedStockIn.supplierGstNumber],
                ['Drug License', selectedStockIn.supplierDrugLicenseNumber],
                ['Address', selectedStockIn.supplierAddress],
                ['Mobile', selectedStockIn.supplierMobile],
                ['Email', selectedStockIn.supplierEmail],
                ['State Code', selectedStockIn.supplierStateCode],
                ['PAN', selectedStockIn.supplierPanNumber],
                ['Supplier Code', selectedStockIn.supplierCode],
                ['Due Date', selectedStockIn.dueDate ? formatDate(selectedStockIn.dueDate) : ''],
                ['GST Total', selectedStockIn.gstTotal != null ? formatCurrency(selectedStockIn.gstTotal) : ''],
                ['Discount', selectedStockIn.discount != null ? formatCurrency(selectedStockIn.discount) : ''],
                ['Round Off', selectedStockIn.roundOff != null ? formatCurrency(selectedStockIn.roundOff) : ''],
                ['Payment', selectedStockIn.paymentType],
                ['Place Of Supply', selectedStockIn.placeOfSupply],
              ]
                .filter(([, value]) => String(value ?? '').trim().length > 0)
                .map(([label, value]) => (
                  <View key={label} style={st.detailRow}>
                    <Text style={st.detailLabel}>{label}</Text>
                    <Text style={st.detailValue}>{String(value)}</Text>
                  </View>
                ))}

              {(selectedStockIn.movements ?? []).length > 0 ? (
                <>
                  <Text style={st.productsSectionTitle}>
                    Products stocked in ({selectedStockIn.movements!.length})
                  </Text>
                  {selectedStockIn.movements!.map((m) => (
                    <StockInLineItem key={m.id} m={m} />
                  ))}
                </>
              ) : (
                <Text style={st.loadingText}>No product lines linked to this invoice</Text>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

const st = StyleSheet.create({
  listContent: { padding: spacing.md, paddingBottom: spacing.xl },
  stickyHeader: { backgroundColor: colors.surface[50], paddingBottom: spacing.sm, marginBottom: spacing.xs },
  title: { fontFamily: font.bold, fontSize: 26, color: colors.text },
  subtitle: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, marginBottom: spacing.md },
  modeSwitchWrap: {
    flexDirection: 'row',
    backgroundColor: colors.surface[100],
    borderRadius: radius.lg,
    padding: 4,
    marginBottom: spacing.md,
    gap: 6,
  },
  modeBtn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeBtnActive: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  modeBtnText: { fontFamily: font.semiBold, fontSize: 13, color: colors.textMuted },
  modeBtnTextActive: { color: colors.primary[700] },
  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 18,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.surface[200], shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  number: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  total: { fontFamily: font.bold, fontSize: 17, color: colors.primary[700] },
  meta: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted, flex: 1 },
  empty: { textAlign: 'center', fontFamily: font.regular, color: colors.textMuted, marginTop: spacing.xl },

  loadMoreBtn: { alignItems: 'center', paddingVertical: 14, marginTop: spacing.xs, marginBottom: spacing.md },
  loadMoreText: { fontFamily: font.semiBold, fontSize: 14, color: colors.primary[600] },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '70%' },
  modalTitle: { fontFamily: font.bold, fontSize: 20, color: colors.text },
  modalMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2, marginBottom: spacing.sm },
  modalMeta: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  customerName: { fontFamily: font.semiBold, fontSize: 15, color: colors.text, marginBottom: spacing.md },
  loadingText: { fontFamily: font.regular, color: colors.textMuted, paddingVertical: spacing.md },
  itemRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontFamily: font.semiBold, fontSize: 15, color: colors.text, flex: 1, marginRight: spacing.sm },
  itemMeta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  itemNotes: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  itemType: { fontFamily: font.medium, fontSize: 11, color: colors.primary[600], marginTop: 4 },
  itemAmount: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  productsSectionTitle: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  detailRow: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  detailValue: { fontFamily: font.regular, fontSize: 14, color: colors.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 2, borderTopColor: colors.surface[200] },
  totalLabel: { fontFamily: font.semiBold, fontSize: 16, color: colors.textMuted },
  totalValue: { fontFamily: font.bold, fontSize: 22, color: colors.text },
  whatsappBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', paddingVertical: 12, paddingHorizontal: spacing.lg, borderRadius: radius.md, marginTop: spacing.lg },
  whatsappBtnDisabled: { opacity: 0.6 },
  whatsappBtnText: { fontFamily: font.semiBold, fontSize: 15, color: colors.white },
  whatsappResult: { fontFamily: font.medium, fontSize: 13, color: colors.danger, textAlign: 'center', marginTop: spacing.sm },
  whatsappResultSuccess: { color: '#25D366' },
});
