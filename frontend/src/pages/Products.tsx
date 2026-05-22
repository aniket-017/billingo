import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { api, type Product } from '../api/client';
import Toast from '../components/Toast';

function stockStatusLabel(p: Product): { label: string; className: string } {
  const onHand = p.quantityOnHand ?? 0;
  const reorder = p.reorderLevel ?? 0;
  if (onHand <= 0) return { label: 'Out', className: 'bg-red-100 text-red-800' };
  if (reorder > 0 && onHand <= reorder) return { label: 'Low', className: 'bg-amber-100 text-amber-800' };
  return { label: 'In stock', className: 'bg-green-100 text-green-800' };
}

// Labels per page in grid (6 columns x 10 rows = 60 labels)
const LABELS_PER_PAGE = 60;
const COLS = 6;
const ROWS = 10;

export default function Products() {
  const [list, setList] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({
    barcode: '',
    name: '',
    price: '',
    unit: 'pcs',
    description: '',
    openingQuantity: '',
    reorderLevel: '',
    costPrice: '',
  });
  const [labelDialog, setLabelDialog] = useState<{ product: Product; mode: 'barcode' | 'qr' } | null>(null);
  const [labelDialogQty, setLabelDialogQty] = useState('60');
  const [printQty, setPrintQty] = useState<Record<string, number>>({});
  const [labelType, setLabelType] = useState<'barcode' | 'qr'>('barcode');
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!form.barcode.trim()) {
      setQrPreviewUrl(null);
      return;
    }
    getQRDataUrl(form.barcode).then(setQrPreviewUrl).catch(() => setQrPreviewUrl(null));
  }, [form.barcode]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.products.list(q || undefined);
      setList(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [q]);

  const openAdd = () => {
    setForm({ barcode: '', name: '', price: '', unit: 'pcs', description: '', openingQuantity: '', reorderLevel: '', costPrice: '' });
    setEditing(null);
    setModal('add');
  };

  const openEdit = (p: Product) => {
    setForm({
      barcode: p.barcode,
      name: p.name,
      price: String(p.price),
      unit: p.unit || 'pcs',
      description: p.description || '',
      openingQuantity: '',
      reorderLevel: p.reorderLevel != null ? String(p.reorderLevel) : '',
      costPrice: p.costPrice != null ? String(p.costPrice) : '',
    });
    setEditing(p);
    setModal('edit');
  };

  const generateBarcode = async () => {
    try {
      const { barcode } = await api.products.generateBarcode();
      setForm((f) => ({ ...f, barcode }));
      setToast({ message: 'Barcode generated', type: 'success' });
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    }
  };

  const save = async () => {
    const name = form.name.trim();
    const barcode = form.barcode.trim();
    const price = parseFloat(form.price);
    if (!name || !barcode || isNaN(price)) {
      setToast({ message: 'Name, barcode and price are required', type: 'error' });
      return;
    }
    try {
      const reorderLevel = form.reorderLevel.trim() ? Math.max(0, parseFloat(form.reorderLevel)) : 0;
      const costPrice = form.costPrice.trim() ? Math.max(0, parseFloat(form.costPrice)) : undefined;
      if (editing) {
        await api.products.update(editing.id, {
          barcode,
          name,
          price,
          unit: form.unit,
          description: form.description,
          reorderLevel,
          costPrice: costPrice ?? '',
        });
        setToast({ message: 'Product updated', type: 'success' });
      } else {
        const openingQuantity = form.openingQuantity.trim() ? Math.max(0, parseFloat(form.openingQuantity)) : 0;
        await api.products.create({
          barcode,
          name,
          price,
          unit: form.unit,
          description: form.description,
          openingQuantity,
          reorderLevel,
          costPrice,
        });
        setToast({ message: 'Product added', type: 'success' });
      }
      setModal(null);
      load();
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    try {
      await api.products.delete(id);
      setToast({ message: 'Product deleted', type: 'success' });
      load();
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    }
  };

  const getBarcodeDataUrl = (barcode: string): string => {
    const canvas = barcodeCanvasRef.current;
    if (!canvas) return '';
    JsBarcode(canvas, barcode, { format: 'CODE128', width: 2, height: 60, displayValue: true });
    return canvas.toDataURL('image/png');
  };

  const getQRDataUrl = (text: string): Promise<string> => {
    return QRCode.toDataURL(text, { width: 180, margin: 1 });
  };

  const openLabelsGridForItems = async (
    items: { product: Product; qty: number }[],
    mode: 'barcode' | 'qr',
    emptyMessage = 'Set quantity (≥1) for at least one product to print labels.',
  ) => {
    if (items.length === 0) {
      setToast({ message: emptyMessage, type: 'error' });
      return;
    }
    const canvas = barcodeCanvasRef.current;
    if (mode === 'barcode' && !canvas) return;
    const labels: { name: string; price: string; dataUrl: string }[] = [];
    for (const { product, qty } of items) {
      const dataUrl = mode === 'qr'
        ? await getQRDataUrl(product.barcode)
        : getBarcodeDataUrl(product.barcode);
      const name = product.name.replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const price = '₹' + product.price.toFixed(2);
      for (let i = 0; i < qty; i++) labels.push({ name, price, dataUrl });
    }
    const pages: { name: string; price: string; dataUrl: string }[][] = [];
    for (let i = 0; i < labels.length; i += LABELS_PER_PAGE) {
      pages.push(labels.slice(i, i + LABELS_PER_PAGE));
    }
    const labelsHtml = (pageLabels: { name: string; price: string; dataUrl: string }[]) => {
      const cells = pageLabels.map(
        (l) => `
        <div class="label-cell">
          <div class="label-inner">
            <div class="label-name">${l.name}</div>
            <img src="${l.dataUrl}" alt="" class="label-barcode" />
            <div class="label-price">${l.price}</div>
          </div>
        </div>`
      );
      while (cells.length < LABELS_PER_PAGE) cells.push('<div class="label-cell label-cell--empty"></div>');
      return cells.join('');
    };
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Labels</title>
      <style>
      @page { size: A4; margin: 4mm; }
      * { box-sizing: border-box; }
      body { font-family: system-ui, sans-serif; margin: 0; padding: 4mm; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .grid { display: grid; grid-template-columns: repeat(${COLS}, 1fr); grid-template-rows: repeat(${ROWS}, 1fr); gap: 0; width: 100%; min-height: 270mm; }
      .label-cell { border: 1px dashed #333; padding: 3px; display: flex; align-items: center; justify-content: center; min-height: 24mm; }
      .label-cell--empty { border-color: #ccc; }
      .label-inner { text-align: center; width: 100%; padding: 1px; }
      .label-name { font-size: 8px; font-weight: 600; margin-bottom: 1px; word-break: break-word; line-height: 1.1; }
      .label-barcode { max-width: 100%; height: 24px; object-fit: contain; }
      .label-price { font-size: 9px; font-weight: bold; margin-top: 1px; }
      @media print {
        body { padding: 0; background: white; }
        .page { min-height: 0; }
        .grid { min-height: 270mm; }
      }
      </style></head><body>
      ${pages.map((p) => `<div class="page"><div class="grid">${labelsHtml(p)}</div></div>`).join('')}
      </body></html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const openPrintLabelsGrid = async () => {
    const items: { product: Product; qty: number }[] = list
      .filter((p) => (printQty[p.id] || 0) > 0)
      .map((p) => ({ product: p, qty: printQty[p.id] || 0 }));
    await openLabelsGridForItems(items, labelType);
  };

  const openRowBarcodeGrid = async (p: Product) => {
    setLabelDialog({ product: p, mode: 'barcode' });
    setLabelDialogQty('60');
  };

  const openRowQrGrid = async (p: Product) => {
    setLabelDialog({ product: p, mode: 'qr' });
    setLabelDialogQty('60');
  };

  const confirmLabelDialog = async () => {
    if (!labelDialog) return;
    const qty = parseInt(labelDialogQty, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setToast({ message: 'Please enter a valid quantity (≥ 1).', type: 'error' });
      return;
    }
    await openLabelsGridForItems(
      [{ product: labelDialog.product, qty }],
      labelDialog.mode,
      'Quantity must be at least 1.',
    );
    setLabelDialog(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Products</h2>
          <p className="mt-1 text-sm text-slate-500">Manage items, stock levels, print labels, and keep prices in sync.</p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary px-4 py-2">
          Add product
        </button>
      </div>

      <div className="card">
        <div className="mb-4 space-y-3 md:flex md:items-center md:justify-between md:space-y-0 md:gap-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Search
            </label>
            <input
              type="search"
              placeholder="Search by name or barcode..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="input w-full max-w-xl"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Label type</span>
              <select
                value={labelType}
                onChange={(e) => setLabelType(e.target.value as 'barcode' | 'qr')}
                className="input py-1.5 text-sm"
              >
                <option value="barcode">Barcode</option>
                <option value="qr">QR code</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => openPrintLabelsGrid()}
              className="btn-primary px-4 py-2 whitespace-nowrap"
            >
              Print selected labels
            </button>
          </div>
        </div>
        {loading ? (
          <div className="py-10 text-center text-slate-500 text-sm">Loading products…</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Barcode</th>
                  <th>Name</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">On hand</th>
                  <th>Status</th>
                  <th>Unit</th>
                  <th className="w-24 text-center">Print qty</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-sm">{p.barcode}</td>
                    <td>{p.name}</td>
                    <td className="text-right">{p.price.toFixed(2)}</td>
                    <td className="text-right font-medium">{p.quantityOnHand ?? 0}</td>
                    <td>
                      {(() => {
                        const s = stockStatusLabel(p);
                        return (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
                            {s.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td>{p.unit}</td>
                    <td className="text-center">
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={printQty[p.id] ?? 0}
                        onChange={(e) => setPrintQty((prev) => ({ ...prev, [p.id]: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                        className="input w-20 py-1.5 text-center text-sm"
                      />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Link
                        to={`/inventory?productId=${p.id}`}
                        className="btn-ghost inline-flex items-center text-xs px-1 text-primary-700"
                      >
                        History
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="btn-ghost inline-flex items-center text-xs px-1"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                      onClick={() => openRowBarcodeGrid(p)}
                        className="btn-ghost inline-flex items-center text-xs px-1"
                      >
                        Print barcode
                      </button>
                      <button
                        type="button"
                      onClick={() => openRowQrGrid(p)}
                        className="btn-ghost inline-flex items-center text-xs px-1"
                      >
                        Print QR code
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProduct(p.id)}
                        className="btn-ghost inline-flex items-center text-red-600 text-xs px-1"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.length === 0 && !loading && <p className="mt-4 text-slate-500">No products. Add one to get started.</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="card w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold">{editing ? 'Edit product' : 'Add product'}</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Barcode or QR code value"
                  value={form.barcode}
                  onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                />
                <button type="button" onClick={generateBarcode} className="btn-secondary shrink-0">
                  Generate
                </button>
              </div>
              {qrPreviewUrl && (
                <div className="flex items-center gap-3 rounded border border-slate-200 bg-slate-50 p-3">
                  <img src={qrPreviewUrl} alt="QR preview" className="h-20 w-20 shrink-0" />
                  <span className="text-sm text-slate-600">QR code preview (same value as barcode — scannable at Billing)</span>
                </div>
              )}
              <input
                className="input"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                className="input"
                type="number"
                step="0.01"
                placeholder="Price"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Unit (e.g. pcs)"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              {!editing && (
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="Opening quantity (optional)"
                  value={form.openingQuantity}
                  onChange={(e) => setForm((f) => ({ ...f, openingQuantity: e.target.value }))}
                />
              )}
              <input
                className="input"
                type="number"
                min={0}
                step="any"
                placeholder="Reorder level (0 = no alert)"
                value={form.reorderLevel}
                onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))}
              />
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                placeholder="Cost price (optional)"
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={save} className="btn-primary">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {labelDialog && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setLabelDialog(null)}
        >
          <div
            className="card w-full max-w-xs shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-lg font-semibold">
              Print {labelDialog.mode === 'barcode' ? 'barcode' : 'QR code'} labels
            </h3>
            <p className="mb-3 text-sm text-slate-600 line-clamp-2">
              {labelDialog.product.name}
            </p>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Quantity
            </label>
            <input
              type="number"
              min={1}
              max={9999}
              value={labelDialogQty}
              onChange={(e) => setLabelDialogQty(e.target.value)}
              className="input w-full mb-4"
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLabelDialog(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLabelDialog}
                className="btn-primary"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={barcodeCanvasRef} className="hidden" />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
