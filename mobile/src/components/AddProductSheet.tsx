import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Product } from '@/src/api/client';
import Button from '@/src/components/Button';
import Input from '@/src/components/Input';
import { useProductNameOcr } from '@/src/hooks/useProductNameOcr';
import { colors, font, radius, spacing } from '@/src/theme';

function parseExpiryToDate(val: string): string {
  if (!val) return '';
  const parts = val.split('/');
  if (parts.length === 2) {
    const mm = parts[0].padStart(2, '0');
    const yyyy = parts[1].length === 2 ? '20' + parts[1] : parts[1];
    return `${yyyy}-${mm}-01`;
  }
  return val;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved?: (product: Product) => void;
  initialBarcode?: string;
  initialName?: string;
  fromSale?: boolean;
  lockBarcode?: boolean;
  categorySuggestions?: string[];
  title?: string;
  submitLabel?: string;
  autoGenerateBarcode?: boolean;
  initialDealerName?: string;
};

type FormState = {
  barcode: string;
  name: string;
  sellingPrice: string;
  mrp: string;
  purchasePrice: string;
  numBoxes: string;
  stripsPerBox: string;
  tabletsPerStrip: string;
  batchNo: string;
  expiry: string;
  reorderLevel: string;
  dealerName: string;
  category: string;
  unit: string;
};

const emptyForm: FormState = {
  barcode: '',
  name: '',
  sellingPrice: '',
  mrp: '',
  purchasePrice: '',
  numBoxes: '1',
  stripsPerBox: '1',
  tabletsPerStrip: '1',
  batchNo: '',
  expiry: '',
  reorderLevel: '',
  dealerName: '',
  category: '',
  unit: 'pcs',
};

