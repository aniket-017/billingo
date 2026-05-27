import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { api, type ParsedInvoiceProduct, type ParsedInvoicePricingUnit } from '@/src/api/client';
import Button from '@/src/components/Button';
import Input from '@/src/components/Input';
import { colors, font, radius, spacing } from '@/src/theme';
import {
  countReviewStats,
  getRowReviewIssues,
  packSummary,
  rowNeedsReview,
  type BulkImportRow,
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

type PricingUnit = ParsedInvoicePricingUnit;
const UNIT_LABELS: Record<PricingUnit, string> = { strip: 'Strip', box: 'Box', tablet: 'Tablet' };

type EditableRow = BulkImportRow & { reorderLevel: number };

let keyCounter = 0;
function nextKey(): string {
  return `row_${++keyCounter}`;
}

function inferPricingUnit(category: string): PricingUnit {
  const c = category.toLowerCase();
  if (['syrup', 'injection', 'drops', 'device', 'surgical', 'general'].some((x) => c.includes(x))) {
    return 'box';
  }
  return 'strip';
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
type ReviewFilter = 'all' | 'errors';

export default function BulkImportSheet({ visible, onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('capture');
  const [processingStatus, setProcessingStatus] = useState('');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [dealerName, setDealerName] = useState('');
  const [error, setError] = useState('');
  const [saveResult, setSaveResult] = useState<{ created: number; skipped: number } | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('errors');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const reviewStats = useMemo(() => countReviewStats(rows), [rows]);

  const reset = useCallback(() => {
    setStep('capture');
    setProcessingStatus('');
    setRows([]);
    setDealerName('');
    setError('');
    setSaveResult(null);
    setReviewFilter('errors');
    setExpandedKeys(new Set());
  }, []);

  useEffect(() => {
    if (step === 'review' && reviewStats.needsReview === 0) {
      setReviewFilter('all');
    }
  }, [step, reviewStats.needsReview]);

  const displayRows = useMemo(() => {
    if (reviewFilter === 'all') return rows;
    return rows.filter((r) => rowNeedsReview(r, rows));
  }, [rows, reviewFilter]);

  function handleClose() {
    reset();
    onClose();
  }

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

    if (!parseResult.products || parseResult.products.length === 0) {
      setError('No products could be detected. Try a clearer photo or add manually.');
      setStep(append ? 'review' : 'capture');
      return;
    }

    if (parseResult.dealerName && (!append || !dealerName.trim())) {
      setDealerName(parseResult.dealerName);
    }

    const newRows = parseResult.products.map(mapParsedProduct);
    setRows((prev) => (append ? [...prev, ...newRows] : newRows));
    setReviewFilter('errors');
    setExpandedKeys(new Set());
    setStep('review');
  }

  async function pickImage(source: 'camera' | 'gallery', append = false) {
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
      await processOcrImage(result.assets[0].uri, append);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to process image';
      setError(msg);
      setStep(append ? 'review' : 'capture');
    }
  }

  function updateRow(key: string, field: string, value: string | number) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    );
  }

  function updateExpiry(key: string, raw: string) {
    updateRow(key, 'expiry', formatExpiryInput(raw));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
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
        confidence: 'low',
        packRaw: '',
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
        const sell = r.sellingPrice > 0 ? r.sellingPrice : r.mrp > 0 ? r.mrp : r.rate;
        const price = sell;
        const boxes = Math.max(1, r.numBoxes);
        const strips = Math.max(1, r.stripsPerBox);
        const tabs = Math.max(1, r.tabletsPerStrip);

        return {
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

  function renderIssueChips(issues: string[]) {
    if (issues.length === 0) return null;
    return (
      <View style={st.issueRow}>
        {issues.map((issue) => (
          <View key={issue} style={st.issueChip}>
            <Text style={st.issueChipText}>{issue}</Text>
          </View>
        ))}
      </View>
    );
  }

  function renderCompactCard(item: EditableRow, index: number) {
    const issues = getRowReviewIssues(item, rows);
    const sell = item.sellingPrice > 0 ? item.sellingPrice : item.mrp;

    return (
      <Pressable
        style={[st.compactCard, issues.length > 0 && st.compactCardWarn]}
        onPress={() => toggleExpanded(item.key)}
      >
        <View style={st.compactHeader}>
          <View style={st.cardBadge}>
            <Text style={st.cardBadgeText}>{index + 1}</Text>
          </View>
          <View style={st.compactBody}>
            <Text style={st.compactName} numberOfLines={2}>{item.name || '(unnamed)'}</Text>
            <Text style={st.compactMeta}>
              MRP ₹{sell > 0 ? sell.toFixed(2) : '—'}
              {item.rate > 0 ? ` · Cost ₹${item.rate.toFixed(2)}` : ''}
              {item.expiry ? ` · Exp ${item.expiry}` : ''}
            </Text>
            <Text style={st.compactPack}>{packSummary(item)} · {UNIT_LABELS[item.pricingUnit]}</Text>
          </View>
          <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
        </View>
        {renderIssueChips(issues)}
      </Pressable>
    );
  }

  function renderFullProductCard(item: EditableRow, index: number) {
    const issues = getRowReviewIssues(item, rows);
    const totalUnits =
      Math.max(1, item.numBoxes) * Math.max(1, item.stripsPerBox) * Math.max(1, item.tabletsPerStrip);
    const effectivePrice = item.sellingPrice > 0 ? item.sellingPrice : item.mrp;
    const perUnit =
      totalUnits > 1 && effectivePrice > 0 ? (effectivePrice / totalUnits).toFixed(2) : null;

    const marginInfo =
      item.mrp > 0 && item.rate > 0
        ? { margin: item.mrp - item.rate, pct: ((item.mrp - item.rate) / item.mrp) * 100 }
        : null;

    const tabs = Math.max(1, item.tabletsPerStrip);
    const strips = Math.max(1, item.stripsPerBox);
    const unitMul =
      item.pricingUnit === 'tablet' ? 1 : item.pricingUnit === 'strip' ? tabs : strips * tabs;
    const mrpNum = item.mrp || 0;
    const costNum = item.rate || 0;
    const sellNum = item.sellingPrice || 0;

    const showCalc = (mrpNum > 0 || costNum > 0) && totalUnits > 1;
    const perTab = mrpNum > 0 ? mrpNum / unitMul : 0;
    const costPerTab = costNum > 0 ? costNum / unitMul : 0;
    const sellPerTab = sellNum > 0 ? sellNum / unitMul : 0;
    const profitPerTab = sellPerTab - costPerTab;

    const showCollapse =
      reviewFilter === 'all' && !rowNeedsReview(item, rows) && expandedKeys.has(item.key);

    return (
      <View style={[st.card, issues.length > 0 && st.cardWarn]}>
        <View style={st.cardHeader}>
          <View style={st.cardBadge}>
            <Text style={st.cardBadgeText}>{index + 1}</Text>
          </View>
          <View style={st.cardHeaderActions}>
            {showCollapse ? (
              <Pressable onPress={() => toggleExpanded(item.key)} hitSlop={8} style={st.collapseBtn}>
                <Text style={st.collapseText}>Collapse</Text>
              </Pressable>
            ) : null}
            <Pressable style={st.removeBtn} onPress={() => removeRow(item.key)} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={colors.danger} />
            </Pressable>
          </View>
        </View>

        {renderIssueChips(issues)}

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

        <Text style={st.secLabel}>PACKAGING</Text>
        <View style={st.pkgLabelRow}>
          <Text style={st.pkgLabel}>Boxes</Text>
          <Text style={st.pkgLabel}>Strips in 1 Box</Text>
          <Text style={st.pkgLabel}>Tablets in 1 Strip</Text>
        </View>
        <View style={st.row3}>
          <View style={st.col}>
            <Input
              value={item.numBoxes === 0 ? '' : String(item.numBoxes)}
              onChangeText={(v) => updateRow(item.key, 'numBoxes', v === '' ? 0 : parseInt(v) || 0)}
              keyboardType="numeric"
              placeholder="1"
            />
          </View>
          <View style={st.col}>
            <Input
              value={item.stripsPerBox === 0 ? '' : String(item.stripsPerBox)}
              onChangeText={(v) => updateRow(item.key, 'stripsPerBox', v === '' ? 0 : parseInt(v) || 0)}
              keyboardType="numeric"
              placeholder="1"
            />
          </View>
          <View style={st.col}>
            <Input
              value={item.tabletsPerStrip === 0 ? '' : String(item.tabletsPerStrip)}
              onChangeText={(v) =>
                updateRow(item.key, 'tabletsPerStrip', v === '' ? 0 : parseInt(v) || 0)
              }
              keyboardType="numeric"
              placeholder="1"
            />
          </View>
        </View>

        <Text style={st.secLabel}>PRICING</Text>
        <View style={st.unitRow}>
          <Text style={st.unitLabel}>Prices per</Text>
          <View style={st.unitPills}>
            {(['strip', 'box', 'tablet'] as PricingUnit[]).map((u) => (
              <Pressable
                key={u}
                onPress={() => updateRow(item.key, 'pricingUnit', u)}
                style={[st.unitPill, item.pricingUnit === u && st.unitPillActive]}
              >
                <Text style={[st.unitPillText, item.pricingUnit === u && st.unitPillTextActive]}>
                  {UNIT_LABELS[u]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={st.row3}>
          <View style={st.col}>
            <Input
              label="MRP"
              value={item.mrp ? String(item.mrp) : ''}
              onChangeText={(v) => {
                const val = parseFloat(v) || 0;
                setRows((prev) =>
                  prev.map((r) =>
                    r.key === item.key ? { ...r, mrp: val, sellingPrice: val } : r
                  )
                );
              }}
              keyboardType="decimal-pad"
              placeholder="100"
            />
          </View>
          <View style={st.col}>
            <Input
              label="Sell"
              value={item.sellingPrice ? String(item.sellingPrice) : ''}
              onChangeText={(v) => updateRow(item.key, 'sellingPrice', parseFloat(v) || 0)}
              keyboardType="decimal-pad"
              placeholder="95"
            />
          </View>
          <View style={st.col}>
            <Input
              label="Cost"
              value={item.rate ? String(item.rate) : ''}
              onChangeText={(v) => updateRow(item.key, 'rate', parseFloat(v) || 0)}
              keyboardType="decimal-pad"
              placeholder="87.80"
            />
          </View>
        </View>

        {item.sellingPrice > 0 && item.mrp > 0 && item.sellingPrice > item.mrp ? (
          <View style={st.warnBox}>
            <Text style={st.warnText}>Selling price is higher than MRP</Text>
          </View>
        ) : null}

        {marginInfo ? (
          <Text style={st.marginText}>
            Margin: ₹{marginInfo.margin.toFixed(2)} ({marginInfo.pct.toFixed(1)}%)
          </Text>
        ) : null}

        {showCalc ? (
          <View style={st.calcBox}>
            <Text style={st.calcTitle}>Auto Calculated</Text>
            <View style={st.calcGrid}>
              <Text style={st.calcItem}>
                Total Tablets: <Text style={st.calcBold}>{totalUnits}</Text>
              </Text>
              {perTab > 0 ? (
                <Text style={st.calcItem}>
                  MRP/Tablet: <Text style={st.calcBold}>₹{perTab.toFixed(2)}</Text>
                </Text>
              ) : null}
              {costPerTab > 0 ? (
                <Text style={st.calcItem}>
                  Cost/Tablet: <Text style={st.calcBold}>₹{costPerTab.toFixed(2)}</Text>
                </Text>
              ) : null}
              {profitPerTab > 0 ? (
                <Text style={[st.calcItem, { color: colors.success }]}>
                  Profit/Tablet: <Text style={st.calcBold}>₹{profitPerTab.toFixed(2)}</Text>
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={st.totalText}>
            Total units: {totalUnits}
            {perUnit ? `  •  ₹${perUnit}/unit` : ''}
          </Text>
        )}

        <View style={st.row2}>
          <View style={st.col}>
            <Input
              label="Batch"
              value={item.batchNo}
              onChangeText={(v) => updateRow(item.key, 'batchNo', v)}
              placeholder="Batch"
            />
          </View>
          <View style={st.col}>
            <Input
              label="Expiry"
              value={item.expiry}
              onChangeText={(v) => updateExpiry(item.key, v)}
              placeholder="MM/YY"
              keyboardType="numeric"
              maxLength={5}
            />
          </View>
        </View>

        <Input
          label="Category"
          value={item.category || ''}
          onChangeText={(v) => updateRow(item.key, 'category', v)}
          placeholder="e.g. Tablet, Syrup, Capsule"
        />

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

  function renderListItem({ item }: { item: EditableRow }) {
    const index = rows.findIndex((r) => r.key === item.key);
    const needsReview = rowNeedsReview(item, rows);
    const isExpanded = expandedKeys.has(item.key);

    if (reviewFilter === 'all' && !needsReview && !isExpanded) {
      return renderCompactCard(item, index);
    }
    return renderFullProductCard(item, index);
  }

  const validCount = rows.filter(isRowValid).length;

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

            <View style={st.filterRow}>
              <Pressable
                style={[st.filterPill, reviewFilter === 'errors' && st.filterPillActive]}
                onPress={() => setReviewFilter('errors')}
              >
                <Text
                  style={[st.filterPillText, reviewFilter === 'errors' && st.filterPillTextActive]}
                >
                  Needs review
                </Text>
              </Pressable>
              <Pressable
                style={[st.filterPill, reviewFilter === 'all' && st.filterPillActive]}
                onPress={() => setReviewFilter('all')}
              >
                <Text
                  style={[st.filterPillText, reviewFilter === 'all' && st.filterPillTextActive]}
                >
                  Show all
                </Text>
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

            {reviewFilter === 'errors' && displayRows.length === 0 ? (
              <View style={st.allClearBox}>
                <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                <Text style={st.allClearTitle}>All products look good</Text>
                <Text style={st.allClearDesc}>Tap Import below, or switch to Show all to review every row.</Text>
              </View>
            ) : null}

            <FlatList
              data={displayRows}
              renderItem={renderListItem}
              keyExtractor={(item) => item.key}
              contentContainerStyle={st.listContent}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                rows.length > 0 ? (
                  <View style={st.addPageRow}>
                    <Button
                      title="Add another page"
                      variant="secondary"
                      onPress={() => pickImage('gallery', true)}
                      style={st.addPageBtn}
                    />
                  </View>
                ) : null
              }
              ListFooterComponent={
                <Pressable style={st.addRowBtn} onPress={addEmptyRow}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary[600]} />
                  <Text style={st.addRowText}>Add product manually</Text>
                </Pressable>
              }
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
                  {saveResult.created} product{saveResult.created !== 1 ? 's' : ''} imported
                  {saveResult.skipped > 0 ? ` (${saveResult.skipped} skipped as duplicates)` : ''}
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
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface[100],
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  filterPillText: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
  filterPillTextActive: { color: colors.white },
  dealerRow: { paddingHorizontal: spacing.md, marginBottom: spacing.xs },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 100 },
  addPageRow: { marginBottom: spacing.sm },
  addPageBtn: { marginBottom: 0 },

  allClearBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  allClearTitle: { fontFamily: font.semiBold, fontSize: 18, color: colors.text, marginTop: spacing.md },
  allClearDesc: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  compactCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactCardWarn: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  compactHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  compactBody: { flex: 1 },
  compactName: { fontFamily: font.semiBold, fontSize: 14, color: colors.text },
  compactMeta: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  compactPack: { fontFamily: font.medium, fontSize: 11, color: colors.primary[700], marginTop: 2 },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardWarn: { borderColor: '#fcd34d' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  cardHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBadgeText: { fontFamily: font.semiBold, fontSize: 12, color: colors.primary[700] },
  removeBtn: { padding: 4 },
  collapseBtn: { padding: 4 },
  collapseText: { fontFamily: font.medium, fontSize: 13, color: colors.primary[600] },

  issueRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  issueChip: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  issueChipText: { fontFamily: font.medium, fontSize: 11, color: '#92400e' },

  nameInput: { minHeight: 48 },

  secLabel: {
    fontFamily: font.semiBold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  row3: { flexDirection: 'row', gap: spacing.sm },
  row2: { flexDirection: 'row', gap: spacing.sm },
  col: { flex: 1 },
  pkgLabelRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 4 },
  pkgLabel: {
    flex: 1,
    fontFamily: font.semiBold,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: 2,
  },
  unitLabel: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  unitPills: { flexDirection: 'row', backgroundColor: colors.surface[100], borderRadius: 8, padding: 2 },
  unitPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  unitPillActive: { backgroundColor: colors.primary[600] },
  unitPillText: { fontFamily: font.semiBold, fontSize: 11, color: colors.textMuted },
  unitPillTextActive: { color: colors.white },

  warnBox: {
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  warnText: { fontFamily: font.medium, fontSize: 12, color: '#b45309' },
  marginText: {
    fontFamily: font.medium,
    fontSize: 12,
    color: colors.success,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },

  calcBox: {
    backgroundColor: colors.surface[50],
    borderRadius: 10,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calcTitle: {
    fontFamily: font.semiBold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  calcGrid: { gap: 2 },
  calcItem: { fontFamily: font.regular, fontSize: 12, color: colors.text },
  calcBold: { fontFamily: font.semiBold },

  totalText: {
    fontFamily: font.medium,
    fontSize: 12,
    color: colors.primary[700],
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
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
