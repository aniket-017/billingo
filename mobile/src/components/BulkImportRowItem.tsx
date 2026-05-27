import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ParsedInvoicePricingUnit } from '@/src/api/client';
import Input from '@/src/components/Input';
import { colors, font, radius, spacing } from '@/src/theme';
import { packSummary, type BulkImportRow } from '@/src/utils/bulkImportReview';

type PricingUnit = ParsedInvoicePricingUnit;
const UNIT_LABELS: Record<PricingUnit, string> = { strip: 'Strip', box: 'Box', tablet: 'Tablet' };

export type EditableRow = BulkImportRow & { reorderLevel: number };

type Props = {
  item: EditableRow;
  index: number;
  isExpanded: boolean;
  issues: string[];
  needsReview: boolean;
  matchLabel?: string | null;
  matchTone?: 'auto' | 'review' | 'new';
  onPickMatch?: () => void;
  onToggle: (key: string) => void;
  onRemove: (key: string) => void;
  onUpdateRow: (key: string, field: string, value: string | number) => void;
  onUpdateExpiry: (key: string, raw: string) => void;
  onUpdateMrp: (key: string, val: number) => void;
  onNameBlur?: (key: string, name: string) => void;
};

function MatchBadge({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: 'auto' | 'review' | 'new';
  onPress?: () => void;
}) {
  const toneStyle =
    tone === 'auto' ? st.matchAuto : tone === 'review' ? st.matchReview : st.matchNew;
  const inner = (
    <View style={[st.matchBadge, toneStyle]}>
      <Text style={[st.matchBadgeText, tone === 'auto' && st.matchBadgeTextAuto]}>{label}</Text>
      {tone === 'review' && onPress ? (
        <Ionicons name="chevron-forward" size={14} color="#b45309" />
      ) : null}
    </View>
  );
  if (tone === 'review' && onPress) {
    return <Pressable onPress={onPress}>{inner}</Pressable>;
  }
  return inner;
}

