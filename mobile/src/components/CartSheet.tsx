import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  onCheckout: (sendWhatsApp: boolean) => void;
  onAddAnother: () => void;
  onAddCustomer: () => void;
  customerName?: string;
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
  onAddAnother,
  onAddCustomer,
  customerName,
  loading,
  total,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>Cart ({items.length})</Text>
          <Pressable style={styles.addAnotherBtn} onPress={onAddAnother}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primary[600]} />
            <Text style={styles.addAnotherText}>Add item</Text>
          </Pressable>
        </View>

        {customerName ? (
          <View style={styles.customerBadge}>
            <Ionicons name="person" size={14} color={colors.primary[700]} />
            <Text style={styles.customerBadgeText}>{customerName}</Text>
          </View>
        ) : (
          <Pressable style={styles.addCustomerRow} onPress={onAddCustomer}>
            <Ionicons name="person-add-outline" size={16} color={colors.primary[600]} />
            <Text style={styles.addCustomerText}>Add customer for receipt</Text>
          </Pressable>
        )}

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {items.length === 0 ? (
            <Text style={styles.empty}>Cart is empty</Text>
          ) : (
            items.map((item) => (
              <View key={item.productId} style={styles.row}>
                <View style={styles.rowTop}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.name}>{item.productName}</Text>
                    <Text style={styles.meta}>
                      {formatCurrency(item.unitPrice)} · stock {item.quantityOnHand}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
                </View>
                <View style={styles.qtyRow}>
                  <View style={styles.qtyControls}>
                    <Pressable style={styles.qtyBtn} onPress={() => onUpdateQty(item.productId, -1)}>
                      <Ionicons name="remove" size={16} color={colors.text} />
                    </Pressable>
                    <Text style={styles.qty}>{item.quantity}</Text>
                    <Pressable style={styles.qtyBtn} onPress={() => onUpdateQty(item.productId, 1)}>
                      <Ionicons name="add" size={16} color={colors.text} />
                    </Pressable>
                  </View>
                  <Pressable style={styles.removeBtn} onPress={() => onRemove(item.productId)}>
                    <Ionicons name="trash-outline" size={15} color={colors.danger} />
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          </View>
          <View style={styles.checkoutBtns}>
            <Button
              title="Complete sale"
              onPress={() => onCheckout(false)}
              loading={loading}
              disabled={items.length === 0}
              style={styles.saleBtn}
            />
            <Pressable
              style={[styles.whatsappBtn, (items.length === 0 || loading) && styles.whatsappBtnDisabled]}
              disabled={items.length === 0 || loading}
              onPress={() => onCheckout(true)}>
              <Ionicons name="logo-whatsapp" size={20} color={colors.white} />
              <Text style={styles.whatsappBtnText}>Sale + Send receipt</Text>
            </Pressable>
          </View>
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
    maxHeight: '85%',
    paddingHorizontal: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.surface[300],
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 20,
    color: colors.text,
  },
  addAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.primary[50],
  },
  addAnotherText: {
    fontFamily: font.semiBold,
    fontSize: 13,
    color: colors.primary[600],
  },
  customerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[100],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  customerBadgeText: {
    fontFamily: font.semiBold,
    fontSize: 13,
    color: colors.primary[700],
  },
  addCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignSelf: 'flex-start',
  },
  addCustomerText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.primary[600],
  },
  list: {
    flexGrow: 0,
  },
  empty: {
    fontFamily: font.regular,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  row: {
    backgroundColor: colors.surface[50],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surface[200],
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rowInfo: {
    flex: 1,
    marginRight: spacing.sm,
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
    marginTop: 2,
  },
  amount: {
    fontFamily: font.bold,
    fontSize: 16,
    color: colors.primary[700],
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.surface[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    fontFamily: font.bold,
    fontSize: 16,
    color: colors.text,
    minWidth: 28,
    textAlign: 'center',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  removeText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.danger,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.surface[200],
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  totalLabel: {
    fontFamily: font.semiBold,
    color: colors.textMuted,
    fontSize: 15,
  },
  totalValue: {
    fontFamily: font.bold,
    fontSize: 24,
    color: colors.text,
  },
  checkoutBtns: {
    gap: spacing.sm,
  },
  saleBtn: {
    backgroundColor: colors.primary[600],
  },
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minHeight: 48,
  },
  whatsappBtnDisabled: {
    opacity: 0.5,
  },
  whatsappBtnText: {
    fontFamily: font.semiBold,
    fontSize: 16,
    color: colors.white,
  },
});
