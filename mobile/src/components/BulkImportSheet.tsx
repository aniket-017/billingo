import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  api,
  type ParsedInvoiceProduct,
  type ParsedInvoicePricingUnit,
  type ProductMatchPreviewItem,
} from '@/src/api/client';
import Button from '@/src/components/Button';
import BulkImportRowItem, { type EditableRow } from '@/src/components/BulkImportRowItem';
import Input from '@/src/components/Input';
import ProductMatchPicker from '@/src/components/ProductMatchPicker';
import { colors, font, radius, spacing } from '@/src/theme';
import {
  countReviewStats,
  getRowReviewIssues,
  hasUnresolvedMatches,
  matchSummaryLabel,
} from '@/src/utils/bulkImportReview';
import { extractInvoiceOcrText, type InvoiceOcrResult } from '@/src/utils/extractInvoiceOcrText';
import { formatExpiryDisplay, formatExpiryInput, parseExpiryToIso } from '@/src/utils/expiry';

let recognizeText: ((uri: string) => Promise<unknown>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mlkit = require('@infinitered/react-native-mlkit-text-recognition');
  recognizeText = mlkit.recognizeText;
} catch {
  // ML Kit unavailable (Expo Go)
}

let keyCounter = 0;
function nextKey(): string {
  return `row_${++keyCounter}`;
}

function inferPricingUnit(category: string): ParsedInvoicePricingUnit {
  const c = category.toLowerCase();
  if (['syrup', 'injection', 'drops', 'device', 'surgical', 'general'].some((x) => c.includes(x))) {
    return 'box';
  }
  return 'strip';
}

function applyMatchToRow(row: EditableRow, match: ProductMatchPreviewItem): EditableRow {
  return {
    ...row,
    matchStatus: match.status,
    matchProductId: match.productId,
    matchProductName: match.productName,
    matchScore: match.score,
    matchCandidates: match.candidates,
    matchResolved: match.status === 'auto' || match.status === 'new',
    matchAction:
      match.status === 'auto' ? 'stock_in' : match.status === 'new' ? 'create' : undefined,
  };
}

async function matchRows(rows: EditableRow[]): Promise<EditableRow[]> {
  if (rows.length === 0) return rows;
  try {
    const preview = await api.products.matchPreview(
      rows.map((r) => ({ name: r.name.trim() || '(unnamed)' }))
    );
    return rows.map((row, i) => applyMatchToRow(row, preview.items[i]!));
  } catch {
    return rows;
  }
}