function IssueChips({ issues }: { issues: string[] }) {
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

function BulkImportRowItem({
  item,
  index,
  isExpanded,
  issues,
  needsReview,
  matchLabel,
  matchTone,
  onPickMatch,
  onToggle,
  onRemove,
  onUpdateRow,
  onUpdateExpiry,
  onUpdateMrp,
  onNameBlur,
}: Props) {
  if (!isExpanded) {
    const sell = item.sellingPrice > 0 ? item.sellingPrice : item.mrp;
    return (
      <Pressable
        style={[st.compactCard, needsReview && st.compactCardWarn]}
        onPress={() => onToggle(item.key)}
      >
        <View style={st.compactHeader}>
          <View style={st.cardBadge}>
            <Text style={st.cardBadgeText}>{index + 1}</Text>
          </View>
          <View style={st.compactBody}>
            <Text style={st.compactName} numberOfLines={2}>
              {item.name || '(unnamed)'}
            </Text>
            <Text style={st.compactMeta}>
              MRP ₹{sell > 0 ? sell.toFixed(2) : '—'}
              {item.rate > 0 ? ` · Cost ₹${item.rate.toFixed(2)}` : ''}
              {item.expiry ? ` · Exp ${item.expiry}` : ''}
            </Text>
            <Text style={st.compactPack}>
              {packSummary(item)} · {UNIT_LABELS[item.pricingUnit]}
            </Text>
            {matchLabel && matchTone ? (
              <MatchBadge label={matchLabel} tone={matchTone} onPress={onPickMatch} />
            ) : null}
          </View>
          <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
        </View>
        <IssueChips issues={issues} />
      </Pressable>
    );
  }

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

  return (
    <View style={[st.card, issues.length > 0 && st.cardWarn]}>
      <View style={st.cardHeader}>
        <View style={st.cardBadge}>
          <Text style={st.cardBadgeText}>{index + 1}</Text>
        </View>
        <View style={st.cardHeaderActions}>
          <Pressable onPress={() => onToggle(item.key)} hitSlop={8} style={st.collapseBtn}>
            <Text style={st.collapseText}>Collapse</Text>
          </Pressable>
          <Pressable style={st.removeBtn} onPress={() => onRemove(item.key)} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      <IssueChips issues={issues} />

      <Input
        label="Product Name"
        value={item.name}
        onChangeText={(v) => onUpdateRow(item.key, 'name', v)}
        onBlur={() => onNameBlur?.(item.key, item.name)}
        placeholder="Product name"
        multiline
        numberOfLines={2}
        textAlignVertical="top"
        style={st.nameInput}
      />
      {matchLabel && matchTone ? (
        <MatchBadge label={matchLabel} tone={matchTone} onPress={onPickMatch} />
      ) : null}

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
            onChangeText={(v) => onUpdateRow(item.key, 'numBoxes', v === '' ? 0 : parseInt(v) || 0)}
            keyboardType="numeric"
            placeholder="1"
          />
        </View>
        <View style={st.col}>
          <Input
            value={item.stripsPerBox === 0 ? '' : String(item.stripsPerBox)}
            onChangeText={(v) =>
              onUpdateRow(item.key, 'stripsPerBox', v === '' ? 0 : parseInt(v) || 0)
            }
            keyboardType="numeric"
            placeholder="1"
          />
        </View>
        <View style={st.col}>
          <Input
            value={item.tabletsPerStrip === 0 ? '' : String(item.tabletsPerStrip)}
            onChangeText={(v) =>
              onUpdateRow(item.key, 'tabletsPerStrip', v === '' ? 0 : parseInt(v) || 0)
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
              onPress={() => onUpdateRow(item.key, 'pricingUnit', u)}
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
            onChangeText={(v) => onUpdateMrp(item.key, parseFloat(v) || 0)}
            keyboardType="decimal-pad"
            placeholder="100"
          />
        </View>
        <View style={st.col}>
          <Input
            label="Sell"
            value={item.sellingPrice ? String(item.sellingPrice) : ''}
            onChangeText={(v) => onUpdateRow(item.key, 'sellingPrice', parseFloat(v) || 0)}
            keyboardType="decimal-pad"
            placeholder="95"
          />
        </View>
        <View style={st.col}>
          <Input
            label="Cost"
            value={item.rate ? String(item.rate) : ''}
            onChangeText={(v) => onUpdateRow(item.key, 'rate', parseFloat(v) || 0)}
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
            onChangeText={(v) => onUpdateRow(item.key, 'batchNo', v)}
            placeholder="Batch"
          />
        </View>
        <View style={st.col}>
          <Input
            label="Expiry"
            value={item.expiry}
            onChangeText={(v) => onUpdateExpiry(item.key, v)}
            placeholder="MM/YY"
            keyboardType="numeric"
            maxLength={5}
          />
        </View>
      </View>

      <Input
        label="Category"
        value={item.category || ''}
        onChangeText={(v) => onUpdateRow(item.key, 'category', v)}
        placeholder="e.g. Tablet, Syrup, Capsule"
      />

      <Input
        label="Low Stock Alert"
        value={item.reorderLevel ? String(item.reorderLevel) : ''}
        onChangeText={(v) => onUpdateRow(item.key, 'reorderLevel', Math.max(0, parseInt(v) || 0))}
        keyboardType="numeric"
        placeholder="Alert when stock falls below..."
      />
    </View>
  );
}

export default memo(BulkImportRowItem);

const st = StyleSheet.create({
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
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
  },
  matchAuto: { backgroundColor: '#f0fdf4' },
  matchReview: { backgroundColor: '#fffbeb' },
  matchNew: { backgroundColor: colors.primary[50] },
  matchBadgeText: { fontFamily: font.semiBold, fontSize: 11, color: colors.textMuted },
  matchBadgeTextAuto: { color: '#15803d' },
});
