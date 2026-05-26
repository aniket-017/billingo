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

let recognizeText: ((uri: string) => Promise<unknown>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mlkit = require('@infinitered/react-native-mlkit-text-recognition');
  recognizeText = mlkit.recognizeText;
} catch {
  // ML Kit unavailable (Expo Go)
}

type OcrBlock = { text: string; lines: { text: string; frame: { top: number; left: number } }[] };
type OcrResult = { text: string; blocks: OcrBlock[] };

function extractFullText(result: OcrResult): string {
  const full = result.text?.trim();
  if (full) return full;
  const lines: { text: string; top: number; left: number }[] = [];
  for (const block of result.blocks ?? []) {
    for (const line of block.lines ?? []) {
      lines.push({ text: line.text, top: line.frame.top, left: line.frame.left });
    }
  }
  lines.sort((a, b) => a.top - b.top || a.left - b.left);
  return lines.map((l) => l.text.trim()).join('\n');
}

type EditableRow = ParsedInvoiceProduct & {
  key: string;
  numBoxes: number;
  stripsPerBox: number;
  tabletsPerStrip: number;
  reorderLevel: number;
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

      const ocrResult = (await recognizeText(result.assets[0].uri)) as OcrResult;
      const fullText = extractFullText(ocrResult);

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
        packSize: p.packSize > 1 ? p.packSize : 1,
        numBoxes: 1,
        stripsPerBox: 1,
        tabletsPerStrip: p.packSize > 1 ? p.packSize : 1,
        reorderLevel: 0,
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
          category: 'Medicine',
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

  function renderProductCard({ item }: { item: EditableRow }) {
    const totalUnits = Math.max(1, item.numBoxes) * Math.max(1, item.stripsPerBox) * Math.max(1, item.tabletsPerStrip);
    const effectivePrice = item.sellingPrice > 0 ? item.sellingPrice : item.mrp;
    const perUnit = totalUnits > 1 && effectivePrice > 0
      ? (effectivePrice / totalUnits).toFixed(2)
      : null;

    const marginInfo = item.mrp > 0 && item.rate > 0
      ? { margin: item.mrp - item.rate, pct: ((item.mrp - item.rate) / item.mrp) * 100 }
      : null;

    return (
      <View style={styles.card}>
        <Pressable style={styles.removeBtn} onPress={() => removeRow(item.key)}>
          <Ionicons name="close-circle" size={22} color={colors.danger} />
        </Pressable>

        <Input
          label="Product Name"
          value={item.name}
          onChangeText={(v) => updateRow(item.key, 'name', v)}
          placeholder="Product name"
        />

        {/* Pricing */}
        <Text style={styles.sectionLabel}>PRICING</Text>
        <View style={styles.fieldRow}>
          <View style={styles.fieldThird}>
            <Input
              label="Sell Price"
              value={item.sellingPrice ? String(item.sellingPrice) : ''}
              onChangeText={(v) => updateRow(item.key, 'sellingPrice', parseFloat(v) || 0)}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
          </View>
          <View style={styles.fieldThird}>
            <Input
              label="MRP"
              value={item.mrp ? String(item.mrp) : ''}
              onChangeText={(v) => updateRow(item.key, 'mrp', parseFloat(v) || 0)}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
          </View>
          <View style={styles.fieldThird}>
            <Input
              label="Cost Price"
              value={item.rate ? String(item.rate) : ''}
              onChangeText={(v) => updateRow(item.key, 'rate', parseFloat(v) || 0)}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
          </View>
        </View>

        {marginInfo ? (
          <Text style={styles.marginText}>
            Margin: Rs {marginInfo.margin.toFixed(2)} ({marginInfo.pct.toFixed(1)}%)
          </Text>
        ) : null}

        {/* Quantity */}
        <Text style={styles.sectionLabel}>QUANTITY</Text>
        <View style={styles.fieldRow}>
          <View style={styles.fieldThird}>
            <Input
              label="Boxes"
              value={String(item.numBoxes)}
              onChangeText={(v) => updateRow(item.key, 'numBoxes', Math.max(1, parseInt(v) || 1))}
              keyboardType="numeric"
              placeholder="1"
            />
          </View>
          <View style={styles.fieldThird}>
            <Input
              label="Strips/Box"
              value={String(item.stripsPerBox)}
              onChangeText={(v) => updateRow(item.key, 'stripsPerBox', Math.max(1, parseInt(v) || 1))}
              keyboardType="numeric"
              placeholder="1"
            />
          </View>
          <View style={styles.fieldThird}>
            <Input
              label="Tabs/Strip"
              value={String(item.tabletsPerStrip)}
              onChangeText={(v) => updateRow(item.key, 'tabletsPerStrip', Math.max(1, parseInt(v) || 1))}
              keyboardType="numeric"
              placeholder="1"
            />
          </View>
        </View>

        <Text style={styles.totalUnitsText}>
          Total units: {totalUnits}
          {perUnit ? `  •  Rs ${perUnit}/unit` : ''}
        </Text>

        {/* Batch & Expiry */}
        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Input
              label="Batch"
              value={item.batchNo}
              onChangeText={(v) => updateRow(item.key, 'batchNo', v)}
              placeholder="Batch"
            />
          </View>
          <View style={styles.fieldHalf}>
            <Input
              label="Expiry"
              value={item.expiry}
              onChangeText={(v) => updateRow(item.key, 'expiry', v)}
              placeholder="MM/YYYY"
            />
          </View>
        </View>

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
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Bulk Import</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        {/* Step: Capture */}
        {step === 'capture' && (
          <View style={styles.captureContainer}>
            <View style={styles.captureIcon}>
              <Ionicons name="document-text-outline" size={64} color={colors.primary[500]} />
            </View>
            <Text style={styles.captureTitle}>Import from Invoice</Text>
            <Text style={styles.captureDesc}>
              Take a photo or pick an image of a supplier invoice, purchase bill, or stock sheet.
              AI will extract all products automatically.
            </Text>

            <Button
              title="Take Photo"
              onPress={() => pickImage('camera')}
              style={styles.captureBtn}
            />
            <Button
              title="Pick from Gallery"
              variant="secondary"
              onPress={() => pickImage('gallery')}
              style={styles.captureBtn}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={styles.processingText}>{processingStatus}</Text>
          </View>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <KeyboardAvoidingView
            style={styles.reviewContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top + 60}
          >
            <View style={styles.reviewHeader}>
              <Text style={styles.reviewCount}>
                {rows.length} product{rows.length !== 1 ? 's' : ''} found
              </Text>
              <Pressable onPress={() => { reset(); setStep('capture'); }}>
                <Text style={styles.rescanText}>Re-scan</Text>
              </Pressable>
            </View>

            {/* Shared dealer name */}
            <View style={styles.dealerRow}>
              <Input
                label="Dealer Name"
                value={dealerName}
                onChangeText={setDealerName}
                placeholder="Dealer name (applies to all products)"
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <FlatList
              data={rows}
              renderItem={renderProductCard}
              keyExtractor={(item) => item.key}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={
                <Pressable style={styles.addRowBtn} onPress={addEmptyRow}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary[600]} />
                  <Text style={styles.addRowText}>Add product manually</Text>
                </Pressable>
              }
            />

            <View style={styles.bottomBar}>
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
          <View style={styles.processingContainer}>
            {saveResult ? (
              <>
                <Ionicons name="checkmark-circle" size={64} color={colors.success} />
                <Text style={styles.doneTitle}>Import Complete</Text>
                <Text style={styles.doneDesc}>
                  {saveResult.created} product{saveResult.created !== 1 ? 's' : ''} imported
                  {saveResult.skipped > 0
                    ? ` (${saveResult.skipped} skipped as duplicates)`
                    : ''}
                </Text>
                <Button title="Done" onPress={handleClose} style={styles.doneBtn} />
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color={colors.primary[600]} />
                <Text style={styles.processingText}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 20,
    color: colors.text,
  },

  captureContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  captureIcon: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  captureTitle: {
    fontFamily: font.bold,
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  captureDesc: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  captureBtn: {
    marginBottom: spacing.sm,
  },

  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  processingText: {
    fontFamily: font.medium,
    fontSize: 16,
    color: colors.textMuted,
    marginTop: spacing.lg,
    textAlign: 'center',
  },

  reviewContainer: {
    flex: 1,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  reviewCount: {
    fontFamily: font.semiBold,
    fontSize: 16,
    color: colors.text,
  },
  rescanText: {
    fontFamily: font.medium,
    fontSize: 14,
    color: colors.primary[600],
  },
  dealerRow: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 100,
  },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  removeBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 1,
    padding: 4,
  },
  sectionLabel: {
    fontFamily: font.semiBold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.sm,
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
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  addRowText: {
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.primary[600],
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  doneTitle: {
    fontFamily: font.bold,
    fontSize: 22,
    color: colors.text,
    marginTop: spacing.lg,
  },
  doneDesc: {
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  doneBtn: {
    marginTop: spacing.xl,
    minWidth: 160,
  },

  errorText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
