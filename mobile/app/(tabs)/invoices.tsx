import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Invoice, type WhatsAppDeliveryStatus } from '@/src/api/client';
import Screen from '@/src/components/Screen';
import { colors, font, radius, spacing } from '@/src/theme';
import { daysAgoIsoDate, formatCurrency, formatDate, todayIsoDate } from '@/src/utils/format';

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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  text: {
    fontFamily: font.medium,
    fontSize: 11,
  },
});

export default function InvoicesScreen() {
  const insets = useSafeAreaInsets();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppResult, setWhatsAppResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = daysAgoIsoDate(7);
      const to = todayIsoDate();
      const data = await api.invoices.list(from, to, 1, 50);
      setInvoices(data.items);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
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

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <Text style={styles.title}>Invoices</Text>
      <Text style={styles.subtitle}>Last 7 days</Text>

      {invoices.map((inv) => (
        <Pressable key={inv.id} onPress={() => openDetail(inv)}>
          <View style={styles.card}>
            <View style={styles.rowTop}>
              <Text style={styles.number}>{inv.invoiceNumber}</Text>
              <Text style={styles.total}>{formatCurrency(inv.total)}</Text>
            </View>
            <View style={styles.rowBottom}>
              <Text style={styles.meta}>
                {formatDate(inv.date)}
                {inv.customer?.name ? ` · ${inv.customer.name}` : ''}
              </Text>
              {whatsappBadge(inv.whatsappStatus)}
            </View>
          </View>
        </Pressable>
      ))}

      {!loading && invoices.length === 0 ? (
        <Text style={styles.empty}>No invoices in the last 7 days</Text>
      ) : null}

      <Modal
        visible={!!selected}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)} />
        <View style={[styles.modalSheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          {selected ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{selected.invoiceNumber}</Text>
              <View style={styles.modalMetaRow}>
                <Text style={styles.modalMeta}>{formatDate(selected.date)}</Text>
                {whatsappBadge(selected.whatsappStatus)}
              </View>
              {selected.customer?.name ? (
                <Text style={styles.customerName}>{selected.customer.name}</Text>
              ) : null}

              {detailLoading ? (
                <Text style={styles.loadingText}>Loading details…</Text>
              ) : (
                <>
                  {selected.items?.map((item, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <View style={styles.itemTop}>
                        <Text style={styles.itemName}>{item.productName}</Text>
                        <Text style={styles.itemAmount}>{formatCurrency(item.amount)}</Text>
                      </View>
                      <Text style={styles.itemMeta}>
                        {item.quantity} × {formatCurrency(item.unitPrice)}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalValue}>{formatCurrency(selected.total)}</Text>
                  </View>

                  <Pressable
                    style={[styles.whatsappBtn, sendingWhatsApp && styles.whatsappBtnDisabled]}
                    disabled={sendingWhatsApp}
                    onPress={resendWhatsApp}>
                    <Ionicons name="logo-whatsapp" size={18} color={colors.white} />
                    <Text style={styles.whatsappBtnText}>
                      {sendingWhatsApp ? 'Sending…' : 'Send receipt on WhatsApp'}
                    </Text>
                  </Pressable>

                  {whatsAppResult ? (
                    <Text style={[
                      styles.whatsappResult,
                      whatsAppResult.startsWith('Receipt sent') && styles.whatsappResultSuccess,
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: font.bold,
    fontSize: 26,
    color: colors.text,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surface[200],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  number: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.text,
  },
  total: {
    fontFamily: font.bold,
    fontSize: 17,
    color: colors.primary[700],
  },
  meta: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.textMuted,
    flex: 1,
  },
  empty: {
    textAlign: 'center',
    fontFamily: font.regular,
    color: colors.textMuted,
    marginTop: spacing.xl,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  modalTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    color: colors.text,
  },
  modalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  modalMeta: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  customerName: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  loadingText: {
    fontFamily: font.regular,
    color: colors.textMuted,
    paddingVertical: spacing.md,
  },
  itemRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  itemMeta: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  itemAmount: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.text,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 2,
    borderTopColor: colors.surface[200],
  },
  totalLabel: {
    fontFamily: font.semiBold,
    fontSize: 16,
    color: colors.textMuted,
  },
  totalValue: {
    fontFamily: font.bold,
    fontSize: 22,
    color: colors.text,
  },
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
  whatsappBtnDisabled: {
    opacity: 0.6,
  },
  whatsappBtnText: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.white,
  },
  whatsappResult: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  whatsappResultSuccess: {
    color: '#25D366',
  },
});
