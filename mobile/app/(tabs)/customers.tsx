import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Customer, type Invoice, type WhatsAppDeliveryStatus } from '@/src/api/client';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import Input from '@/src/components/Input';
import Screen from '@/src/components/Screen';
import Toast from '@/src/components/Toast';
import { colors, font, radius, spacing } from '@/src/theme';
import { formatCurrency, formatDate } from '@/src/utils/format';
import { validateCustomerPhoneInput } from '@/src/utils/customerPhone';

type FormState = { name: string; phone: string; email: string; address: string };
const emptyForm: FormState = { name: '', phone: '', email: '', address: '' };

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
    <View style={[waBadgeStyles.badge, { backgroundColor: info.color + '18' }]}>
      <Ionicons name={info.icon as any} size={12} color={info.color} />
      <Text style={[waBadgeStyles.text, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}
const waBadgeStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  text: { fontFamily: font.medium, fontSize: 10 },
});

const PAGE_SIZE = 20;

export default function CustomersScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Edit/Create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [invoiceCountLoading, setInvoiceCountLoading] = useState(false);

  // Invoices list modal
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invPage, setInvPage] = useState(1);
  const [invTotalPages, setInvTotalPages] = useState(1);
  const [invLoadingMore, setInvLoadingMore] = useState(false);

  // Invoice detail modal
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppResult, setWhatsAppResult] = useState<string | null>(null);

  const load = useCallback(async (q?: string, p = 1, append = false) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await api.customers.list(q || undefined, p, PAGE_SIZE);
      setCustomers((prev) => append ? [...prev, ...res.items] : res.items);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch {
      if (!append) setCustomers([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(query, 1), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setPhoneError('');
    setInvoiceCount(0);
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, email: c.email, address: c.address });
    setPhoneError('');
    setInvoiceCount(0);
    setModalOpen(true);
    loadInvoiceCount(c.id);
  }

  async function loadInvoiceCount(customerId: string) {
    setInvoiceCountLoading(true);
    try {
      const res = await api.invoices.list(undefined, undefined, 1, 1, customerId);
      setInvoiceCount(res.total);
    } catch {
      setInvoiceCount(0);
    } finally {
      setInvoiceCountLoading(false);
    }
  }

  async function openInvoicesList() {
    if (!editing) return;
    setInvoicesOpen(true);
    loadCustomerInvoices(editing.id, 1);
  }

  async function loadCustomerInvoices(customerId: string, p = 1, append = false) {
    if (p === 1) setInvoicesLoading(true);
    else setInvLoadingMore(true);
    try {
      const res = await api.invoices.list(undefined, undefined, p, PAGE_SIZE, customerId);
      setCustomerInvoices((prev) => append ? [...prev, ...res.items] : res.items);
      setInvPage(res.page);
      setInvTotalPages(res.totalPages);
    } catch {
      if (!append) setCustomerInvoices([]);
    } finally {
      setInvoicesLoading(false);
      setInvLoadingMore(false);
    }
  }

  async function openInvoiceDetail(inv: Invoice) {
    setSelectedInvoice(inv);
    setDetailLoading(true);
    setWhatsAppResult(null);
    try {
      setSelectedInvoice(await api.invoices.get(inv.id));
    } catch {
      // keep list version
    } finally {
      setDetailLoading(false);
    }
  }

  async function resendWhatsApp() {
    if (!selectedInvoice) return;
    setSendingWhatsApp(true);
    setWhatsAppResult(null);
    try {
      const { whatsappSend } = await api.invoices.resendWhatsApp(selectedInvoice.id);
      if (whatsappSend.ok) {
        setWhatsAppResult('Receipt sent on WhatsApp');
        setSelectedInvoice((p) => (p ? { ...p, whatsappStatus: 'sent' } : p));
      } else {
        const reason = !whatsappSend.ok ? whatsappSend.reason : 'unknown';
        setWhatsAppResult(
          reason === 'invalid_phone'
            ? 'Customer has no valid phone number'
            : reason === 'config_missing'
            ? 'WhatsApp not configured'
            : `Failed to send: ${reason}`
        );
      }
    } catch (e) {
      setWhatsAppResult(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSendingWhatsApp(false);
    }
  }

  async function save() {
    if (!form.name.trim()) {
      setToast({ message: 'Name is required', type: 'error' });
      return;
    }
    const phoneCheck = validateCustomerPhoneInput(form.phone);
    if (!phoneCheck.ok) {
      setPhoneError(phoneCheck.message);
      return;
    }
    setPhoneError('');
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        phone: phoneCheck.phone,
        email: form.email.trim(),
        address: form.address.trim(),
      };
      if (editing) {
        await api.customers.update(editing.id, body);
      } else {
        await api.customers.create(body);
      }
      setModalOpen(false);
      setToast({ message: editing ? 'Customer updated' : 'Customer added', type: 'success' });
      load(query, 1);
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen refreshing={loading} onRefresh={() => load(query, 1)}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Customers</Text>
        <Button title="Add" onPress={openCreate} style={styles.addBtn} />
      </View>

      <Input value={query} onChangeText={setQuery} placeholder="Search customers" style={styles.search} />

      {customers.map((c) => (
        <Pressable key={c.id} onPress={() => openEdit(c)}>
          <Card style={styles.row}>
            <View style={styles.customerRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{c.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.customerInfo}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.meta}>
                  {[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact info'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.surface[300]} />
            </View>
          </Card>
        </Pressable>
      ))}

      {page < totalPages ? (
        <Pressable style={styles.loadMoreBtn} onPress={() => load(query, page + 1, true)}>
          {loadingMore ? (
            <ActivityIndicator size="small" color={colors.primary[600]} />
          ) : (
            <Text style={styles.loadMoreText}>Load more</Text>
          )}
        </Pressable>
      ) : null}

      {!loading && customers.length === 0 ? (
        <Text style={styles.empty}>No customers found</Text>
      ) : null}

      {/* ─── Edit / Create Modal ─── */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setModalOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.handle} />
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
              contentContainerStyle={styles.sheetScroll}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{editing ? 'Edit customer' : 'New customer'}</Text>
                <Pressable style={styles.closeBtn} onPress={() => setModalOpen(false)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              <Input label="Name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              <Input label="Phone" value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" error={phoneError} />
              <Input label="Email" value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} keyboardType="email-address" autoCapitalize="none" />
              <Input label="Address" value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} />

              <Button title={editing ? 'Save changes' : 'Add customer'} onPress={save} loading={saving} />

              {editing && (
                <Pressable
                  style={({ pressed }) => [styles.historyBtn, pressed && styles.historyBtnPressed]}
                  onPress={openInvoicesList}>
                  <View style={styles.historyIconWrap}>
                    <Ionicons name="receipt-outline" size={20} color={colors.primary[600]} />
                  </View>
                  <View style={styles.historyTextWrap}>
                    <Text style={styles.historyTitle}>Purchase History</Text>
                    <Text style={styles.historySub}>
                      {invoiceCountLoading
                        ? 'Loading…'
                        : invoiceCount === 0
                        ? 'No invoices yet'
                        : `${invoiceCount} invoice${invoiceCount > 1 ? 's' : ''}`}
                    </Text>
                  </View>
                  {invoiceCount > 0 && (
                    <View style={styles.historyCountBadge}>
                      <Text style={styles.historyCountText}>{invoiceCount}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={colors.surface[300]} />
                </Pressable>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Invoices List Modal ─── */}
      <Modal visible={invoicesOpen} animationType="slide" transparent onRequestClose={() => setInvoicesOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setInvoicesOpen(false)} />
        <View style={[styles.sheet, styles.sheetTall, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.invoicesListHeader}>
            <Pressable style={styles.backBtn} onPress={() => setInvoicesOpen(false)} hitSlop={8}>
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </Pressable>
            <View style={styles.invoicesListHeaderText}>
              <Text style={styles.sheetTitle}>Purchase History</Text>
              {editing && <Text style={styles.invoicesListSub}>{editing.name}</Text>}
            </View>
            <Pressable style={styles.closeBtn} onPress={() => setInvoicesOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.invoicesListBody}>
            {invoicesLoading ? (
              <View style={styles.centerLoader}>
                <ActivityIndicator size="small" color={colors.primary[500]} />
                <Text style={styles.loaderText}>Loading invoices…</Text>
              </View>
            ) : customerInvoices.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={40} color={colors.surface[300]} />
                <Text style={styles.emptyStateTitle}>No invoices yet</Text>
                <Text style={styles.emptyStateSub}>Invoices for this customer will appear here</Text>
              </View>
            ) : (
              <>
                {customerInvoices.map((inv) => (
                  <Pressable
                    key={inv.id}
                    style={({ pressed }) => [styles.invoiceCard, pressed && styles.invoiceCardPressed]}
                    onPress={() => openInvoiceDetail(inv)}>
                    <View style={styles.invoiceCardTop}>
                      <Text style={styles.invoiceNumber}>{inv.invoiceNumber}</Text>
                      <Text style={styles.invoiceTotal}>{formatCurrency(inv.total)}</Text>
                    </View>
                    <View style={styles.invoiceCardBottom}>
                      <Text style={styles.invoiceMeta}>{formatDate(inv.date)}</Text>
                      {whatsappBadge(inv.whatsappStatus)}
                    </View>
                  </Pressable>
                ))}
                {invPage < invTotalPages && editing ? (
                  <Pressable style={styles.loadMoreBtn} onPress={() => loadCustomerInvoices(editing.id, invPage + 1, true)}>
                    {invLoadingMore ? (
                      <ActivityIndicator size="small" color={colors.primary[600]} />
                    ) : (
                      <Text style={styles.loadMoreText}>Load more</Text>
                    )}
                  </Pressable>
                ) : null}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Invoice Detail Modal ─── */}
      <Modal
        visible={!!selectedInvoice}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setSelectedInvoice(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelectedInvoice(null)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          {selectedInvoice && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>{selectedInvoice.invoiceNumber}</Text>
                  <View style={styles.detailMetaRow}>
                    <Text style={styles.detailMeta}>{formatDate(selectedInvoice.date)}</Text>
                    {whatsappBadge(selectedInvoice.whatsappStatus)}
                  </View>
                </View>
                <Pressable style={styles.closeBtn} onPress={() => setSelectedInvoice(null)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              {selectedInvoice.customer?.name && (
                <View style={styles.detailCustomer}>
                  <Ionicons name="person-outline" size={14} color={colors.primary[600]} />
                  <Text style={styles.detailCustomerName}>{selectedInvoice.customer.name}</Text>
                </View>
              )}

              {detailLoading ? (
                <View style={styles.centerLoader}>
                  <ActivityIndicator size="small" color={colors.primary[500]} />
                  <Text style={styles.loaderText}>Loading details…</Text>
                </View>
              ) : (
                <>
                  {selectedInvoice.items?.map((item, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <View style={styles.itemTop}>
                        <Text style={styles.itemName} numberOfLines={1}>{item.productName}</Text>
                        <Text style={styles.itemAmount}>{formatCurrency(item.amount)}</Text>
                      </View>
                      <Text style={styles.itemMeta}>{item.quantity} × {formatCurrency(item.unitPrice)}</Text>
                    </View>
                  ))}

                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalValue}>{formatCurrency(selectedInvoice.total)}</Text>
                  </View>

                  <Pressable
                    style={[styles.whatsappBtn, sendingWhatsApp && { opacity: 0.6 }]}
                    disabled={sendingWhatsApp}
                    onPress={resendWhatsApp}>
                    <Ionicons name="logo-whatsapp" size={18} color={colors.white} />
                    <Text style={styles.whatsappBtnText}>
                      {sendingWhatsApp ? 'Sending…' : 'Send receipt on WhatsApp'}
                    </Text>
                  </Pressable>

                  {whatsAppResult && (
                    <Text style={[styles.waResult, whatsAppResult.startsWith('Receipt sent') && styles.waResultOk]}>
                      {whatsAppResult}
                    </Text>
                  )}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {toast && <Toast visible={!!toast} message={toast.message} type={toast.type} onHide={() => setToast(null)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontFamily: font.bold, fontSize: 26, color: colors.text },
  addBtn: { minWidth: 80, paddingHorizontal: spacing.md },
  search: { marginBottom: spacing.sm },

  row: { marginBottom: spacing.sm },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.bold, fontSize: 16, color: colors.primary[600] },
  customerInfo: { flex: 1 },
  name: { fontFamily: font.semiBold, fontSize: 16, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', fontFamily: font.regular, color: colors.textMuted, marginTop: spacing.xl },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 14, marginTop: spacing.xs, marginBottom: spacing.md },
  loadMoreText: { fontFamily: font.semiBold, fontSize: 14, color: colors.primary[600] },

  // Shared modal
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '80%' },
  sheetTall: { maxHeight: '85%' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.surface[300], alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetScroll: { padding: spacing.lg, paddingTop: spacing.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.md },
  sheetTitle: { fontFamily: font.bold, fontSize: 20, color: colors.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface[100], alignItems: 'center', justifyContent: 'center' },
  backBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface[100], alignItems: 'center', justifyContent: 'center' },

  // Purchase History button
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: spacing.lg,
    padding: 14,
    backgroundColor: colors.surface[50],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface[200],
  },
  historyBtnPressed: { backgroundColor: colors.surface[100] },
  historyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyTextWrap: { flex: 1 },
  historyTitle: { fontFamily: font.semiBold, fontSize: 15, color: colors.text },
  historySub: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  historyCountBadge: {
    backgroundColor: colors.primary[600],
    borderRadius: 10,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  historyCountText: { fontFamily: font.bold, fontSize: 12, color: colors.white },

  // Invoices list modal
  invoicesListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  invoicesListHeaderText: { flex: 1 },
  invoicesListSub: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: 1 },
  invoicesListBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 8 },

  centerLoader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing.xl },
  loaderText: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },

  emptyState: { alignItems: 'center', paddingVertical: spacing.xl, gap: 8 },
  emptyStateTitle: { fontFamily: font.semiBold, fontSize: 16, color: colors.text },
  emptyStateSub: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },

  invoiceCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surface[200],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  invoiceCardPressed: { backgroundColor: colors.surface[50] },
  invoiceCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invoiceCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  invoiceNumber: { fontFamily: font.semiBold, fontSize: 14, color: colors.text },
  invoiceTotal: { fontFamily: font.bold, fontSize: 16, color: colors.primary[700] },
  invoiceMeta: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },

  // Invoice detail
  detailMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  detailMeta: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  detailCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary[50],
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  detailCustomerName: { fontFamily: font.semiBold, fontSize: 13, color: colors.primary[700] },

  itemRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontFamily: font.semiBold, fontSize: 15, color: colors.text, flex: 1, marginRight: spacing.sm },
  itemMeta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  itemAmount: { fontFamily: font.bold, fontSize: 15, color: colors.text },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 2, borderTopColor: colors.surface[200] },
  totalLabel: { fontFamily: font.semiBold, fontSize: 16, color: colors.textMuted },
  totalValue: { fontFamily: font.bold, fontSize: 22, color: colors.text },

  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.lg,
  },
  whatsappBtnText: { fontFamily: font.semiBold, fontSize: 15, color: colors.white },
  waResult: { fontFamily: font.medium, fontSize: 13, color: colors.danger, textAlign: 'center', marginTop: spacing.sm },
  waResultOk: { color: '#25D366' },
});