export default function AddProductSheet({
  visible,
  onClose,
  onSaved,
  initialBarcode = '',
  initialName = '',
  fromSale = false,
  lockBarcode = false,
  categorySuggestions = [],
  title,
  submitLabel = 'Add product',
  autoGenerateBarcode = false,
  initialDealerName = '',
}: Props) {
  const insets = useSafeAreaInsets();
  const {
    scanLabelForName,
    loading: ocrLoading,
    error: ocrError,
    warning: ocrWarning,
    clearError,
    clearWarning,
  } = useProductNameOcr();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);

  const sheetTitle = title ?? (fromSale ? 'New product from scan' : 'New product');
  const filteredSuggestions = useMemo(() => {
    const q = form.category.trim().toLowerCase();
    return categorySuggestions.filter((c) => !q || c.toLowerCase().includes(q)).slice(0, 8);
  }, [categorySuggestions, form.category]);

  const totalUnits = useMemo(() => {
    const boxes = Math.max(1, parseInt(form.numBoxes) || 1);
    const strips = Math.max(1, parseInt(form.stripsPerBox) || 1);
    const tablets = Math.max(1, parseInt(form.tabletsPerStrip) || 1);
    return boxes * strips * tablets;
  }, [form.numBoxes, form.stripsPerBox, form.tabletsPerStrip]);

  const marginInfo = useMemo(() => {
    const mrp = parseFloat(form.mrp) || 0;
    const purchase = parseFloat(form.purchasePrice) || 0;
    if (mrp > 0 && purchase > 0) {
      const margin = mrp - purchase;
      const pct = (margin / mrp) * 100;
      return { margin, pct };
    }
    return null;
  }, [form.mrp, form.purchasePrice]);

  const unitPrice = useMemo(() => {
    const selling = parseFloat(form.sellingPrice) || parseFloat(form.mrp) || 0;
    if (selling > 0 && totalUnits > 1) {
      return (selling / totalUnits).toFixed(2);
    }
    return null;
  }, [form.sellingPrice, form.mrp, totalUnits]);

  useEffect(() => {
    if (!visible) {
      setForm(emptyForm);
      setFormError('');
      clearError();
      clearWarning();
      return;
    }
    setForm({
      ...emptyForm,
      barcode: initialBarcode,
      name: initialName,
      dealerName: initialDealerName,
    });
    if (autoGenerateBarcode && !initialBarcode) {
      generateBarcode();
    }
  }, [visible, initialBarcode, initialName, autoGenerateBarcode, initialDealerName]);

  async function generateBarcode() {
    setGeneratingBarcode(true);
    try {
      const { barcode } = await api.products.generateBarcode();
      setForm((f) => ({ ...f, barcode }));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not generate barcode');
    } finally {
      setGeneratingBarcode(false);
    }
  }

  async function handleScanLabel() {
    clearError();
    clearWarning();
    const name = await scanLabelForName();
    if (name) {
      setForm((f) => ({ ...f, name }));
      if (formError) setFormError('');
    }
  }

  async function save() {
    const name = form.name.trim();
    const barcode = form.barcode.trim();
    const sellingPrice = parseFloat(form.sellingPrice) || 0;
    const mrp = parseFloat(form.mrp) || 0;
    const purchasePrice = parseFloat(form.purchasePrice) || 0;
    const price = sellingPrice || mrp;

    if (!name || !barcode) {
      setFormError('Name and barcode are required');
      return;
    }
    if (price <= 0 && purchasePrice <= 0) {
      setFormError('At least one price (Selling Price, MRP, or Purchase Price) is required');
      return;
    }

    const numBoxes = Math.max(1, parseInt(form.numBoxes) || 1);
    const stripsPerBox = Math.max(1, parseInt(form.stripsPerBox) || 1);
    const tabletsPerStrip = Math.max(1, parseInt(form.tabletsPerStrip) || 1);
    const openingQuantity = numBoxes * stripsPerBox * tabletsPerStrip;
    const reorderLevel = form.reorderLevel.trim() ? Math.max(0, parseInt(form.reorderLevel) || 0) : 0;

    setFormError('');
    setSaving(true);
    try {
      const product = await api.products.create({
        barcode,
        name,
        price: price || purchasePrice,
        mrp: mrp || undefined,
        sellingPrice: sellingPrice || undefined,
        unit: form.unit.trim() || 'pcs',
        category: form.category.trim(),
        batchNo: form.batchNo.trim() || undefined,
        expiryDate: parseExpiryToDate(form.expiry.trim()) || undefined,
        numBoxes,
        stripsPerBox,
        tabletsPerStrip,
        packSize: stripsPerBox * tabletsPerStrip,
        openingQuantity,
        reorderLevel,
        costPrice: purchasePrice || undefined,
        dealerName: form.dealerName.trim() || undefined,
      });
      onSaved?.(product);
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof FormState) {
    return (v: string) => {
      setForm((f) => ({ ...f, [field]: v }));
      if (formError) setFormError('');
    };
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kavWrapper}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalSheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{sheetTitle}</Text>

            {fromSale ? (
              <Text style={styles.hint}>
                Barcode not found. Scan the label — AI will suggest the product name.
              </Text>
            ) : (
              <Text style={styles.hint}>
                Scan the label — AI will suggest the product name. Edit if needed.
              </Text>
            )}

            {/* --- Product Name --- */}
            <Button
              title="Scan label"
              variant="secondary"
              onPress={handleScanLabel}
              loading={ocrLoading}
              style={styles.ocrBtn}
            />
            {ocrWarning ? <Text style={styles.ocrWarning}>{ocrWarning}</Text> : null}
            {ocrError ? <Text style={styles.ocrError}>{ocrError}</Text> : null}

            <Input
              label="Product Name"
              value={form.name}
              onChangeText={updateField('name')}
              placeholder="Product name"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={styles.nameInput}
            />

            {/* --- Pricing Section --- */}
            <Text style={styles.sectionLabel}>PRICING</Text>
            <View style={styles.fieldRow}>
              <View style={styles.fieldThird}>
                <Input
                  label="Sell Price"
                  value={form.sellingPrice}
                  onChangeText={updateField('sellingPrice')}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.fieldThird}>
                <Input
                  label="MRP"
                  value={form.mrp}
                  onChangeText={updateField('mrp')}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.fieldThird}>
                <Input
                  label="Cost Price"
                  value={form.purchasePrice}
                  onChangeText={updateField('purchasePrice')}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {marginInfo ? (
              <Text style={styles.marginText}>
                Margin: Rs {marginInfo.margin.toFixed(2)} ({marginInfo.pct.toFixed(1)}%)
              </Text>
            ) : null}

            {/* --- Quantity Section --- */}
            <Text style={styles.sectionLabel}>QUANTITY</Text>
            <View style={styles.fieldRow}>
              <View style={styles.fieldThird}>
                <Input
                  label="Boxes"
                  value={form.numBoxes}
                  onChangeText={updateField('numBoxes')}
                  placeholder="1"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.fieldThird}>
                <Input
                  label="Strips/Box"
                  value={form.stripsPerBox}
                  onChangeText={updateField('stripsPerBox')}
                  placeholder="1"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.fieldThird}>
                <Input
                  label="Tabs/Strip"
                  value={form.tabletsPerStrip}
                  onChangeText={updateField('tabletsPerStrip')}
                  placeholder="1"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={styles.totalUnitsText}>
              Total units: {totalUnits}
              {unitPrice ? `  •  Rs ${unitPrice}/unit` : ''}
            </Text>

            {/* --- Batch & Expiry --- */}
            <Text style={styles.sectionLabel}>BATCH & EXPIRY</Text>
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Input
                  label="Batch"
                  value={form.batchNo}
                  onChangeText={updateField('batchNo')}
                  placeholder="Batch"
                />
              </View>
              <View style={styles.fieldHalf}>
                <Input
                  label="Expiry"
                  value={form.expiry}
                  onChangeText={updateField('expiry')}
                  placeholder="MM/YYYY"
                />
              </View>
            </View>

            {/* --- Low Stock Alert --- */}
            <Input
              label="Low Stock Alert"
              value={form.reorderLevel}
              onChangeText={updateField('reorderLevel')}
              placeholder="Alert when stock falls below..."
              keyboardType="numeric"
            />

            {/* --- Dealer Name --- */}
            <Input
              label="Dealer Name"
              value={form.dealerName}
              onChangeText={updateField('dealerName')}
              placeholder="Dealer name"
            />

            {/* --- Barcode --- */}
            <Text style={styles.sectionLabel}>BARCODE</Text>
            <View style={styles.barcodeRow}>
              <Input
                value={form.barcode}
                onChangeText={(v) => {
                  if (lockBarcode) return;
                  setForm((f) => ({ ...f, barcode: v }));
                  if (formError) setFormError('');
                }}
                placeholder="Scan or enter barcode"
                autoCapitalize="characters"
                editable={!lockBarcode}
                style={[styles.barcodeInput, lockBarcode && styles.readOnlyInput]}
              />
              {!lockBarcode ? (
                <Button
                  title="Generate"
                  variant="secondary"
                  onPress={generateBarcode}
                  loading={generatingBarcode}
                  style={styles.generateBtn}
                />
              ) : null}
            </View>

            {/* --- Category --- */}
            <Input
              label="Category"
              value={form.category}
              onChangeText={updateField('category')}
              placeholder="e.g. Medicine, Grocery"
            />

            {filteredSuggestions.length > 0 ? (
              <View style={styles.suggestionRow}>
                {filteredSuggestions.map((category) => (
                  <Pressable
                    key={category}
                    style={styles.suggestionChip}
                    onPress={() => setForm((f) => ({ ...f, category }))}>
                    <Text style={styles.suggestionText}>{category}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}

            <Button title={submitLabel} onPress={save} loading={saving} />
            <Button title="Cancel" variant="ghost" onPress={onClose} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kavWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
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
    marginBottom: spacing.sm,
  },
  hint: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontFamily: font.semiBold,
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldHalf: {
    flex: 1,
  },
  fieldThird: {
    flex: 1,
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  barcodeInput: {
    flex: 1,
    marginBottom: 0,
  },
  readOnlyInput: {
    opacity: 0.85,
  },
  generateBtn: {
    minWidth: 100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    minHeight: 48,
  },
  ocrBtn: {
    marginBottom: spacing.xs,
  },
  ocrWarning: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  ocrError: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  nameInput: {
    minHeight: 72,
  },
  marginText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.success,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  totalUnitsText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.primary[700],
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface[100],
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  formError: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.md,
  },
});
