import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import { colors, font, radius, spacing } from '../theme';
import { formatCurrency } from '../utils/format';

export type CartItem = {
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  quantityOnHand: number;
};

type Props = {
  visible: boolean;
  items: CartItem[];
  onClose: () => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onRemove: (productId: string) => void;
  onCheckout: () => void;
  loading?: boolean;
  total: number;
};

export default function CartSheet({
  visible,
  items,
  onClose,
  onUpdateQty,
  onRemove,
  onCheckout,
  loading,
  total,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Cart ({items.length})</Text>
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {items.length === 0 ? (
            <Text style={styles.empty}>Cart is empty</Text>
          ) : (
            items.map((item) => (
              <View key={item.productId} style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.name}>{item.productName}</Text>
                  <Text style={styles.meta}>
                    {formatCurrency(item.unitPrice)} · stock {item.quantityOnHand}
                  </Text>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable style={styles.qtyBtn} onPress={() => onUpdateQty(item.productId, -1)}>
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qty}>{item.quantity}</Text>
                  <Pressable style={styles.qtyBtn} onPress={() => onUpdateQty(item.productId, 1)}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                  <Pressable onPress={() => onRemove(item.productId)}>
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                </View>
                <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
              </View>
            ))
          )}
        </ScrollView>
        <View style={styles.footer}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          <Button title="Complete sale" onPress={onCheckout} loading={loading} disabled={items.length === 0} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '75%',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.surface[300],
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  list: {
    maxHeight: 320,
  },
  empty: {
    fontFamily: font.regular,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  rowInfo: {
    marginBottom: spacing.xs,
  },
  name: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.text,
  },
  meta: {
    fontFamily: font.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 18,
    fontFamily: font.semiBold,
    color: colors.text,
  },
  qty: {
    fontFamily: font.semiBold,
    fontSize: 16,
    minWidth: 24,
    textAlign: 'center',
  },
  remove: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.danger,
    marginLeft: spacing.sm,
  },
  amount: {
    fontFamily: font.semiBold,
    fontSize: 15,
    color: colors.primary[700],
    textAlign: 'right',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  totalLabel: {
    fontFamily: font.medium,
    color: colors.textMuted,
    fontSize: 13,
  },
  totalValue: {
    fontFamily: font.bold,
    fontSize: 24,
    color: colors.text,
    marginBottom: spacing.md,
  },
});
