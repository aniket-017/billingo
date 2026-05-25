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
};

type FormState = {
  barcode: string;
  name: string;
  price: string;
  openingQuantity: string;
  category: string;
  unit: string;
};

const emptyForm: FormState = {
  barcode: '',
  name: '',
  price: '',
  openingQuantity: '',
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
    });
    if (autoGenerateBarcode && !initialBarcode) {
      generateBarcode();
    }
  }, [visible, initialBarcode, initialName, autoGenerateBarcode]);

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
    const price = parseFloat(form.price);
    if (!name || !barcode || Number.isNaN(price)) {
      setFormError('Name, barcode and price are required');
      return;
    }
    if (price < 0) {
      setFormError('Price must be zero or more');
      return;
    }
    const openingQuantity = form.openingQuantity.trim()
      ? Math.max(0, parseFloat(form.openingQuantity))
      : 0;
    if (form.openingQuantity.trim() && Number.isNaN(openingQuantity)) {
      setFormError('Opening stock must be a number');
      return;
    }

    setFormError('');
    setSaving(true);
    try {
      const product = await api.products.create({
        barcode,
        name,
        price,
        unit: form.unit.trim() || 'pcs',
        category: form.category.trim(),
        openingQuantity,
      });
      onSaved?.(product);
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.modalSheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>{sheetTitle}</Text>

            {fromSale ? (
              <Text style={styles.hint}>
                Barcode not found. Scan the label — AI will suggest the product name. Add price and stock.
              </Text>
            ) : (
              <Text style={styles.hint}>
                Scan the label — AI will suggest the product name. Edit if needed.
              </Text>
            )}

            <Text style={styles.fieldLabel}>Barcode</Text>
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
              label="Name"
              value={form.name}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, name: v }));
                if (formError) setFormError('');
              }}
              placeholder="Product name"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={styles.nameInput}
            />

            <Input
              label="Price (₹)"
              value={form.price}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, price: v }));
                if (formError) setFormError('');
              }}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />

            <Input
              label="Opening stock"
              value={form.openingQuantity}
              onChangeText={(v) => setForm((f) => ({ ...f, openingQuantity: v }))}
              placeholder="0"
              keyboardType="number-pad"
            />

            <Input
              label="Category"
              value={form.category}
              onChangeText={(v) => setForm((f) => ({ ...f, category: v }))}
              placeholder="e.g. Books, Grocery"
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: '92%',
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
  fieldLabel: {
    fontSize: 14,
    fontFamily: font.medium,
    color: colors.text,
    marginBottom: spacing.xs,
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
  nameInput: {
    minHeight: 96,
  },
  ocrError: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.danger,
    marginBottom: spacing.sm,
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
