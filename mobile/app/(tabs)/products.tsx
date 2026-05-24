import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Product } from '@/src/api/client';
import AddProductSheet from '@/src/components/AddProductSheet';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import Input from '@/src/components/Input';
import Screen from '@/src/components/Screen';
import Toast from '@/src/components/Toast';
import { colors, font, radius, spacing } from '@/src/theme';
import { formatCurrency } from '@/src/utils/format';

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const categorySuggestions = useMemo(
    () =>
      [...new Set(products.map((p) => p.category?.trim()).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b)
      ),
    [products]
  );

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const list = await api.products.list(q || undefined);
      setProducts(list);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  return (
    <Screen refreshing={loading} onRefresh={() => load(query)}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Products</Text>
        <Button title="Add" onPress={() => setModalOpen(true)} style={styles.addBtn} />
      </View>

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name or barcode"
        style={styles.search}
      />

      {products.map((p) => (
        <Pressable key={p.id} onPress={() => setSelected(p)}>
          <Card style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.price}>{formatCurrency(p.price)}</Text>
            </View>
            <Text style={styles.meta}>
              {p.barcode} · {p.quantityOnHand ?? 0} {p.unit} in stock
              {p.category ? ` · ${p.category}` : ''}
            </Text>
          </Card>
        </Pressable>
      ))}

      {!loading && products.length === 0 ? (
        <Text style={styles.empty}>No products found</Text>
      ) : null}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)} />
        <View style={[styles.modalSheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          {selected ? (
            <>
              <Text style={styles.modalTitle}>{selected.name}</Text>
              <DetailRow label="Barcode" value={selected.barcode} />
              <DetailRow label="Price" value={formatCurrency(selected.price)} />
              <DetailRow label="Stock" value={`${selected.quantityOnHand ?? 0} ${selected.unit}`} />
              {selected.category ? <DetailRow label="Category" value={selected.category} /> : null}
              {selected.reorderLevel != null ? (
                <DetailRow label="Reorder at" value={String(selected.reorderLevel)} />
              ) : null}
              {selected.description ? <DetailRow label="Description" value={selected.description} /> : null}
            </>
          ) : null}
        </View>
      </Modal>

      <AddProductSheet
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        autoGenerateBarcode
        categorySuggestions={categorySuggestions}
        onSaved={() => {
          setToast({ message: 'Product added', type: 'success' });
          load(query);
        }}
      />

      {toast ? (
        <Toast visible={!!toast} message={toast.message} type={toast.type} onHide={() => setToast(null)} />
      ) : null}
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 26,
    color: colors.text,
  },
  addBtn: {
    minWidth: 80,
    paddingHorizontal: spacing.md,
  },
  search: {
    marginBottom: spacing.sm,
  },
  row: {
    marginBottom: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontFamily: font.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  price: {
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
    maxHeight: '90%',
  },
  modalTitle: {
    fontFamily: font.bold,
    fontSize: 20,
    color: colors.text,
    marginBottom: spacing.md,
  },
  detailRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    fontFamily: font.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  detailValue: {
    fontFamily: font.regular,
    fontSize: 16,
    color: colors.text,
    marginTop: 2,
  },
});
