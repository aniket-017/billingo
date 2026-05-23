import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import ChartCard from '../components/reports/ChartCard';
import ReportStatCard from '../components/reports/ReportStatCard';
import { CHART_COLORS, formatDayLabel, formatRupee } from '../components/reports/chartTheme';

type Report = {
  summary: { totalSales: number; count: number; revenue: number; cogs: number; profit: number };
  byDay: { day: string; total: number; count: number; revenue: number; cogs: number; profit: number }[];
};

type InventoryReport = Awaited<ReturnType<typeof api.reports.inventory>>;

const MOVEMENT_LABELS: Record<string, string> = {
  OPENING: 'Opening',
  STOCK_IN: 'Stock in',
  SALE: 'Sale',
  ADJUSTMENT: 'Adjustment',
  RETURN_IN: 'Return',
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

type DatePreset = '7d' | '30d' | '90d' | 'all';

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-card backdrop-blur-sm">
      <p className="mb-2 text-xs font-semibold text-slate-500">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <p key={entry.name} className="flex items-center gap-2 text-sm text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-500">{entry.name}</span>
            <span className="ml-auto font-semibold tabular-nums">
              {typeof entry.value === 'number' && entry.name.toLowerCase().includes('invoice')
                ? entry.value
                : formatRupee(entry.value)}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

function FinancialMixTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { total: number; color: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const value = Number(entry.value ?? 0);
  const total = entry.payload?.total ?? 0;
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-card backdrop-blur-sm">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.payload?.color }} />
        {entry.name}
      </p>
      <p className="mt-1 text-sm tabular-nums text-slate-600">
        {formatRupee(value)}{' '}
        <span className="font-semibold text-slate-800">({pct}%)</span>
      </p>
      <p className="mt-1 text-xs text-slate-500">of {formatRupee(total)} revenue</p>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-surface-50/80 text-center">
      <svg className="mb-3 h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
      <p className="max-w-xs text-sm text-slate-500">{message}</p>
    </div>
  );
}

