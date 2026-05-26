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

type PricingUnit = 'strip' | 'box' | 'tablet';
const UNIT_LABELS: Record<PricingUnit, string> = { strip: 'Strip', box: 'Box', tablet: 'Tablet' };

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
  pricingUnit: PricingUnit;
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
  pricingUnit: 'strip',
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
  const [sellManuallyEdited, setSellManuallyEdited] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);

  const sheetTitle = title ?? (fromSale ? 'New product from scan' : 'New product');
  const filteredSuggestions = useMemo(() => {
    const q = form.category.trim().toLowerCase();
    return categorySuggestions.filter((c) => !q || c.toLowerCase().includes(q)).slice(0, 8);
  }, [categorySuggestions, form.category]);

  const boxes = Math.max(1, parseInt(form.numBoxes) || 1);
  const strips = Math.max(1, parseInt(form.stripsPerBox) || 1);
  const tabs = Math.max(1, parseInt(form.tabletsPerStrip) || 1);
  const totalTablets = boxes * strips * tabs;

  const mrpNum = parseFloat(form.mrp) || 0;
  const costNum = parseFloat(form.purchasePrice) || 0;
  const sellNum = parseFloat(form.sellingPrice) || 0;

  const unitMultiplier = useMemo(() => {
    if (form.pricingUnit === 'tablet') return 1;
    if (form.pricingUnit === 'strip') return tabs;
    return strips * tabs; // box
  }, [form.pricingUnit, tabs, strips]);

  const calcPrices = useMemo(() => {
    const perTab = mrpNum > 0 ? mrpNum / unitMultiplier : 0;
    const costPerTab = costNum > 0 ? costNum / unitMultiplier : 0;
    const sellPerTab = sellNum > 0 ? sellNum / unitMultiplier : 0;
    const profitPerTab = sellPerTab - costPerTab;

    const perStrip = perTab * tabs;
    const perBox = perTab * strips * tabs;

    return { perTab, costPerTab, sellPerTab, profitPerTab, perStrip, perBox };
  }, [mrpNum, costNum, sellNum, unitMultiplier, tabs, strips]);

  const sellExceedsMrp = sellNum > 0 && mrpNum > 0 && sellNum > mrpNum;

  useEffect(() => {
    if (!visible) {
      setForm(emptyForm);
      setFormError('');
      setSellManuallyEdited(false);
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
    setSellManuallyEdited(false);
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

  function handleMrpChange(v: string) {
    setForm((f) => {
      const updated = { ...f, mrp: v };
      if (!sellManuallyEdited) {
        updated.sellingPrice = v;
      }
      return updated;
    });
    if (formError) setFormError('');
  }

  function handleSellChange(v: string) {
    setSellManuallyEdited(true);
    setForm((f) => ({ ...f, sellingPrice: v }));
    if (formError) setFormError('');
  }

  async function save() {
    const name = form.name.trim();
    const barcode = form.barcode.trim();
    const price = sellNum || mrpNum;

    if (!name || !barcode) {
      setFormError('Name and barcode are required');
      return;
    }
    if (price <= 0 && costNum <= 0) {
      setFormError('At least one price is required');
      return;
    }

    const numBoxes = boxes;
    const stripsPerBox = strips;
    const tabletsPerStrip = tabs;
    const openingQuantity = totalTablets;
    const reorderLevel = form.reorderLevel.trim() ? Math.max(0, parseInt(form.reorderLevel) || 0) : 0;

    // Convert prices to per-tablet for storage (normalize)
    const mrpPerTab = mrpNum > 0 ? mrpNum / unitMultiplier : 0;
    const sellPerTab = sellNum > 0 ? sellNum / unitMultiplier : 0;
    const costPerTab = costNum > 0 ? costNum / unitMultiplier : 0;

    // Store as per-strip prices (what backend expects for display)
    const storedMrp = mrpPerTab * tabs;
    const storedSell = sellPerTab * tabs;
    const storedCost = costPerTab * tabs;

    setFormError('');
    setSaving(true);
    try {
      const product = await api.products.create({
        barcode,
        name,
        price: storedSell || storedMrp || storedCost,
        mrp: storedMrp || undefined,
        sellingPrice: storedSell || undefined,
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
        costPrice: storedCost || undefined,
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
        style={st.kavWrapper}>
        <Pressable style={st.backdrop} onPress={onClose} />
        <View style={[st.sheet, { paddingBottom: spacing.xl + insets.bottom }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={st.title}>{sheetTitle}</Text>

            {fromSale ? (
              <Text style={st.hint}>Barcode not found. Scan the label — AI will suggest the product name.</Text>
            ) : (
              <Text style={st.hint}>Scan the label — AI will suggest the product name. Edit if needed.</Text>
            )}

            <Button title="Scan label" variant="secondary" onPress={handleScanLabel} loading={ocrLoading} style={st.ocrBtn} />
            {ocrWarning ? <Text style={st.ocrWarning}>{ocrWarning}</Text> : null}
            {ocrError ? <Text style={st.ocrError}>{ocrError}</Text> : null}

            <Input
              label="Product Name"
              value={form.name}
              onChangeText={updateField('name')}
              placeholder="Product name"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={st.nameInput}
            />

            {/* --- Packaging --- */}
            <Text style={st.secLabel}>PACKAGING</Text>
            <View style={st.pkgLabelRow}>
              <Text style={st.pkgLabel}>Boxes</Text>
              <Text style={st.pkgLabel}>Strips in 1 Box</Text>
              <Text style={st.pkgLabel}>Tablets in 1 Strip</Text>
            </View>
            <View style={st.row3}>
              <View style={st.col}><Input value={form.numBoxes} onChangeText={updateField('numBoxes')} placeholder="1" keyboardType="numeric" /></View>
              <View style={st.col}><Input value={form.stripsPerBox} onChangeText={updateField('stripsPerBox')} placeholder="1" keyboardType="numeric" /></View>
              <View style={st.col}><Input value={form.tabletsPerStrip} onChangeText={updateField('tabletsPerStrip')} placeholder="1" keyboardType="numeric" /></View>
            </View>

            {/* --- Pricing --- */}
            <Text style={st.secLabel}>PRICING</Text>

            {/* Unit selector */}
            <View style={st.unitRow}>
              <Text style={st.unitLabel}>Prices are per</Text>
              <View style={st.unitPills}>
                {(['strip', 'box', 'tablet'] as PricingUnit[]).map((u) => (
                  <Pressable key={u} onPress={() => setForm((f) => ({ ...f, pricingUnit: u }))} style={[st.unitPill, form.pricingUnit === u && st.unitPillActive]}>
                    <Text style={[st.unitPillText, form.pricingUnit === u && st.unitPillTextActive]}>{UNIT_LABELS[u]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Price inputs in table-like layout */}
            <View style={st.priceRow}>
              <Text style={st.priceLabel}>MRP</Text>
              <View style={st.priceInputWrap}>
                <Input value={form.mrp} onChangeText={handleMrpChange} placeholder="100" keyboardType="decimal-pad" />
              </View>
              <Text style={st.priceUnit}>/{UNIT_LABELS[form.pricingUnit]}</Text>
            </View>
            <View style={st.priceRow}>
              <Text style={st.priceLabel}>Sell Price</Text>
              <View style={st.priceInputWrap}>
                <Input value={form.sellingPrice} onChangeText={handleSellChange} placeholder="95" keyboardType="decimal-pad" />
              </View>
              <Text style={st.priceUnit}>/{UNIT_LABELS[form.pricingUnit]}</Text>
            </View>
            <View style={st.priceRow}>
              <Text style={st.priceLabel}>Cost Price</Text>
              <View style={st.priceInputWrap}>
                <Input value={form.purchasePrice} onChangeText={updateField('purchasePrice')} placeholder="87.80" keyboardType="decimal-pad" />
              </View>
              <Text style={st.priceUnit}>/{UNIT_LABELS[form.pricingUnit]}</Text>
            </View>

            {sellExceedsMrp ? (
              <View style={st.warnBox}>
                <Text style={st.warnText}>⚠ Selling price is higher than MRP</Text>
              </View>
            ) : null}

            {/* Auto-calculated */}
            {(mrpNum > 0 || costNum > 0) && totalTablets > 1 ? (
              <View style={st.calcBox}>
                <Text style={st.calcTitle}>Auto Calculated</Text>
                <View style={st.calcGrid}>
                  <Text style={st.calcItem}>Total Tablets: <Text style={st.calcBold}>{totalTablets}</Text></Text>
                  {calcPrices.perTab > 0 ? <Text style={st.calcItem}>MRP/Tablet: <Text style={st.calcBold}>₹{calcPrices.perTab.toFixed(2)}</Text></Text> : null}
                  {calcPrices.costPerTab > 0 ? <Text style={st.calcItem}>Cost/Tablet: <Text style={st.calcBold}>₹{calcPrices.costPerTab.toFixed(2)}</Text></Text> : null}
                  {calcPrices.profitPerTab > 0 ? <Text style={[st.calcItem, { color: colors.success }]}>Profit/Tablet: <Text style={st.calcBold}>₹{calcPrices.profitPerTab.toFixed(2)}</Text></Text> : null}
                  {form.pricingUnit !== 'box' && calcPrices.perBox > 0 ? <Text style={st.calcItem}>MRP/Box: <Text style={st.calcBold}>₹{calcPrices.perBox.toFixed(2)}</Text></Text> : null}
                </View>
              </View>
            ) : null}

            {/* --- Batch & Expiry --- */}
            <Text style={st.secLabel}>BATCH & EXPIRY</Text>
            <View style={st.row2}>
              <View style={st.col}><Input label="Batch" value={form.batchNo} onChangeText={updateField('batchNo')} placeholder="Batch" /></View>
              <View style={st.col}><Input label="Expiry" value={form.expiry} onChangeText={updateField('expiry')} placeholder="MM/YYYY" /></View>
            </View>

            <Input label="Low Stock Alert" value={form.reorderLevel} onChangeText={updateField('reorderLevel')} placeholder="Alert when stock falls below..." keyboardType="numeric" />
            <Input label="Dealer Name" value={form.dealerName} onChangeText={updateField('dealerName')} placeholder="Dealer name" />

            <Text style={st.secLabel}>BARCODE</Text>
            <View style={st.barcodeRow}>
              <Input
                value={form.barcode}
                onChangeText={(v) => { if (lockBarcode) return; setForm((f) => ({ ...f, barcode: v })); if (formError) setFormError(''); }}
                placeholder="Scan or enter barcode"
                autoCapitalize="characters"
                editable={!lockBarcode}
                style={[st.barcodeInput, lockBarcode && st.readOnly]}
              />
              {!lockBarcode ? (
                <Button title="Generate" variant="secondary" onPress={generateBarcode} loading={generatingBarcode} style={st.genBtn} />
              ) : null}
            </View>

            <Input label="Category" value={form.category} onChangeText={updateField('category')} placeholder="e.g. Medicine, Grocery" />

            {filteredSuggestions.length > 0 ? (
              <View style={st.suggRow}>
                {filteredSuggestions.map((c) => (
                  <Pressable key={c} style={st.suggChip} onPress={() => setForm((f) => ({ ...f, category: c }))}>
                    <Text style={st.suggText}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {formError ? <Text style={st.formError}>{formError}</Text> : null}

            <Button title={submitLabel} onPress={save} loading={saving} />
            <Button title="Cancel" variant="ghost" onPress={onClose} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const AMBER_BG = '#fffbeb';

const st = StyleSheet.create({
  kavWrapper: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '90%' },
  title: { fontFamily: font.bold, fontSize: 20, color: colors.text, marginBottom: spacing.sm },
  hint: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  secLabel: { fontFamily: font.semiBold, fontSize: 11, color: colors.textMuted, letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.xs },
  row3: { flexDirection: 'row', gap: spacing.sm },
  row2: { flexDirection: 'row', gap: spacing.sm },
  col: { flex: 1 },
  pkgLabelRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 4 },
  pkgLabel: { flex: 1, fontFamily: font.semiBold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Unit selector
  unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, marginTop: 4 },
  unitLabel: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
  unitPills: { flexDirection: 'row', backgroundColor: colors.surface[100], borderRadius: 8, padding: 2 },
  unitPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
  unitPillActive: { backgroundColor: colors.primary[600] },
  unitPillText: { fontFamily: font.semiBold, fontSize: 12, color: colors.textMuted },
  unitPillTextActive: { color: colors.white },

  // Price rows
  priceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: spacing.sm },
  priceLabel: { fontFamily: font.medium, fontSize: 13, color: colors.text, width: 72 },
  priceInputWrap: { flex: 1 },
  priceUnit: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, width: 55 },

  // Warning
  warnBox: { backgroundColor: AMBER_BG, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginBottom: spacing.sm },
  warnText: { fontFamily: font.medium, fontSize: 12, color: '#b45309' },

  // Calc box
  calcBox: { backgroundColor: colors.surface[50], borderRadius: 10, padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  calcTitle: { fontFamily: font.semiBold, fontSize: 11, color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.xs },
  calcGrid: { gap: 2 },
  calcItem: { fontFamily: font.regular, fontSize: 12, color: colors.text },
  calcBold: { fontFamily: font.semiBold },

  ocrBtn: { marginBottom: spacing.xs },
  ocrWarning: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
  ocrError: { fontFamily: font.regular, fontSize: 13, color: colors.danger, marginBottom: spacing.sm },
  nameInput: { minHeight: 72 },

  barcodeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  barcodeInput: { flex: 1, marginBottom: 0 },
  readOnly: { opacity: 0.85 },
  genBtn: { minWidth: 100, paddingHorizontal: spacing.sm, paddingVertical: 12, minHeight: 48 },
  suggRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  suggChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface[100], borderWidth: 1, borderColor: colors.border },
  suggText: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
  formError: { fontFamily: font.regular, fontSize: 13, color: colors.danger, marginBottom: spacing.md },
});
