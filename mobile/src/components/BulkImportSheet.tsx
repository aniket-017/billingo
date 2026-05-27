import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { api, type ParsedInvoiceProduct } from '@/src/api/client';
import Button from '@/src/components/Button';
import Input from '@/src/components/Input';
import { colors, font, radius, spacing } from '@/src/theme';
import { extractInvoiceOcrText, type InvoiceOcrResult } from '@/src/utils/extractInvoiceOcrText';

let recognizeText: ((uri: string) => Promise<unknown>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mlkit = require('@infinitered/react-native-mlkit-text-recognition');
  recognizeText = mlkit.recognizeText;
} catch {
  // ML Kit unavailable (Expo Go)
}

type PricingUnit = 'strip' | 'box' | 'tablet';
const UNIT_LABELS: Record<PricingUnit, string> = { strip: 'Strip', box: 'Box', tablet: 'Tablet' };

type EditableRow = ParsedInvoiceProduct & {
  key: string;
  numBoxes: number;
  stripsPerBox: number;
  tabletsPerStrip: number;
  reorderLevel: number;
  pricingUnit: PricingUnit;
};

let keyCounter = 0;
function nextKey(): string {
  return `row_${++keyCounter}`;
}

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
  onSaved?: () => void;
};

type Step = 'capture' | 'processing' | 'review' | 'saving';