function mapParsedProduct(p: ParsedInvoiceProduct): EditableRow {
  const mrp = p.mrp > 0 ? p.mrp : 0;
  const sellingPrice = p.sellingPrice > 0 ? p.sellingPrice : mrp;
  const numBoxes = Math.max(1, p.numBoxes || p.qty || 1);
  const stripsPerBox = Math.max(1, p.stripsPerBox || 1);
  const tabletsPerStrip = Math.max(1, p.tabletsPerStrip || p.packSize || 1);

  return {
    ...p,
    key: nextKey(),
    sellingPrice,
    packSize: tabletsPerStrip,
    numBoxes,
    stripsPerBox,
    tabletsPerStrip,
    pricingUnit: p.pricingUnit || inferPricingUnit(p.category || 'General'),
    expiry: formatExpiryDisplay(p.expiry),
    confidence: p.confidence || 'high',
    packRaw: p.packRaw || '',
    reorderLevel: 0,
  };
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
  const [saveResult, setSaveResult] = useState<{
    stockedIn: number;
    created: number;
    skipped: number;
  } | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [pickerRowKey, setPickerRowKey] = useState<string | null>(null);

  const reviewStats = useMemo(() => countReviewStats(rows), [rows]);

  const rowMetaByKey = useMemo(() => {
    const map = new Map<string, { issues: string[]; needsReview: boolean }>();
    for (const row of rows) {
      const issues = getRowReviewIssues(row, rows);
      map.set(row.key, { issues, needsReview: issues.length > 0 });
    }
    return map;
  }, [rows]);

  const expandedSignature = useMemo(() => [...expandedKeys].sort().join('|'), [expandedKeys]);
  const expandedKeysRef = useRef(expandedKeys);
  expandedKeysRef.current = expandedKeys;

  const reset = useCallback(() => {
    setStep('capture');
    setProcessingStatus('');
    setRows([]);
    setDealerName('');
    setError('');
    setSaveResult(null);
    setExpandedKeys(new Set());
  }, []);

  function handleClose() {
    reset();
    onClose();
  }

  const toggleExpanded = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const updateRow = useCallback((key: string, field: string, value: string | number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, [field]: value };
        if (field === 'name') {
          return {
            ...next,
            matchStatus: undefined,
            matchProductId: undefined,
            matchProductName: undefined,
            matchScore: undefined,
            matchCandidates: undefined,
            matchResolved: undefined,
            matchAction: undefined,
          };
        }
        return next;
      })
    );
  }, []);

  const rematchRowByName = useCallback(async (key: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const match = await api.products.matchPreviewOne(trimmed);
      setRows((prev) => prev.map((r) => (r.key === key ? applyMatchToRow(r, match) : r)));
    } catch {
      /* keep row without match metadata */
    }
  }, []);

  const resolveMatchStockIn = useCallback((key: string, productId: string, productName: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? {
              ...r,
              matchResolved: true,
              matchAction: 'stock_in' as const,
              matchProductId: productId,
              matchProductName: productName,
            }
          : r
      )
    );
    setPickerRowKey(null);
  }, []);

  const resolveMatchCreateNew = useCallback((key: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? {
              ...r,
              matchResolved: true,
              matchAction: 'create' as const,
              matchStatus: 'new' as const,
              matchProductId: undefined,
              matchProductName: undefined,
            }
          : r
      )
    );
    setPickerRowKey(null);
  }, []);

  const updateExpiry = useCallback((key: string, raw: string) => {
    updateRow(key, 'expiry', formatExpiryInput(raw));
  }, [updateRow]);

  const updateMrp = useCallback((key: string, val: number) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, mrp: val, sellingPrice: val } : r))
    );
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  async function applyParseResult(
    parseResult: Awaited<ReturnType<typeof api.products.parseInvoice>>,
    append: boolean
  ) {
    if (!parseResult.products || parseResult.products.length === 0) {
      setError('No products could be detected. Try a clearer photo or add manually.');
      setStep(append ? 'review' : 'capture');
      return;
    }

    if (parseResult.dealerName && (!append || !dealerName.trim())) {
      setDealerName(parseResult.dealerName);
    }

    const newRows = parseResult.products.map(mapParsedProduct);
    setProcessingStatus('Matching with your catalog...');
    const matched = await matchRows(newRows);
    setRows((prev) => (append ? [...prev, ...matched] : matched));
    setExpandedKeys(new Set());
    setStep('review');
  }

  async function processOcrImage(uri: string, append: boolean) {
    setStep('processing');
    setProcessingStatus('Running OCR on image...');

    if (!recognizeText) {
      setError('OCR is unavailable in Expo Go. Use a dev build.');
      setStep('capture');
      return;
    }

    const ocrResult = (await recognizeText(uri)) as InvoiceOcrResult;
    const fullText = extractInvoiceOcrText(ocrResult);

    if (!fullText) {
      setError('Could not read any text from the image. Try a clearer photo.');
      setStep(append ? 'review' : 'capture');
      return;
    }

    setProcessingStatus('AI is extracting products...');
    const parseResult = await api.products.parseInvoice(fullText);
    applyParseResult(parseResult, append);
  }

  async function processImageWithAi(uri: string, append: boolean) {
    setStep('processing');
    setProcessingStatus('Sending image to AI...');
    const parseResult = await api.products.parseInvoiceImage(uri);
    applyParseResult(parseResult, append);
  }

  async function pickImage(
    source: 'camera' | 'gallery',
    append = false,
    mode: 'ocr' | 'ai' = 'ocr'
  ) {
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
      if (mode === 'ai') {
        await processImageWithAi(result.assets[0].uri, append);
      } else {
        await processOcrImage(result.assets[0].uri, append);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to process image';
      setError(msg);
      setStep(append ? 'review' : 'capture');
    }
  }

  function pickImageForAi(append = false) {
    Alert.alert('Send Photo to AI', 'Choose image source', [
      { text: 'Take Photo', onPress: () => pickImage('camera', append, 'ai') },
      { text: 'Pick from Gallery', onPress: () => pickImage('gallery', append, 'ai') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const addEmptyRow = useCallback(async () => {
    const row: EditableRow = {
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
      pricingUnit: 'strip' as ParsedInvoicePricingUnit,
      category: 'General',
      confidence: 'low',
      packRaw: '',
    };
    setRows((prev) => [...prev, row]);
  }, []);

  function isRowValid(r: EditableRow): boolean {
    return Boolean(r.name.trim()) && (r.mrp > 0 || r.rate > 0 || r.sellingPrice > 0);
  }

  async function handleSave() {
    const valid = rows.filter(isRowValid);
    if (valid.length === 0) {
      setError('No valid products to import. Each needs a name and at least one price.');
      return;
    }

    if (hasUnresolvedMatches(valid)) {
      setError('Resolve all “Pick match” items before importing.');
      return;
    }

    setStep('saving');
    setError('');

    try {
      const payload = valid.map((r) => {
        const sell = r.sellingPrice > 0 ? r.sellingPrice : r.mrp > 0 ? r.mrp : r.rate;
        const price = sell;
        const boxes = Math.max(1, r.numBoxes);
        const strips = Math.max(1, r.stripsPerBox);
        const tabs = Math.max(1, r.tabletsPerStrip);
        const useStockIn =
          r.matchAction === 'stock_in' ||
          (r.matchStatus === 'auto' && r.matchProductId);

        const base = {
          name: r.name.trim(),
          price,
          mrp: r.mrp > 0 ? r.mrp : undefined,
          sellingPrice: price,
          unit: 'pcs' as const,
          batchNo: r.batchNo,
          expiryDate: parseExpiryToIso(r.expiry) || undefined,
          packSize: strips * tabs,
          numBoxes: boxes,
          stripsPerBox: strips,
          tabletsPerStrip: tabs,
          openingQuantity: boxes * strips * tabs,
          reorderLevel: r.reorderLevel > 0 ? r.reorderLevel : undefined,
          costPrice: r.rate > 0 ? r.rate : undefined,
          dealerName: dealerName.trim() || undefined,
          category: r.category?.trim() || 'General',
        };

        if (useStockIn && r.matchProductId) {
          return {
            ...base,
            action: 'stock_in' as const,
            productId: r.matchProductId,
            notes: 'Stock in (bulk import)',
          };
        }

        return { ...base, action: 'create' as const };
      });

      const result = await api.products.bulkImport(payload);
      setSaveResult({
        stockedIn: result.stockedIn.length,
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

  const pickerRow = useMemo(
    () => (pickerRowKey ? rows.find((r) => r.key === pickerRowKey) : null),
    [pickerRowKey, rows]
  );

  const renderListItem = useCallback(
    ({ item, index }: ListRenderItemInfo<EditableRow>) => {
      const meta = rowMetaByKey.get(item.key) ?? { issues: [], needsReview: false };
      const matchLabel = matchSummaryLabel(item);
      const matchTone =
        item.matchStatus === 'auto' ||
        (item.matchResolved && item.matchAction === 'stock_in')
          ? 'auto'
          : item.matchStatus === 'review' && !item.matchResolved
            ? 'review'
            : item.matchStatus === 'new' || item.matchAction === 'create'
              ? 'new'
              : undefined;
      return (
        <BulkImportRowItem
          item={item}
          index={index}
          isExpanded={expandedKeysRef.current.has(item.key)}
          issues={meta.issues}
          needsReview={meta.needsReview}
          matchLabel={matchLabel}
          matchTone={matchTone}
          onPickMatch={
            item.matchStatus === 'review' && !item.matchResolved
              ? () => setPickerRowKey(item.key)
              : undefined
          }
          onToggle={toggleExpanded}
          onRemove={removeRow}
          onUpdateRow={updateRow}
          onUpdateExpiry={updateExpiry}
          onUpdateMrp={updateMrp}
          onNameBlur={(key: string, name: string) => {
            void rematchRowByName(key, name);
          }}
        />
      );
    },
    [rowMetaByKey, toggleExpanded, removeRow, updateRow, updateExpiry, updateMrp, rematchRowByName]
  );

  const listHeader = useMemo(
    () =>
      rows.length > 0 ? (
        <View style={st.addPageRow}>
          <Button
            title="Add another page"
            variant="secondary"
            onPress={() => pickImage('gallery', true)}
            style={st.addPageBtn}
          />
        </View>
      ) : null,
    [rows.length]
  );

  const listFooter = useMemo(
    () => (
      <Pressable style={st.addRowBtn} onPress={addEmptyRow}>
        <Ionicons name="add-circle-outline" size={20} color={colors.primary[600]} />
        <Text style={st.addRowText}>Add product manually</Text>
      </Pressable>
    ),
    [addEmptyRow]
  );

  const validCount = useMemo(() => rows.filter(isRowValid).length, [rows]);

  const keyExtractor = useCallback((item: EditableRow) => item.key, []);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[st.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={st.header}>
          <Text style={st.title}>Bulk Import</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        {step === 'capture' && (
          <View style={st.captureContainer}>
            <View style={st.captureIcon}>
              <Ionicons name="document-text-outline" size={64} color={colors.primary[500]} />
            </View>
            <Text style={st.captureTitle}>Import from Invoice</Text>
            <Text style={st.captureDesc}>
              Photograph the full product table in good light, keeping the page flat. AI extracts
              names, pack size, MRP, cost, batch, and expiry automatically.
            </Text>
            <View style={st.tipsBox}>
              <Text style={st.tipsTitle}>Tips for best results</Text>
              <Text style={st.tipItem}>• Include all columns (Product, PACK, MRP, Rate, Batch, Exp)</Text>
              <Text style={st.tipItem}>• Avoid glare and shadows on the table</Text>
              <Text style={st.tipItem}>• For multi-page bills, scan each page separately</Text>
            </View>

            <Button title="Take Photo" onPress={() => pickImage('camera')} style={st.captureBtn} />
            <Button
              title="Pick from Gallery"
              variant="secondary"
              onPress={() => pickImage('gallery')}
              style={st.captureBtn}
            />
            <Button
              title="Smart Import"
              variant="secondary"
              onPress={() => pickImageForAi()}
              style={st.captureBtn}
            />

            {error ? <Text style={st.errorText}>{error}</Text> : null}
          </View>
        )}

        {step === 'processing' && (
          <View style={st.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={st.processingText}>{processingStatus}</Text>
          </View>
        )}

        {step === 'review' && (
          <KeyboardAvoidingView
            style={st.reviewContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top + 60}
          >
            <View style={st.reviewHeader}>
              <Text style={st.reviewCount}>
                {rows.length} product{rows.length !== 1 ? 's' : ''}
              </Text>
              <Pressable onPress={() => { setStep('capture'); setError(''); }}>
                <Text style={st.rescanText}>Re-scan</Text>
              </Pressable>
            </View>

            <View style={st.statsBar}>
              <Text style={st.statsReady}>{reviewStats.ready} ready</Text>
              <Text style={st.statsDot}>·</Text>
              <Text style={st.statsReview}>
                {reviewStats.needsReview} need review
              </Text>
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
              renderItem={renderListItem}
              keyExtractor={keyExtractor}
              extraData={expandedSignature}
              contentContainerStyle={st.listContent}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={8}
              maxToRenderPerBatch={6}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
              ListHeaderComponent={listHeader}
              ListFooterComponent={listFooter}
            />

            <View style={st.bottomBar}>
              <Button
                title={`Import ${validCount} product${validCount !== 1 ? 's' : ''}`}
                onPress={handleSave}
                disabled={validCount === 0}
              />
            </View>
          </KeyboardAvoidingView>
        )}

        {step === 'saving' && (
          <View style={st.centerContainer}>
            {saveResult ? (
              <>
                <Ionicons name="checkmark-circle" size={64} color={colors.success} />
                <Text style={st.doneTitle}>Import Complete</Text>
                <Text style={st.doneDesc}>
                  {saveResult.stockedIn > 0
                    ? `${saveResult.stockedIn} added to existing stock`
                    : ''}
                  {saveResult.stockedIn > 0 && saveResult.created > 0 ? ' · ' : ''}
                  {saveResult.created > 0
                    ? `${saveResult.created} new product${saveResult.created !== 1 ? 's' : ''}`
                    : ''}
                  {saveResult.skipped > 0 ? ` (${saveResult.skipped} skipped)` : ''}
                </Text>
                <Button title="Done" onPress={handleClose} style={st.doneBtn} />
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color={colors.primary[600]} />
                <Text style={st.processingText}>Saving {validCount} products...</Text>
              </>
            )}
          </View>
        )}

        <ProductMatchPicker
          visible={pickerRow != null}
          invoiceName={pickerRow?.name ?? ''}
          candidates={pickerRow?.matchCandidates ?? []}
          onSelect={(id, name) => pickerRowKey && resolveMatchStockIn(pickerRowKey, id, name)}
          onCreateNew={() => pickerRowKey && resolveMatchCreateNew(pickerRowKey)}
          onClose={() => setPickerRowKey(null)}
        />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface[50] },
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
  title: { fontFamily: font.bold, fontSize: 20, color: colors.text },

  captureContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  captureIcon: { alignItems: 'center', marginBottom: spacing.lg },
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
    marginBottom: spacing.md,
  },
  tipsBox: {
    backgroundColor: colors.primary[50],
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  tipsTitle: { fontFamily: font.semiBold, fontSize: 13, color: colors.primary[700], marginBottom: spacing.xs },
  tipItem: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  captureBtn: { marginBottom: spacing.sm },

  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  processingText: {
    fontFamily: font.medium,
    fontSize: 16,
    color: colors.textMuted,
    marginTop: spacing.lg,
    textAlign: 'center',
  },

  reviewContainer: { flex: 1 },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  reviewCount: { fontFamily: font.semiBold, fontSize: 16, color: colors.text },
  rescanText: { fontFamily: font.medium, fontSize: 14, color: colors.primary[600] },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  statsReady: { fontFamily: font.medium, fontSize: 14, color: colors.success },
  statsDot: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, marginHorizontal: 6 },
  statsReview: { fontFamily: font.medium, fontSize: 14, color: '#b45309' },
  dealerRow: { paddingHorizontal: spacing.md, marginBottom: spacing.xs },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 100 },
  addPageRow: { marginBottom: spacing.sm },
  addPageBtn: { marginBottom: 0 },

  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  addRowText: { fontFamily: font.medium, fontSize: 15, color: colors.primary[600] },
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

  doneTitle: { fontFamily: font.bold, fontSize: 22, color: colors.text, marginTop: spacing.lg },
  doneDesc: {
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  doneBtn: { marginTop: spacing.xl, minWidth: 160 },
  errorText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
