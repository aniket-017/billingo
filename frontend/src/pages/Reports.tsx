import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

type Report = {
  summary: { totalSales: number; count: number; revenue: number; cogs: number; profit: number };
  byDay: { day: string; total: number; count: number; revenue: number; cogs: number; profit: number }[];
};

type InventoryReport = Awaited<ReturnType<typeof api.reports.inventory>>;

export default function Reports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<Report | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { load(); }, [from, to]);

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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Reports</h2>

      <div className="card">
        <h3 className="mb-4 font-semibold text-slate-700">Sales summary</h3>
        <div className="mb-4 flex flex-wrap gap-4">
          <input
            type="date"
            className="input w-40"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="From"
          />
          <input
            type="date"
            className="input w-40"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="To"
          />
          <button type="button" onClick={load} className="btn-secondary px-4 py-2">
            Apply
          </button>
          <button type="button" onClick={exportCsv} disabled={!data?.byDay?.length} className="btn-primary px-4 py-2">
            Export CSV
          </button>
        </div>
        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : data ? (
          <>
            <div className="mb-6 flex flex-wrap gap-6 rounded-xl border border-slate-200 bg-surface-50 p-4">
              <div>
                <p className="text-sm text-slate-600">Total sales (incl. tax)</p>
                <p className="text-2xl font-bold text-primary-700">₹{data.summary.totalSales.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Gross profit</p>
                <p
                  className={`text-2xl font-bold ${data.summary.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}
                >
                  ₹{data.summary.profit.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Revenue (line items)</p>
                <p className="text-2xl font-bold text-slate-800">₹{data.summary.revenue.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Cost of goods sold</p>
                <p className="text-2xl font-bold text-slate-600">₹{data.summary.cogs.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Number of invoices</p>
                <p className="text-2xl font-bold text-slate-800">{data.summary.count}</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Invoices</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">COGS</th>
                    <th className="text-right">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDay.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td className="text-right">{d.count}</td>
                      <td className="text-right">{d.total.toFixed(2)}</td>
                      <td className="text-right">{d.revenue.toFixed(2)}</td>
                      <td className="text-right text-slate-600">{d.cogs.toFixed(2)}</td>
                      <td
                        className={`text-right font-medium ${d.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}
                      >
                        {d.profit.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.byDay.length === 0 && <p className="mt-4 text-slate-500">No data for the selected range.</p>}
          </>
        ) : null}
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-700">Inventory summary</h3>
          <Link to="/inventory" className="text-sm font-medium text-primary-700 hover:underline">
            Open inventory →
          </Link>
        </div>
        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : inventoryData ? (
          <>
            <div className="mb-6 flex flex-wrap gap-6 rounded-xl border border-slate-200 bg-surface-50 p-4">
              <div>
                <p className="text-sm text-slate-600">Units on hand</p>
                <p className="text-2xl font-bold text-slate-800">{inventoryData.stock.totalUnits}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Stock value (cost)</p>
                <p className="text-2xl font-bold text-primary-700">₹{inventoryData.stock.totalStockValue.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Low stock items</p>
                <p className="text-2xl font-bold text-amber-600">{inventoryData.stock.lowStockCount}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600">Out of stock</p>
                <p className="text-2xl font-bold text-red-600">{inventoryData.stock.outOfStockCount}</p>
              </div>
            </div>
            {inventoryData.movementSummary.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-sm font-medium text-slate-600">Movements in date range</p>
                <div className="flex flex-wrap gap-3">
                  {inventoryData.movementSummary.map((m) => (
                    <span key={m.type} className="rounded-lg bg-slate-100 px-3 py-1 text-sm text-slate-700">
                      {m.type}: {m.totalQuantity} units ({m.count} entries)
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="table-wrap max-h-64 overflow-y-auto">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-right">On hand</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryData.products
                    .filter((p) => p.status !== 'in_stock')
                    .slice(0, 20)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td className="text-right">{p.quantityOnHand}</td>
                        <td>
                          <span
                            className={`text-xs font-medium ${p.status === 'out' ? 'text-red-600' : 'text-amber-600'}`}
                          >
                            {p.status === 'out' ? 'Out' : 'Low'}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {inventoryData.products.filter((p) => p.status !== 'in_stock').length === 0 && (
              <p className="text-slate-500">All products are adequately stocked.</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
