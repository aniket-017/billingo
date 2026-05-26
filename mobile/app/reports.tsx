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
import Card from '@/src/components/Card';
import Screen from '@/src/components/Screen';
import { colors, font, radius, shadows, spacing } from '@/src/theme';
import { formatCurrency } from '@/src/utils/format';

type Period = '7d' | '30d' | '90d' | 'all';
type DayData = { day: string; revenue: number; profit: number; count: number };
type TopProduct = { productId: string; productName: string; totalQty: number; totalRevenue: number; orderCount: number };

function periodDates(period: Period): { from?: string; to?: string } {
  if (period === 'all') return {};
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const from = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

function shortDay(isoDay: string): string {
  const d = new Date(isoDay);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
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
      const [salesData, topData] = await Promise.all([
        api.reports.sales(from, to),
        api.reports.topProducts(from, to, 10),
      ]);
      setSummary(salesData.summary);
      setByDay(salesData.byDay);
      setTopProducts(topData);
    } catch {
      setSummary({ totalSales: 0, count: 0, revenue: 0, cogs: 0, profit: 0 });
      setByDay([]);
      setTopProducts([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const maxRevenue = useMemo(() => Math.max(...byDay.map((d) => d.revenue), 1), [byDay]);
  const maxProfit = useMemo(() => Math.max(...byDay.map((d) => Math.abs(d.profit)), 1), [byDay]);
  const topMaxQty = useMemo(() => Math.max(...topProducts.map((p) => p.totalQty), 1), [topProducts]);

  // Limit chart bars to last N days for readability
  const chartData = useMemo(() => {
    if (byDay.length <= 15) return byDay;
    return byDay.slice(-15);
  }, [byDay]);

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={st.headerTitle}>Reports</Text>
        <View style={{ width: 34 }} />
      </View>

      {/* Period Tabs */}
      <View style={st.periodRow}>
        {(['7d', '30d', '90d', 'all'] as Period[]).map((p) => (
          <Pressable key={p} onPress={() => setPeriod(p)} style={[st.periodTab, period === p && st.periodTabActive]}>
            <Text style={[st.periodText, period === p && st.periodTextActive]}>
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : p === '90d' ? '90 Days' : 'All Time'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Summary Cards */}
          <View style={st.summaryGrid}>
            <SummaryCard icon="cash-outline" label="Revenue" value={formatCurrency(summary.revenue)} color={colors.primary[600]} />
            <SummaryCard icon="trending-up-outline" label="Profit" value={formatCurrency(summary.profit)} color={colors.success} />
            <SummaryCard icon="receipt-outline" label="Invoices" value={String(summary.count)} color="#8b5cf6" />
            <SummaryCard icon="pricetag-outline" label="COGS" value={formatCurrency(summary.cogs)} color={AMBER} />
          </View>

          {/* Revenue Chart */}
          {chartData.length > 0 ? (
            <Card style={st.chartCard}>
              <Text style={st.chartTitle}>Revenue Trend</Text>
              <View style={st.chart}>
                {chartData.map((d, i) => {
                  const h = Math.max(4, (d.revenue / maxRevenue) * MAX_BAR_H);
                  return (
                    <View key={d.day} style={st.barCol}>
                      <Text style={st.barValue}>{d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(0)}k` : String(Math.round(d.revenue))}</Text>
                      <View style={[st.bar, { height: h, backgroundColor: colors.primary[500] }]} />
                      <Text style={st.barLabel}>{shortDay(d.day)}</Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

          {/* Profit Chart */}
          {chartData.length > 0 ? (
            <Card style={st.chartCard}>
              <Text style={st.chartTitle}>Profit Trend</Text>
              <View style={st.chart}>
                {chartData.map((d) => {
                  const h = Math.max(4, (Math.abs(d.profit) / maxProfit) * MAX_BAR_H);
                  return (
                    <View key={d.day} style={st.barCol}>
                      <Text style={st.barValue}>{d.profit >= 1000 ? `${(d.profit / 1000).toFixed(0)}k` : String(Math.round(d.profit))}</Text>
                      <View style={[st.bar, { height: h, backgroundColor: d.profit >= 0 ? colors.success : colors.danger }]} />
                      <Text style={st.barLabel}>{shortDay(d.day)}</Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}

          {/* Top Selling Products */}
          <Card style={st.chartCard}>
            <Text style={st.chartTitle}>Top Selling Products</Text>
            {topProducts.length === 0 ? (
              <Text style={st.noData}>No sales data</Text>
            ) : (
              topProducts.map((p, i) => {
                const barW = Math.max(8, (p.totalQty / topMaxQty) * 100);
                return (
                  <View key={p.productId} style={st.topRow}>
                    <Text style={st.topRank}>{i + 1}</Text>
                    <View style={st.topInfo}>
                      <Text style={st.topName} numberOfLines={1}>{p.productName}</Text>
                      <View style={st.topBarTrack}>
                        <View style={[st.topBar, { width: `${barW}%` }]} />
                      </View>
                    </View>
                    <View style={st.topRight}>
                      <Text style={st.topQty}>{p.totalQty} sold</Text>
                      <Text style={st.topRev}>{formatCurrency(p.totalRevenue)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </Card>

          {/* Sales by Day Table */}
          {byDay.length > 0 ? (
            <Card style={st.chartCard}>
              <Text style={st.chartTitle}>Daily Breakdown</Text>
              <View style={st.tableHeader}>
                <Text style={[st.tableCell, st.tableCellDate]}>Date</Text>
                <Text style={[st.tableCell, st.tableCellNum]}>Sales</Text>
                <Text style={[st.tableCell, st.tableCellNum]}>Revenue</Text>
                <Text style={[st.tableCell, st.tableCellNum]}>Profit</Text>
              </View>
              {byDay.slice().reverse().slice(0, 30).map((d) => (
                <View key={d.day} style={st.tableRow}>
                  <Text style={[st.tableCell, st.tableCellDate]}>{shortDay(d.day)}</Text>
                  <Text style={[st.tableCell, st.tableCellNum]}>{d.count}</Text>
                  <Text style={[st.tableCell, st.tableCellNum]}>{formatCurrency(d.revenue)}</Text>
                  <Text style={[st.tableCell, st.tableCellNum, { color: d.profit >= 0 ? colors.success : colors.danger }]}>{formatCurrency(d.profit)}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          <View style={{ height: spacing.xl }} />
        </ScrollView>
      )}
    </View>
  );
}

const AMBER = '#f59e0b';

function SummaryCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={[st.summaryCard, { borderLeftColor: color }]}>
      <View style={st.summaryIconRow}>
        <View style={[st.summaryIcon, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon as any} size={18} color={color} />
        </View>
      </View>
      <Text style={st.summaryValue}>{value}</Text>
      <Text style={st.summaryLabel}>{label}</Text>
    </View>
  );
}

const MAX_BAR_H = 100;

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface[50] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  backBtn: { padding: 6 },
  headerTitle: { fontFamily: font.bold, fontSize: 20, color: colors.text },

  periodRow: { flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.xs, marginBottom: spacing.md },
  periodTab: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surface[100], alignItems: 'center' },
  periodTabActive: { backgroundColor: colors.primary[600] },
  periodText: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  periodTextActive: { color: colors.white },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: spacing.md },

  // Summary
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  summaryCard: {
    backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md,
    borderLeftWidth: 4, width: '48%', flexGrow: 1, ...shadows.card,
  },
  summaryIconRow: { marginBottom: spacing.xs },
  summaryIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { fontFamily: font.bold, fontSize: 18, color: colors.text, marginBottom: 2 },
  summaryLabel: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },

  // Chart
  chartCard: { marginBottom: spacing.sm },
  chartTitle: { fontFamily: font.semiBold, fontSize: 14, color: colors.text, marginBottom: spacing.md },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: MAX_BAR_H + 40 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '80%', borderRadius: 4, minWidth: 6 },
  barValue: { fontFamily: font.medium, fontSize: 8, color: colors.textMuted, marginBottom: 2 },
  barLabel: { fontFamily: font.regular, fontSize: 7, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  noData: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },

  // Top Products
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  topRank: { fontFamily: font.bold, fontSize: 14, color: colors.primary[600], width: 24, textAlign: 'center' },
  topInfo: { flex: 1, marginHorizontal: spacing.sm },
  topName: { fontFamily: font.medium, fontSize: 13, color: colors.text, marginBottom: 4 },
  topBarTrack: { height: 6, backgroundColor: colors.surface[100], borderRadius: 3 },
  topBar: { height: 6, backgroundColor: colors.primary[500], borderRadius: 3 },
  topRight: { alignItems: 'flex-end' },
  topQty: { fontFamily: font.semiBold, fontSize: 12, color: colors.text },
  topRev: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted },

  // Table
  tableHeader: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: colors.surface[200], paddingBottom: 6, marginBottom: 4 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableCell: { fontFamily: font.regular, fontSize: 12, color: colors.text },
  tableCellDate: { flex: 1.2 },
  tableCellNum: { flex: 1, textAlign: 'right' },
});
