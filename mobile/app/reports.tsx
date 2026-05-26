import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/api/client';
import { colors, font, radius, shadows, spacing } from '@/src/theme';
import { formatCurrency } from '@/src/utils/format';

type Period = '7d' | '30d' | '90d' | 'all';
type DayData = { day: string; revenue: number; profit: number; count: number };
type TopProduct = { productId: string; productName: string; totalQty: number; totalRevenue: number; orderCount: number };

const PURPLE = '#8b5cf6';
const AMBER = '#f59e0b';
const BAR_H = 110;

function periodDates(p: Period): { from?: string; to?: string } {
  if (p === 'all') return {};
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const days = p === '7d' ? 7 : p === '30d' ? 30 : 90;
  return { from: new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10), to };
}

function shortDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`;
}

function compactNum(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('30d');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ totalSales: 0, count: 0, revenue: 0, cogs: 0, profit: 0 });
  const [byDay, setByDay] = useState<DayData[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = periodDates(period);
      const [sales, top] = await Promise.all([
        api.reports.sales(from, to),
        api.reports.topProducts(from, to, 10),
      ]);
      setSummary(sales.summary);
      setByDay(sales.byDay);
      setTopProducts(top);
    } catch {
      setSummary({ totalSales: 0, count: 0, revenue: 0, cogs: 0, profit: 0 });
      setByDay([]);
      setTopProducts([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  const maxRev = useMemo(() => Math.max(...byDay.map((d) => d.revenue), 1), [byDay]);
  const maxProf = useMemo(() => Math.max(...byDay.map((d) => Math.abs(d.profit)), 1), [byDay]);
  const topMax = useMemo(() => Math.max(...topProducts.map((p) => p.totalQty), 1), [topProducts]);

  const chartDays = useMemo(() => {
    const max = 10;
    return byDay.length <= max ? byDay : byDay.slice(-max);
  }, [byDay]);

  const marginPct = summary.revenue > 0 ? ((summary.profit / summary.revenue) * 100).toFixed(1) : '0';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>Reports</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Period pills */}
      <View style={s.pillRow}>
        {(['7d', '30d', '90d', 'all'] as Period[]).map((p) => (
          <Pressable key={p} onPress={() => setPeriod(p)} style={[s.pill, period === p && s.pillActive]}>
            <Text style={[s.pillText, period === p && s.pillTextActive]}>
              {p === '7d' ? '7D' : p === '30d' ? '30D' : p === '90d' ? '90D' : 'All'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={s.loadWrap}><ActivityIndicator size="large" color={colors.primary[600]} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* KPI Row */}
          <View style={s.kpiRow}>
            <KpiCard label="Revenue" value={formatCurrency(summary.revenue)} sub={`${summary.count} sales`} color={colors.primary[600]} icon="wallet-outline" />
            <KpiCard label="Profit" value={formatCurrency(summary.profit)} sub={`${marginPct}% margin`} color={colors.success} icon="trending-up-outline" />
          </View>
          <View style={s.kpiRow}>
            <KpiCard label="Invoices" value={String(summary.count)} color={PURPLE} icon="receipt-outline" />
            <KpiCard label="COGS" value={formatCurrency(summary.cogs)} color={AMBER} icon="cube-outline" />
          </View>

          {/* Revenue Chart */}
          {chartDays.length > 0 ? (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.cardTitle}>Revenue</Text>
                <Text style={s.cardSub}>{compactNum(summary.revenue)} total</Text>
              </View>
              <View style={s.chartWrap}>
                {chartDays.map((d) => {
                  const pct = d.revenue / maxRev;
                  return (
                    <View key={d.day} style={s.barCol}>
                      <Text style={s.barTip}>{compactNum(d.revenue)}</Text>
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { height: `${Math.max(3, pct * 100)}%`, backgroundColor: colors.primary[500] }]} />
                      </View>
                      <Text style={s.barDay}>{new Date(d.day).getDate()}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={s.chartLegend}>
                <Text style={s.chartLegendText}>{shortDay(chartDays[0].day)} — {shortDay(chartDays[chartDays.length - 1].day)}</Text>
              </View>
            </View>
          ) : null}

          {/* Profit Chart */}
          {chartDays.length > 0 ? (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.cardTitle}>Profit</Text>
                <Text style={[s.cardSub, { color: summary.profit >= 0 ? colors.success : colors.danger }]}>{compactNum(summary.profit)} total</Text>
              </View>
              <View style={s.chartWrap}>
                {chartDays.map((d) => {
                  const pct = Math.abs(d.profit) / maxProf;
                  return (
                    <View key={d.day} style={s.barCol}>
                      <Text style={s.barTip}>{compactNum(d.profit)}</Text>
                      <View style={s.barTrack}>
                        <View style={[s.barFill, { height: `${Math.max(3, pct * 100)}%`, backgroundColor: d.profit >= 0 ? colors.success : colors.danger }]} />
                      </View>
                      <Text style={s.barDay}>{new Date(d.day).getDate()}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={s.chartLegend}>
                <Text style={s.chartLegendText}>{shortDay(chartDays[0].day)} — {shortDay(chartDays[chartDays.length - 1].day)}</Text>
              </View>
            </View>
          ) : null}

          {/* Top Selling */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Top Sellers</Text>
              <Ionicons name="trophy-outline" size={16} color={AMBER} />
            </View>
            {topProducts.length === 0 ? (
              <Text style={s.empty}>No sales data for this period</Text>
            ) : (
              topProducts.map((p, i) => {
                const pct = (p.totalQty / topMax) * 100;
                const medal = i === 0 ? AMBER : i === 1 ? '#94a3b8' : i === 2 ? '#b87333' : undefined;
                return (
                  <View key={p.productId} style={s.topRow}>
                    <View style={[s.topRankCircle, medal ? { backgroundColor: medal + '20' } : undefined]}>
                      <Text style={[s.topRankNum, medal ? { color: medal } : undefined]}>{i + 1}</Text>
                    </View>
                    <View style={s.topBody}>
                      <View style={s.topNameRow}>
                        <Text style={s.topName} numberOfLines={1}>{p.productName}</Text>
                        <Text style={s.topQty}>{p.totalQty}</Text>
                      </View>
                      <View style={s.topTrack}>
                        <View style={[s.topFill, { width: `${Math.max(4, pct)}%` }, i === 0 && { backgroundColor: AMBER }]} />
                      </View>
                      <Text style={s.topRev}>{formatCurrency(p.totalRevenue)} revenue</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Daily Table */}
          {byDay.length > 0 ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>Daily Breakdown</Text>
              <View style={[s.tRow, s.tHead]}>
                <Text style={[s.tCell, s.tCellDate, s.tHeadText]}>Date</Text>
                <Text style={[s.tCell, s.tCellNum, s.tHeadText]}>Sales</Text>
                <Text style={[s.tCell, s.tCellNum, s.tHeadText]}>Revenue</Text>
                <Text style={[s.tCell, s.tCellNum, s.tHeadText]}>Profit</Text>
              </View>
              {byDay.slice().reverse().slice(0, 30).map((d, i) => (
                <View key={d.day} style={[s.tRow, i % 2 === 0 && s.tRowAlt]}>
                  <Text style={[s.tCell, s.tCellDate]}>{shortDay(d.day)}</Text>
                  <Text style={[s.tCell, s.tCellNum]}>{d.count}</Text>
                  <Text style={[s.tCell, s.tCellNum]}>{compactNum(d.revenue)}</Text>
                  <Text style={[s.tCell, s.tCellNum, { color: d.profit >= 0 ? colors.success : colors.danger }]}>{compactNum(d.profit)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ height: spacing.xl * 2 }} />
        </ScrollView>
      )}
    </View>
  );
}

function KpiCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: string }) {
  return (
    <View style={s.kpiCard}>
      <View style={[s.kpiIcon, { backgroundColor: color + '12' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface[50] },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 10 },
  backBtn: { padding: 6 },
  headerTitle: { fontFamily: font.bold, fontSize: 20, color: colors.text },

  pillRow: { flexDirection: 'row', marginHorizontal: spacing.md, backgroundColor: colors.surface[100], borderRadius: 10, padding: 3, marginBottom: spacing.md },
  pill: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  pillActive: { backgroundColor: colors.primary[600], ...shadows.card },
  pillText: { fontFamily: font.semiBold, fontSize: 13, color: colors.textMuted },
  pillTextActive: { color: colors.white },

  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: spacing.md },

  // KPI
  kpiRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  kpiCard: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, ...shadows.card,
  },
  kpiIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  kpiValue: { fontFamily: font.bold, fontSize: 20, color: colors.text },
  kpiLabel: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  kpiSub: { fontFamily: font.regular, fontSize: 11, color: colors.surface[300], marginTop: 2 },

  // Card
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadows.card },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  cardTitle: { fontFamily: font.semiBold, fontSize: 15, color: colors.text },
  cardSub: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  empty: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  // Bar chart
  chartWrap: { flexDirection: 'row', alignItems: 'flex-end', height: BAR_H + 30, gap: 3 },
  barCol: { flex: 1, alignItems: 'center', height: BAR_H + 30, justifyContent: 'flex-end' },
  barTip: { fontFamily: font.medium, fontSize: 8, color: colors.textMuted, marginBottom: 3 },
  barTrack: { width: '65%', maxWidth: 22, height: BAR_H, borderRadius: 6, backgroundColor: colors.surface[50], justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 6 },
  barDay: { fontFamily: font.medium, fontSize: 9, color: colors.textMuted, marginTop: 4 },
  chartLegend: { alignItems: 'center', marginTop: spacing.sm },
  chartLegendText: { fontFamily: font.regular, fontSize: 10, color: colors.surface[300] },

  // Top sellers
  topRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surface[100] },
  topRankCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface[100], alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 2 },
  topRankNum: { fontFamily: font.bold, fontSize: 12, color: colors.textMuted },
  topBody: { flex: 1 },
  topNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  topName: { fontFamily: font.medium, fontSize: 13, color: colors.text, flex: 1, marginRight: spacing.sm },
  topQty: { fontFamily: font.bold, fontSize: 13, color: colors.primary[700] },
  topTrack: { height: 5, backgroundColor: colors.surface[100], borderRadius: 3, marginBottom: 4 },
  topFill: { height: 5, backgroundColor: colors.primary[500], borderRadius: 3 },
  topRev: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted },

  // Table
  tRow: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 4 },
  tRowAlt: { backgroundColor: colors.surface[50], borderRadius: 6 },
  tHead: { borderBottomWidth: 0, marginBottom: 2 },
  tHeadText: { fontFamily: font.semiBold, color: colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  tCell: { fontFamily: font.regular, fontSize: 12, color: colors.text },
  tCellDate: { flex: 1.3 },
  tCellNum: { flex: 1, textAlign: 'right' },
});
