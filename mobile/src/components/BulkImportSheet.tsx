import { useCallback, useState } from 'react';
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

type EditableRow = ParsedInvoiceProduct & { key: string };

let keyCounter = 0;
function nextKey(): string {
  return `row_${++keyCounter}`;
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
  const [defaultPackSize, setDefaultPackSize] = useState('10');
  const [error, setError] = useState('');
  const [saveResult, setSaveResult] = useState<{ created: number; skipped: number } | null>(null);

  const reset = useCallback(() => {
    setStep('capture');
    setProcessingStatus('');
    setRows([]);
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

      const { products } = await api.products.parseInvoice(fullText);

      if (!products || products.length === 0) {
        setError('No products could be detected. Try a clearer photo or add manually.');
        setStep('capture');
        return;
      }

      const defPack = Math.max(1, parseInt(defaultPackSize) || 1);
      const editableRows: EditableRow[] = products.map((p) => ({
        ...p,
        packSize: p.packSize > 1 ? p.packSize : defPack,
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

  function updateRow(key: string, field: keyof ParsedInvoiceProduct, value: string | number) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    );
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function addEmptyRow() {
    const defPack = Math.max(1, parseInt(defaultPackSize) || 1);
    setRows((prev) => [
      ...prev,
      {
        key: nextKey(),
        name: '',
        qty: 0,
        rate: 0,
        mrp: 0,
        batchNo: '',
        expiry: '',
        packSize: defPack,
      },
    ]);
  }

  function isRowValid(r: EditableRow): boolean {
    return Boolean(r.name.trim()) && (r.mrp > 0 || r.rate > 0);
  }

  async function handleSave() {
    const valid = rows.filter(isRowValid);
    if (valid.length === 0) {
      setError('No valid products to import. Each needs a name and a selling price or purchase rate.');
      return;
    }

    setStep('saving');
    setError('');

    try {
      const payload = valid.map((r) => ({
        name: r.name.trim(),
        price: r.mrp > 0 ? r.mrp : r.rate,
        unit: 'pcs' as const,
        batchNo: r.batchNo,
        expiryDate: r.expiry || undefined,
        packSize: r.packSize,
        openingQuantity: r.qty,
        costPrice: r.rate > 0 ? r.rate : undefined,
        category: 'Medicine',
      }));

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
    const sellingPrice = item.mrp > 0 ? item.mrp : item.rate;
    const perUnit = item.packSize > 1 && sellingPrice > 0
      ? (sellingPrice / item.packSize).toFixed(2)
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
          placeholder="Medicine name"
        />

        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Input
              label="Selling Price / MRP"
              value={item.mrp ? String(item.mrp) : ''}
              onChangeText={(v) => updateRow(item.key, 'mrp', parseFloat(v) || 0)}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
          </View>
          <View style={styles.fieldHalf}>
            <Input
              label="Purchase Rate"
              value={item.rate ? String(item.rate) : ''}
              onChangeText={(v) => updateRow(item.key, 'rate', parseFloat(v) || 0)}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />
          </View>
        </View>

        {item.mrp > 0 && item.rate > 0 ? (
          <Text style={styles.marginText}>
            Margin: Rs {(item.mrp - item.rate).toFixed(2)} ({((item.mrp - item.rate) / item.mrp * 100).toFixed(1)}%)
          </Text>
        ) : null}

        {perUnit ? (
          <Text style={styles.perUnitText}>
            Rs {perUnit}/unit ({item.packSize} per strip)
          </Text>
        ) : null}

        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Input
              label="Qty"
              value={item.qty ? String(item.qty) : ''}
              onChangeText={(v) => updateRow(item.key, 'qty', parseFloat(v) || 0)}
              keyboardType="numeric"
              placeholder="0"
            />
          </View>
          <View style={styles.fieldHalf}>
            <Input
              label="Pack Size"
              value={String(item.packSize)}
              onChangeText={(v) => updateRow(item.key, 'packSize', Math.max(1, parseInt(v) || 1))}
              keyboardType="numeric"
              placeholder="1"
            />
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Input
              label="Batch No."
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
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>
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

            <View style={styles.packSizeRow}>
              <Text style={styles.packSizeLabel}>Default tablets per strip</Text>
              <View style={styles.packSizeInputWrap}>
                <Input
                  value={defaultPackSize}
                  onChangeText={setDefaultPackSize}
                  keyboardType="numeric"
                  placeholder="10"
                  style={styles.packSizeInput}
                />
              </View>
            </View>

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

  // Capture step
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
  packSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  packSizeLabel: {
    fontFamily: font.medium,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  packSizeInputWrap: {
    width: 70,
  },
  packSizeInput: {
    textAlign: 'center',
    marginBottom: 0,
  },
  captureBtn: {
    marginBottom: spacing.sm,
  },

  // Processing step
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

  // Review step
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
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 100,
  },

  // Product card
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
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldHalf: {
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
  perUnitText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.primary[700],
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    marginBottom: spacing.md,
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

  // Bottom bar
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

  // Done
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

  // Error
  errorText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
