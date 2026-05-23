import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api, type Product, type StockMovement } from '../api/client';
import Toast from '../components/Toast';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString();
}

function productName(m: StockMovement): string {
  const p = m.productId;
  if (p && typeof p === 'object' && 'name' in p) return p.name;
  return '—';
}

const TYPE_LABELS: Record<string, string> = {
  OPENING: 'Opening',
  STOCK_IN: 'Stock in',
  SALE: 'Sale',
  ADJUSTMENT: 'Adjustment',
  RETURN_IN: 'Return',
};

export default function Inventory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filterProductId = searchParams.get('productId') || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.inventory.summary>> | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementTotal, setMovementTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [stockInForm, setStockInForm] = useState({
    productId: filterProductId,
    quantity: '',
    costPrice: '',
    date: todayISO(),
    notes: '',
    referenceLabel: '',
  });
  const [adjustForm, setAdjustForm] = useState({
    productId: filterProductId,
    quantityDelta: '',
    date: todayISO(),
    notes: '',
  });

  const loadProducts = useCallback(async () => {
    const list = await api.products.list();
    setProducts(list);
  }, []);

  const loadSummary = useCallback(async () => {
    const res = await api.inventory.summary();
    setSummary(res);
  }, []);

  const loadMovements = useCallback(async () => {
    const res = await api.inventory.movements({
      productId: filterProductId || undefined,
      from: from || undefined,
      to: to || undefined,
      type: typeFilter || undefined,
      limit: 100,
    });
    setMovements(res.items);
    setMovementTotal(res.total);
  }, [filterProductId, from, to, typeFilter]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadProducts(), loadSummary(), loadMovements()]);
    } finally {
      setLoading(false);
    }
  }, [loadProducts, loadSummary, loadMovements]);

  const onStockInProductChange = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    setStockInForm((f) => ({
      ...f,
      productId,
      costPrice: product?.costPrice != null ? String(product.costPrice) : '',
    }));
  };

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (filterProductId) {
      onStockInProductChange(filterProductId);
    }
    setAdjustForm((f) => ({ ...f, productId: filterProductId || f.productId }));
  }, [filterProductId, products]);

  const submitStockIn = async () => {
    const quantity = parseFloat(stockInForm.quantity);
    if (!stockInForm.productId || !Number.isFinite(quantity) || quantity <= 0) {
      setToast({ message: 'Select a product and enter quantity > 0', type: 'error' });
      return;
    }
    const costPrice =
      stockInForm.costPrice.trim() === '' ? undefined : parseFloat(stockInForm.costPrice);
    if (costPrice != null && (!Number.isFinite(costPrice) || costPrice < 0)) {
      setToast({ message: 'Enter a valid cost price', type: 'error' });
      return;
    }
    try {
      await api.inventory.stockIn({
        productId: stockInForm.productId,
        quantity,
        costPrice,
        date: stockInForm.date,
        notes: stockInForm.notes,
        referenceLabel: stockInForm.referenceLabel,
      });
      setToast({ message: 'Stock received', type: 'success' });
      setStockInForm((f) => ({ ...f, quantity: '', costPrice: '', notes: '', referenceLabel: '' }));
      await loadAll();
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    }
  };

  const submitAdjust = async () => {
    const quantityDelta = parseFloat(adjustForm.quantityDelta);
    if (!adjustForm.productId || !Number.isFinite(quantityDelta) || quantityDelta === 0) {
      setToast({ message: 'Select a product and enter a non-zero adjustment', type: 'error' });
      return;
    }
    try {
      await api.inventory.adjust({
        productId: adjustForm.productId,
        quantityDelta,
        date: adjustForm.date,
        notes: adjustForm.notes,
      });
      setToast({ message: 'Stock adjusted', type: 'success' });
      setAdjustForm((f) => ({ ...f, quantityDelta: '', notes: '' }));
      await loadAll();
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    }
  };

  const exportStockCsv = () => {
    if (!summary?.items.length) return;
    const headers = ['Barcode', 'Name', 'On hand', 'Unit', 'Reorder level', 'Status', 'Stock value'];
    const rows = summary.items.map((p) => [
      p.barcode,
      p.name,
      p.quantityOnHand ?? 0,
      p.unit,
      p.reorderLevel ?? 0,
      p.status,
      (p.stockValue ?? 0).toFixed(2),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory-stock.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearProductFilter = () => {
    searchParams.delete('productId');
    setSearchParams(searchParams);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Inventory</h2>
        <p className="mt-1 text-sm text-slate-500">
          Receive stock, adjust quantities, and view movement history for any product.
        </p>
      </div>

      {filterProductId && (
        <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm text-primary-800">
          <span>
            Filtered to product:{' '}
            <strong>{products.find((p) => p.id === filterProductId)?.name || filterProductId}</strong>
          </span>
          <button type="button" onClick={clearProductFilter} className="btn-ghost text-xs text-primary-700">
            Clear filter
          </button>
        </div>
      )}

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card">
            <p className="text-sm text-slate-600">Total units on hand</p>
            <p className="text-2xl font-bold text-slate-800">{summary.totals.totalUnits}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-600">Stock value (cost)</p>
            <p className="text-2xl font-bold text-primary-700">₹{summary.totals.totalStockValue.toFixed(2)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-600">Low stock</p>
            <p className="text-2xl font-bold text-amber-600">{summary.totals.lowStockCount}</p>
          </div>
          <div className="card">
            <p className="text-sm text-slate-600">Out of stock</p>
            <p className="text-2xl font-bold text-red-600">{summary.totals.outOfStockCount}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="font-semibold text-slate-700">Receive stock</h3>
          <select
            className="input"
            value={stockInForm.productId}
            onChange={(e) => onStockInProductChange(e.target.value)}
          >
            <option value="">Select product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.quantityOnHand ?? 0} {p.unit})
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0.01}
            step="any"
            className="input"
            placeholder="Quantity received"
            value={stockInForm.quantity}
            onChange={(e) => setStockInForm((f) => ({ ...f, quantity: e.target.value }))}
          />
          <input
            type="number"
            min={0}
            step="any"
            className="input"
            placeholder="Cost price per unit"
            value={stockInForm.costPrice}
            onChange={(e) => setStockInForm((f) => ({ ...f, costPrice: e.target.value }))}
          />
          <input
            type="date"
            className="input"
            value={stockInForm.date}
            onChange={(e) => setStockInForm((f) => ({ ...f, date: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Reference (e.g. bill #)"
            value={stockInForm.referenceLabel}
            onChange={(e) => setStockInForm((f) => ({ ...f, referenceLabel: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Notes"
            value={stockInForm.notes}
            onChange={(e) => setStockInForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <button type="button" onClick={submitStockIn} className="btn-primary px-4 py-2">
            Record stock in
          </button>
        </div>

        <div className="card space-y-3">
          <h3 className="font-semibold text-slate-700">Adjust stock</h3>
          <select
            className="input"
            value={adjustForm.productId}
            onChange={(e) => setAdjustForm((f) => ({ ...f, productId: e.target.value }))}
          >
            <option value="">Select product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.quantityOnHand ?? 0} {p.unit})
              </option>
            ))}
          </select>
          <input
            type="number"
            step="any"
            className="input"
            placeholder="Change (+ or −)"
            value={adjustForm.quantityDelta}
            onChange={(e) => setAdjustForm((f) => ({ ...f, quantityDelta: e.target.value }))}
          />
          <input
            type="date"
            className="input"
            value={adjustForm.date}
            onChange={(e) => setAdjustForm((f) => ({ ...f, date: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Reason (damage, count fix, etc.)"
            value={adjustForm.notes}
            onChange={(e) => setAdjustForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <button type="button" onClick={submitAdjust} className="btn-secondary px-4 py-2">
            Apply adjustment
          </button>
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-slate-700">Current stock</h3>
          <button type="button" onClick={exportStockCsv} disabled={!summary?.items.length} className="btn-primary px-4 py-2">
            Export CSV
          </button>
        </div>
        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Barcode</th>
                  <th className="text-right">On hand</th>
                  <th>Unit</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {summary?.items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="font-mono text-sm">{p.barcode}</td>
                    <td className="text-right font-medium">{p.quantityOnHand ?? 0}</td>
                    <td>{p.unit}</td>
                    <td>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.status === 'out'
                            ? 'bg-red-100 text-red-800'
                            : p.status === 'low'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {p.status === 'out' ? 'Out' : p.status === 'low' ? 'Low' : 'In stock'}
                      </span>
                    </td>
                    <td>
                      <Link
                        to={`/inventory?productId=${p.id}`}
                        className="btn-ghost text-xs text-primary-700"
                      >
                        History
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="mb-4 font-semibold text-slate-700">Movement history</h3>
        <div className="mb-4 flex flex-wrap gap-3">
          <input type="date" className="input w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          <select className="input w-40" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="button" onClick={loadMovements} className="btn-secondary px-4 py-2">
            Apply filters
          </button>
        </div>
        <p className="mb-2 text-xs text-slate-500">{movementTotal} movement(s)</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Type</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Balance after</th>
                <th>Reference</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{formatDate(m.date)}</td>
                  <td>{productName(m)}</td>
                  <td>{TYPE_LABELS[m.type] || m.type}</td>
                  <td className="text-right">{m.quantity}</td>
                  <td className="text-right">{m.balanceAfter}</td>
                  <td className="text-sm">{m.referenceLabel || m.referenceType}</td>
                  <td className="max-w-[12rem] truncate text-sm text-slate-600">{m.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {movements.length === 0 && !loading && (
          <p className="mt-4 text-slate-500">No movements for the selected filters.</p>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