export default function Reports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preset, setPreset] = useState<DatePreset>('all');
  const [data, setData] = useState<Report | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);

  const applyPreset = (p: DatePreset) => {
    setPreset(p);
    if (p === 'all') {
      setFrom('');
      setTo('');
      return;
    }
    const days = p === '7d' ? 7 : p === '30d' ? 30 : 90;
    setFrom(daysAgoISO(days));
    setTo(todayISO());
  };

  const load = async () => {
    setLoading(true);
    try {
      const [sales, inventory] = await Promise.all([
        api.reports.sales(from || undefined, to || undefined),
        api.reports.inventory(from || undefined, to || undefined),
      ]);
      setData(sales);
      setInventoryData(inventory);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [from, to]);

  const chartData = useMemo(
    () =>
      (data?.byDay ?? []).map((d) => ({
        ...d,
        label: formatDayLabel(d.day),
      })),
    [data?.byDay]
  );

  const financialBreakdown = useMemo(() => {
    if (!data) return [];
    const { revenue, cogs, profit } = data.summary;
    const total = revenue > 0 ? revenue : Math.max(0, cogs) + Math.max(0, profit);
    return [
      { name: 'COGS', value: Math.max(0, cogs), color: CHART_COLORS.amber, total },
      { name: 'Gross profit', value: Math.max(0, profit), color: CHART_COLORS.emerald, total },
    ].filter((x) => x.value > 0);
  }, [data]);

  const stockHealth = useMemo(() => {
    if (!inventoryData) return [];
    const { productCount, lowStockCount, outOfStockCount } = inventoryData.stock;
    const inStock = Math.max(0, productCount - lowStockCount - outOfStockCount);
    return [
      { name: 'In stock', value: inStock, color: CHART_COLORS.emerald },
      { name: 'Low stock', value: lowStockCount, color: CHART_COLORS.amber },
      { name: 'Out of stock', value: outOfStockCount, color: CHART_COLORS.rose },
    ].filter((x) => x.value > 0);
  }, [inventoryData]);

  const movementChartData = useMemo(
    () =>
      (inventoryData?.movementSummary ?? []).map((m) => ({
        name: MOVEMENT_LABELS[m.type] ?? m.type,
        units: Math.abs(m.totalQuantity),
        entries: m.count,
      })),
    [inventoryData?.movementSummary]
  );

  const exportCsv = () => {
    if (!data) return;
    const headers = ['Date', 'Invoices', 'Total', 'Revenue', 'COGS', 'Profit'];
    const rows = data.byDay.map((d) => [
      d.day,
      d.count,
      d.total.toFixed(2),
      d.revenue.toFixed(2),
      d.cogs.toFixed(2),
      d.profit.toFixed(2),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${from || 'all'}-${to || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lowStockProducts = inventoryData?.products.filter((p) => p.status !== 'in_stock') ?? [];

  return (
    <div className="space-y-8 pb-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Reports</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sales performance, profit trends, and inventory insights at a glance.
          </p>
        </div>
        <Link
          to="/inventory"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 shadow-soft transition hover:border-primary-200 hover:bg-primary-50"
        >
          Inventory
          <span aria-hidden>→</span>
        </Link>
      </div>

      {/* Date filters */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['7d', 'Last 7 days'],
                ['30d', 'Last 30 days'],
                ['90d', 'Last 90 days'],
                ['all', 'All time'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => applyPreset(key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  preset === key
                    ? 'bg-primary-600 text-white shadow-soft'
                    : 'bg-surface-100 text-slate-600 hover:bg-surface-200 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
            <input
              type="date"
              className="input w-40"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset('all');
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
            <input
              type="date"
              className="input w-40"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset('all');
              }}
            />
          </div>
          <button type="button" onClick={load} className="btn-secondary px-4 py-2.5">
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data?.byDay?.length}
            className="btn-primary ml-auto px-4 py-2.5"
          >
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-80 animate-pulse rounded-2xl bg-slate-200/60" />
            <div className="h-80 animate-pulse rounded-2xl bg-slate-200/60" />
          </div>
        </div>
      ) : data ? (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ReportStatCard
              label="Revenue"
              value={formatRupee(data.summary.revenue)}
              hint="COGS + gross profit"
              accent="primary"
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            />
            <ReportStatCard
              label="Gross profit"
              value={formatRupee(data.summary.profit)}
              hint={data.summary.profit >= 0 ? 'Healthy margin' : 'Below cost'}
              accent={data.summary.profit >= 0 ? 'emerald' : 'rose'}
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              }
            />
            <ReportStatCard
              label="COGS"
              value={formatRupee(data.summary.cogs)}
              hint="Cost of goods"
              accent="amber"
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
            />
            <ReportStatCard
              label="Invoices"
              value={String(data.summary.count)}
              hint="In selected period"
              accent="slate"
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            />
          </div>

          {/* Sales charts */}
          <div className="grid gap-6 lg:grid-cols-3">
            <ChartCard
              title="Sales & profit trend"
              subtitle="Daily revenue and gross profit"
              className="lg:col-span-2"
            >
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.emerald} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={CHART_COLORS.emerald} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.slateLight} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatRupee(v, true)}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke={CHART_COLORS.primary}
                      strokeWidth={2.5}
                      fill="url(#revenueGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="Gross profit"
                      stroke={CHART_COLORS.emerald}
                      strokeWidth={2.5}
                      fill="url(#profitGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No sales data for this period. Try a wider date range." />
              )}
            </ChartCard>

            <ChartCard
              title="Financial mix"
              subtitle="COGS and gross profit as a share of revenue"
            >
              {financialBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={financialBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                    >
                      {financialBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<FinancialMixTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No financial breakdown available." />
              )}
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Daily invoices" subtitle="Transaction volume by day">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.slateLight} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Invoices" fill={CHART_COLORS.violet} radius={[6, 6, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No invoice activity in this period." />
              )}
            </ChartCard>

            <ChartCard title="Daily sales table" subtitle="Detailed breakdown">
              <div className="table-wrap max-h-64 overflow-y-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="text-right">Inv.</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byDay.map((d) => (
                      <tr key={d.day}>
                        <td className="font-medium text-slate-700">{d.day}</td>
                        <td className="text-right tabular-nums">{d.count}</td>
                        <td className="text-right tabular-nums">{d.total.toFixed(2)}</td>
                        <td
                          className={`text-right font-medium tabular-nums ${d.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
                        >
                          {d.profit.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.byDay.length === 0 && (
                <p className="mt-3 text-center text-sm text-slate-500">No rows for the selected range.</p>
              )}
            </ChartCard>
          </div>
        </>
      ) : null}

      {/* Inventory section */}
      {!loading && inventoryData ? (
        <section className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Inventory insights</h3>
            <p className="text-sm text-slate-500">Stock health and movement activity</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReportStatCard
              label="Units on hand"
              value={inventoryData.stock.totalUnits.toLocaleString('en-IN')}
              accent="slate"
            />
            <ReportStatCard
              label="Stock value"
              value={formatRupee(inventoryData.stock.totalStockValue)}
              hint="At cost"
              accent="primary"
            />
            <ReportStatCard
              label="Low stock"
              value={String(inventoryData.stock.lowStockCount)}
              accent="amber"
            />
            <ReportStatCard
              label="Out of stock"
              value={String(inventoryData.stock.outOfStockCount)}
              accent="rose"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Stock health" subtitle="Products by availability status">
              {stockHealth.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={stockHealth}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={88}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                    >
                      {stockHealth.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [`${Number(value ?? 0)} products`, String(name)]}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No product data available." />
              )}
            </ChartCard>

            <ChartCard title="Stock movements" subtitle="Activity in selected date range">
              {movementChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={movementChartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.slateLight} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={88}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [`${Number(value ?? 0)} units`, 'Quantity']}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="units" fill={CHART_COLORS.primary} radius={[0, 6, 6, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No stock movements in this period." />
              )}
            </ChartCard>
          </div>

          {inventoryData.movementSummary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {inventoryData.movementSummary.map((m) => (
                <span
                  key={m.type}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 shadow-soft"
                >
                  <span className="font-semibold text-primary-700">{MOVEMENT_LABELS[m.type] ?? m.type}</span>
                  <span className="text-slate-400">·</span>
                  <span>{m.totalQuantity} units</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{m.count} entries</span>
                </span>
              ))}
            </div>
          )}

          <ChartCard
            title="Attention needed"
            subtitle="Low or out-of-stock products"
            action={
              <Link to="/inventory" className="text-sm font-medium text-primary-600 hover:text-primary-700">
                Manage stock →
              </Link>
            }
          >
            {lowStockProducts.length > 0 ? (
              <div className="table-wrap max-h-72 overflow-y-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="text-right">On hand</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockProducts.slice(0, 20).map((p) => (
                      <tr key={p.id}>
                        <td className="font-medium text-slate-700">{p.name}</td>
                        <td className="text-right tabular-nums">{p.quantityOnHand}</td>
                        <td>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              p.status === 'out' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {p.status === 'out' ? 'Out of stock' : 'Low stock'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-4 text-emerald-800">
                <svg className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium">All products are adequately stocked.</p>
              </div>
            )}
          </ChartCard>
        </section>
      ) : null}
    </div>
  );
}
