import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, type Invoice } from '@/src/api/client';
import Card from '@/src/components/Card';
import Screen from '@/src/components/Screen';
import { colors, font, radius, spacing } from '@/src/theme';
import { daysAgoIsoDate, formatCurrency, formatDate, todayIsoDate } from '@/src/utils/format';

export default function InvoicesScreen() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(inv: Invoice) {
    setSelected(inv);
    setDetailLoading(true);
    try {
      const full = await api.invoices.get(inv.id);
      setSelected(full);
    } catch {
      // keep list version
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <Text style={styles.title}>Invoices</Text>
      <Text style={styles.subtitle}>Last 7 days</Text>

      {invoices.map((inv) => (
        <Pressable key={inv.id} onPress={() => openDetail(inv)}>
          <Card style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.number}>{inv.invoiceNumber}</Text>
              <Text style={styles.total}>{formatCurrency(inv.total)}</Text>
            </View>
            <Text style={styles.meta}>
              {formatDate(inv.date)}
              {inv.customer?.name ? ` · ${inv.customer.name}` : ''}
            </Text>
          </Card>
        </Pressable>
      ))}

      {!loading && invoices.length === 0 ? (
        <Text style={styles.empty}>No invoices in the last 7 days</Text>
      ) : null}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)} />
        <View style={styles.modalSheet}>
          {selected ? (
            <>
              <Text style={styles.modalTitle}>{selected.invoiceNumber}</Text>
              <Text style={styles.modalMeta}>{formatDate(selected.date)}</Text>
              {detailLoading ? (
                <Text style={styles.loadingText}>Loading details…</Text>
              ) : (
                <>
                  {selected.items?.map((item, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={styles.itemName}>{item.productName}</Text>
                      <Text style={styles.itemMeta}>
                        {item.quantity} × {formatCurrency(item.unitPrice)}
                      </Text>
                      <Text style={styles.itemAmount}>{formatCurrency(item.amount)}</Text>
                    </View>
                  ))}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalValue}>{formatCurrency(selected.total)}</Text>
                  </View>
                </>
              )}
            </>
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
  row: {
    marginBottom: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  number: {
    fontFamily: font.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  total: {
    fontFamily: font.bold,
    fontSize: 16,
    color: colors.primary[700],
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
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
    paddingBottom: spacing.xl,
    maxHeight: '70%',
  },
  modalTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    color: colors.text,
  },
  modalMeta: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.textMuted,
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
  itemName: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.text,
  },
  itemMeta: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  itemAmount: {
    fontFamily: font.semiBold,
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
    marginTop: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontFamily: font.medium,
    fontSize: 16,
    color: colors.textMuted,
  },
  totalValue: {
    fontFamily: font.bold,
    fontSize: 20,
    color: colors.text,
  },
});