export default function BulkImportSheet({ visible, onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('capture');
  const [processingStatus, setProcessingStatus] = useState('');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [dealerName, setDealerName] = useState('');
  const [error, setError] = useState('');
  const [saveResult, setSaveResult] = useState<{ created: number; skipped: number } | null>(null);

  const reset = useCallback(() => {
    setStep('capture');
    setProcessingStatus('');
    setRows([]);
    setDealerName('');
    setError('');
    setSaveResult(null);
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  async function pickImage(source: 'camera' | 'gallery') {
    setError('');
    try {
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setStep('processing');
      setProcessingStatus('Running OCR on image...');

      if (!recognizeText) {
        setError('OCR is unavailable in Expo Go. Use a dev build.');
        setStep('capture');
        return;
      }

      const ocrResult = (await recognizeText(result.assets[0].uri)) as InvoiceOcrResult;
      const fullText = extractInvoiceOcrText(ocrResult);

      if (!fullText) {
        setError('Could not read any text from the image. Try a clearer photo.');
        setStep('capture');
        return;
      }

      setProcessingStatus('AI is extracting products...');

      const parseResult = await api.products.parseInvoice(fullText);

      if (!parseResult.products || parseResult.products.length === 0) {
        setError('No products could be detected. Try a clearer photo or add manually.');
        setStep('capture');
        return;
      }

      if (parseResult.dealerName) {
        setDealerName(parseResult.dealerName);
      }

      const editableRows: EditableRow[] = parseResult.products.map((p) => ({
        ...p,
        sellingPrice: p.sellingPrice > 0 ? p.sellingPrice : p.mrp,
        packSize: p.packSize > 1 ? p.packSize : 1,
        numBoxes: 1,
        stripsPerBox: 1,
        tabletsPerStrip: p.packSize > 1 ? p.packSize : 1,
        reorderLevel: 0,
        pricingUnit: 'strip' as PricingUnit,
        category: p.category || 'General',
        key: nextKey(),
      }));

      setRows(editableRows);
      setStep('review');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to process image';
      setError(msg);
      setStep('capture');
    }
  }

  function updateRow(key: string, field: string, value: string | number) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    );
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function addEmptyRow() {
    setRows((prev) => [
      ...prev,
      {
        key: nextKey(),
        name: '',
        qty: 0,
        rate: 0,
        mrp: 0,
        sellingPrice: 0,
        batchNo: '',
        expiry: '',
        packSize: 1,
        numBoxes: 1,
        stripsPerBox: 1,
        tabletsPerStrip: 1,
        reorderLevel: 0,
        pricingUnit: 'strip' as PricingUnit,
        category: 'General',
      },
    ]);
  }

  function isRowValid(r: EditableRow): boolean {
    return Boolean(r.name.trim()) && (r.mrp > 0 || r.rate > 0 || r.sellingPrice > 0);
  }

  async function handleSave() {
    const valid = rows.filter(isRowValid);
    if (valid.length === 0) {
      setError('No valid products to import. Each needs a name and at least one price.');
      return;
    }

    setStep('saving');
    setError('');

    try {
      const payload = valid.map((r) => {
        const price = r.sellingPrice > 0 ? r.sellingPrice : (r.mrp > 0 ? r.mrp : r.rate);
        return {
          name: r.name.trim(),
          price,
          mrp: r.mrp > 0 ? r.mrp : undefined,
          sellingPrice: r.sellingPrice > 0 ? r.sellingPrice : undefined,
          unit: 'pcs' as const,
          batchNo: r.batchNo,
          expiryDate: parseExpiryToDate(r.expiry) || undefined,
          packSize: Math.max(1, r.stripsPerBox * r.tabletsPerStrip),
          numBoxes: Math.max(1, r.numBoxes),
          stripsPerBox: Math.max(1, r.stripsPerBox),
          tabletsPerStrip: Math.max(1, r.tabletsPerStrip),
          openingQuantity: Math.max(1, r.numBoxes) * Math.max(1, r.stripsPerBox) * Math.max(1, r.tabletsPerStrip),
          reorderLevel: r.reorderLevel > 0 ? r.reorderLevel : undefined,
          costPrice: r.rate > 0 ? r.rate : undefined,
          dealerName: dealerName.trim() || undefined,
          category: r.category?.trim() || 'General',
        };
      });

      const result = await api.products.bulkCreate(payload);
      setSaveResult({
        created: result.created.length,
        skipped: result.skipped.length,
      });
      onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setError(msg);
      setStep('review');
    }
  }

  function renderProductCard({ item, index }: { item: EditableRow; index: number }) {
    const totalUnits = Math.max(1, item.numBoxes) * Math.max(1, item.stripsPerBox) * Math.max(1, item.tabletsPerStrip);
    const effectivePrice = item.sellingPrice > 0 ? item.sellingPrice : item.mrp;
    const perUnit = totalUnits > 1 && effectivePrice > 0
      ? (effectivePrice / totalUnits).toFixed(2)
      : null;

    const marginInfo = item.mrp > 0 && item.rate > 0
      ? { margin: item.mrp - item.rate, pct: ((item.mrp - item.rate) / item.mrp) * 100 }
      : null;

    const tabs = Math.max(1, item.tabletsPerStrip);
    const strips = Math.max(1, item.stripsPerBox);
    const unitMul = item.pricingUnit === 'tablet' ? 1 : item.pricingUnit === 'strip' ? tabs : strips * tabs;
    const mrpNum = item.mrp || 0;
    const costNum = item.rate || 0;
    const sellNum = item.sellingPrice || 0;

    const showCalc = (mrpNum > 0 || costNum > 0) && totalUnits > 1;
    const perTab = mrpNum > 0 ? mrpNum / unitMul : 0;
    const costPerTab = costNum > 0 ? costNum / unitMul : 0;
    const sellPerTab = sellNum > 0 ? sellNum / unitMul : 0;
    const profitPerTab = sellPerTab - costPerTab;

    return (
      <View style={st.card}>
        <View style={st.cardHeader}>
          <View style={st.cardBadge}>
            <Text style={st.cardBadgeText}>{index + 1}</Text>
          </View>
          <Pressable style={st.removeBtn} onPress={() => removeRow(item.key)} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={colors.danger} />
          </Pressable>
        </View>

        {/* Product Name */}
        <Input
          label="Product Name"
          value={item.name}
          onChangeText={(v) => updateRow(item.key, 'name', v)}
          placeholder="Product name"
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          style={st.nameInput}
        />

        {/* Packaging */}
        <Text style={st.secLabel}>PACKAGING</Text>
        <View style={st.pkgLabelRow}>
          <Text style={st.pkgLabel}>Boxes</Text>
          <Text style={st.pkgLabel}>Strips in 1 Box</Text>
          <Text style={st.pkgLabel}>Tablets in 1 Strip</Text>
        </View>
        <View style={st.row3}>
          <View style={st.col}><Input value={item.numBoxes === 0 ? '' : String(item.numBoxes)} onChangeText={(v) => updateRow(item.key, 'numBoxes', v === '' ? 0 : (parseInt(v) || 0))} keyboardType="numeric" placeholder="1" /></View>
          <View style={st.col}><Input value={item.stripsPerBox === 0 ? '' : String(item.stripsPerBox)} onChangeText={(v) => updateRow(item.key, 'stripsPerBox', v === '' ? 0 : (parseInt(v) || 0))} keyboardType="numeric" placeholder="1" /></View>
          <View style={st.col}><Input value={item.tabletsPerStrip === 0 ? '' : String(item.tabletsPerStrip)} onChangeText={(v) => updateRow(item.key, 'tabletsPerStrip', v === '' ? 0 : (parseInt(v) || 0))} keyboardType="numeric" placeholder="1" /></View>
        </View>

        {/* Pricing */}
        <Text style={st.secLabel}>PRICING</Text>
        <View style={st.unitRow}>
          <Text style={st.unitLabel}>Prices per</Text>
          <View style={st.unitPills}>
            {(['strip', 'box', 'tablet'] as PricingUnit[]).map((u) => (
              <Pressable key={u} onPress={() => updateRow(item.key, 'pricingUnit', u)} style={[st.unitPill, item.pricingUnit === u && st.unitPillActive]}>
                <Text style={[st.unitPillText, item.pricingUnit === u && st.unitPillTextActive]}>{UNIT_LABELS[u]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={st.row3}>
          <View style={st.col}>
            <Input
              label={`MRP`}
              value={item.mrp ? String(item.mrp) : ''}
              onChangeText={(v) => {
                const val = parseFloat(v) || 0;
                updateRow(item.key, 'mrp', val);
                if (!(item.sellingPrice > 0) || item.sellingPrice === item.mrp) {
                  updateRow(item.key, 'sellingPrice', val);
                }
              }}
              keyboardType="decimal-pad"
              placeholder="100"
            />
          </View>
          <View style={st.col}>
            <Input
              label={`Sell`}
              value={item.sellingPrice ? String(item.sellingPrice) : ''}
              onChangeText={(v) => updateRow(item.key, 'sellingPrice', parseFloat(v) || 0)}
              keyboardType="decimal-pad"
              placeholder="95"
            />
          </View>
          <View style={st.col}>
            <Input
              label={`Cost`}
              value={item.rate ? String(item.rate) : ''}
              onChangeText={(v) => updateRow(item.key, 'rate', parseFloat(v) || 0)}
              keyboardType="decimal-pad"
              placeholder="87.80"
            />
          </View>
        </View>

        {item.sellingPrice > 0 && item.mrp > 0 && item.sellingPrice > item.mrp ? (
          <View style={st.warnBox}><Text style={st.warnText}>⚠ Selling price is higher than MRP</Text></View>
        ) : null}

        {marginInfo ? (
          <Text style={st.marginText}>
            Margin: ₹{marginInfo.margin.toFixed(2)} ({marginInfo.pct.toFixed(1)}%)
          </Text>
        ) : null}

        {/* Auto Calculated */}
        {showCalc ? (
          <View style={st.calcBox}>
            <Text style={st.calcTitle}>Auto Calculated</Text>
            <View style={st.calcGrid}>
              <Text style={st.calcItem}>Total Tablets: <Text style={st.calcBold}>{totalUnits}</Text></Text>
              {perTab > 0 ? <Text style={st.calcItem}>MRP/Tablet: <Text style={st.calcBold}>₹{perTab.toFixed(2)}</Text></Text> : null}
              {costPerTab > 0 ? <Text style={st.calcItem}>Cost/Tablet: <Text style={st.calcBold}>₹{costPerTab.toFixed(2)}</Text></Text> : null}
              {profitPerTab > 0 ? <Text style={[st.calcItem, { color: colors.success }]}>Profit/Tablet: <Text style={st.calcBold}>₹{profitPerTab.toFixed(2)}</Text></Text> : null}
            </View>
          </View>
        ) : (
          <Text style={st.totalText}>Total units: {totalUnits}{perUnit ? `  •  ₹${perUnit}/unit` : ''}</Text>
        )}

        {/* Batch & Expiry */}
        <View style={st.row2}>
          <View style={st.col}>
            <Input label="Batch" value={item.batchNo} onChangeText={(v) => updateRow(item.key, 'batchNo', v)} placeholder="Batch" />
          </View>
          <View style={st.col}>
            <Input label="Expiry" value={item.expiry} onChangeText={(v) => updateRow(item.key, 'expiry', v)} placeholder="MM/YYYY" />
          </View>
        </View>

        {/* Category */}
        <Input
          label="Category"
          value={item.category || ''}
          onChangeText={(v) => updateRow(item.key, 'category', v)}
          placeholder="e.g. Tablet, Syrup, Capsule"
        />

        {/* Low Stock */}
        <Input
          label="Low Stock Alert"
          value={item.reorderLevel ? String(item.reorderLevel) : ''}
          onChangeText={(v) => updateRow(item.key, 'reorderLevel', Math.max(0, parseInt(v) || 0))}
          keyboardType="numeric"
          placeholder="Alert when stock falls below..."
        />
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[st.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={st.header}>
          <Text style={st.title}>Bulk Import</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        {/* Step: Capture */}
        {step === 'capture' && (
          <View style={st.captureContainer}>
            <View style={st.captureIcon}>
              <Ionicons name="document-text-outline" size={64} color={colors.primary[500]} />
            </View>
            <Text style={st.captureTitle}>Import from Invoice</Text>
            <Text style={st.captureDesc}>
              Take a photo or pick an image of a supplier invoice, purchase bill, or stock sheet.
              AI will extract all products automatically.
            </Text>

            <Button title="Take Photo" onPress={() => pickImage('camera')} style={st.captureBtn} />
            <Button title="Pick from Gallery" variant="secondary" onPress={() => pickImage('gallery')} style={st.captureBtn} />

            {error ? <Text style={st.errorText}>{error}</Text> : null}
          </View>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <View style={st.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={st.processingText}>{processingStatus}</Text>
          </View>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <KeyboardAvoidingView
            style={st.reviewContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top + 60}
          >
            <View style={st.reviewHeader}>
              <Text style={st.reviewCount}>
                {rows.length} product{rows.length !== 1 ? 's' : ''} found
              </Text>
              <Pressable onPress={() => { reset(); setStep('capture'); }}>
                <Text style={st.rescanText}>Re-scan</Text>
              </Pressable>
            </View>

            <View style={st.dealerRow}>
              <Input
                label="Dealer Name"
                value={dealerName}
                onChangeText={setDealerName}
                placeholder="Dealer name (applies to all products)"
              />
            </View>

            {error ? <Text style={st.errorText}>{error}</Text> : null}

            <FlatList
              data={rows}
              renderItem={renderProductCard}
              keyExtractor={(item) => item.key}
              contentContainerStyle={st.listContent}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={
                <Pressable style={st.addRowBtn} onPress={addEmptyRow}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary[600]} />
                  <Text style={st.addRowText}>Add product manually</Text>
                </Pressable>
              }
            />

            <View style={st.bottomBar}>
              <Button
                title={`Import ${rows.filter(isRowValid).length} products`}
                onPress={handleSave}
                disabled={rows.filter(isRowValid).length === 0}
              />
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Step: Saving / Done */}
        {step === 'saving' && (
          <View style={st.centerContainer}>
            {saveResult ? (
              <>
                <Ionicons name="checkmark-circle" size={64} color={colors.success} />
                <Text style={st.doneTitle}>Import Complete</Text>
                <Text style={st.doneDesc}>
                  {saveResult.created} product{saveResult.created !== 1 ? 's' : ''} imported
                  {saveResult.skipped > 0 ? ` (${saveResult.skipped} skipped as duplicates)` : ''}
                </Text>
                <Button title="Done" onPress={handleClose} style={st.doneBtn} />
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color={colors.primary[600]} />
                <Text style={st.processingText}>
                  Saving {rows.filter(isRowValid).length} products...
                </Text>
              </>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface[50] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white },
  title: { fontFamily: font.bold, fontSize: 20, color: colors.text },

  captureContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  captureIcon: { alignItems: 'center', marginBottom: spacing.lg },
  captureTitle: { fontFamily: font.bold, fontSize: 22, color: colors.text, textAlign: 'center', marginBottom: spacing.sm },
  captureDesc: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  captureBtn: { marginBottom: spacing.sm },

  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  processingText: { fontFamily: font.medium, fontSize: 16, color: colors.textMuted, marginTop: spacing.lg, textAlign: 'center' },

  reviewContainer: { flex: 1 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  reviewCount: { fontFamily: font.semiBold, fontSize: 16, color: colors.text },
  rescanText: { fontFamily: font.medium, fontSize: 14, color: colors.primary[600] },
  dealerRow: { paddingHorizontal: spacing.md, marginBottom: spacing.xs },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 100 },

  // Card
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  cardBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' },
  cardBadgeText: { fontFamily: font.semiBold, fontSize: 12, color: colors.primary[700] },
  removeBtn: { padding: 4 },

  nameInput: { minHeight: 48 },

  secLabel: { fontFamily: font.semiBold, fontSize: 11, color: colors.textMuted, letterSpacing: 1, marginTop: spacing.sm, marginBottom: spacing.xs },
  row3: { flexDirection: 'row', gap: spacing.sm },
  row2: { flexDirection: 'row', gap: spacing.sm },
  col: { flex: 1 },
  pkgLabelRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 4 },
  pkgLabel: { flex: 1, fontFamily: font.semiBold, fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Unit selector
  unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, marginTop: 2 },
  unitLabel: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  unitPills: { flexDirection: 'row', backgroundColor: colors.surface[100], borderRadius: 8, padding: 2 },
  unitPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  unitPillActive: { backgroundColor: colors.primary[600] },
  unitPillText: { fontFamily: font.semiBold, fontSize: 11, color: colors.textMuted },
  unitPillTextActive: { color: colors.white },

  // Warning & margin
  warnBox: { backgroundColor: '#fffbeb', borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginBottom: spacing.xs },
  warnText: { fontFamily: font.medium, fontSize: 12, color: '#b45309' },
  marginText: { fontFamily: font.medium, fontSize: 12, color: colors.success, backgroundColor: '#f0fdf4', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 8, marginBottom: spacing.xs, overflow: 'hidden' },

  // Auto calc
  calcBox: { backgroundColor: colors.surface[50], borderRadius: 10, padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  calcTitle: { fontFamily: font.semiBold, fontSize: 11, color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.xs },
  calcGrid: { gap: 2 },
  calcItem: { fontFamily: font.regular, fontSize: 12, color: colors.text },
  calcBold: { fontFamily: font.semiBold },

  totalText: { fontFamily: font.medium, fontSize: 12, color: colors.primary[700], backgroundColor: colors.primary[50], paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 6, marginBottom: spacing.sm, overflow: 'hidden' },

  addRowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, marginTop: spacing.sm },
  addRowText: { fontFamily: font.medium, fontSize: 15, color: colors.primary[600] },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.md, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },

  doneTitle: { fontFamily: font.bold, fontSize: 22, color: colors.text, marginTop: spacing.lg },
  doneDesc: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  doneBtn: { marginTop: spacing.xl, minWidth: 160 },
  errorText: { fontFamily: font.regular, fontSize: 13, color: colors.danger, textAlign: 'center', marginVertical: spacing.sm, paddingHorizontal: spacing.lg },
});
