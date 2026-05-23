import { useRef, useState, useCallback, useEffect } from 'react';
import { api } from '../api/client';
import { waitForWhatsAppDelivery, whatsAppSendFailureMessage } from '../utils/whatsappDelivery';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import Toast from '../components/Toast';

type CartItem = {
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  quantityOnHand: number;
};

export default function Billing() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string>('');
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string; email: string; address: string }[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const addByBarcode = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;
    try {
      const product = await api.products.getByBarcode(code);
      const onHand = product.quantityOnHand ?? 0;
      if (onHand <= 0) {
        setToast({ message: `${product.name} is out of stock`, type: 'error' });
        return;
      }
      let blocked = false;
      setCart((prev) => {
        const i = prev.find((x) => x.productId === product.id);
        if (i) {
          if (i.quantity >= onHand) {
            blocked = true;
            return prev;
          }
          const q = i.quantity + 1;
          return prev.map((x) =>
            x.productId === product.id
              ? { ...x, quantity: q, amount: q * x.unitPrice, quantityOnHand: onHand }
              : x
          );
        }
        return [
          ...prev,
          {
            productId: product.id,
            productName: product.name,
            barcode: product.barcode,
            quantity: 1,
            unitPrice: product.price,
            amount: product.price,
            quantityOnHand: onHand,
          },
        ];
      });
      if (blocked) {
        setToast({ message: `Only ${onHand} available for ${product.name}`, type: 'error' });
      } else {
        setToast({ message: `Added ${product.name}`, type: 'success' });
      }
    } catch {
      setToast({ message: 'Product not found for barcode', type: 'error' });
    }
  }, []);

  const { scannerContainerId, active, error, start, stop } = useBarcodeScanner(addByBarcode);

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = (e.target as HTMLInputElement).value;
      addByBarcode(v);
      (e.target as HTMLInputElement).value = '';
    }
  };

  const loadCustomers = useCallback(async (query?: string) => {
    const list = await api.customers.list(query || undefined);
    setCustomers(list);
    return list;
  }, []);

  // Load customer list on mount so it's always available without clicking "Load list"
  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadCustomers(value || undefined);
      searchDebounceRef.current = null;
    }, 200);
  };
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  const subtotal = cart.reduce((s, i) => s + i.amount, 0);
  const tax = 0;
  const total = subtotal + tax;

  const changeQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        const maxQty = item.quantityOnHand;
        const newQuantity = Math.max(1, Math.min(maxQty, item.quantity + delta));
        if (newQuantity === item.quantity) {
          if (delta > 0 && item.quantity >= maxQty) {
            setToast({ message: `Only ${maxQty} available for ${item.productName}`, type: 'error' });
          }
          return item;
        }
        return { ...item, quantity: newQuantity, amount: newQuantity * item.unitPrice };
      }),
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((x) => x.productId !== productId));
  };

  const clearCart = () => setCart([]);

  const openNewCustomer = () => {
    setCustomerForm({ name: '', phone: '', email: '', address: '' });
    setCustomerFormOpen(true);
  };

  const saveCustomer = async () => {
    const name = customerForm.name.trim();
    if (!name) {
      setToast({ message: 'Customer name is required', type: 'error' });
      return;
    }
    try {
      const res = await api.customers.create({
        name,
        phone: customerForm.phone.trim() || undefined,
        email: customerForm.email.trim() || undefined,
        address: customerForm.address.trim() || undefined,
      });
      setToast({ message: 'Customer added', type: 'success' });
      setCustomerFormOpen(false);
      await loadCustomers(customerSearch);
      setCustomerId(res.id);
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    }
  };

  const completeSale = async () => {
    if (cart.length === 0) {
      setToast({ message: 'Cart is empty', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      await api.invoices.create({
        customerId: customerId || undefined,
        items: cart,
        tax,
        notes: '',
      });
      setToast({ message: 'Sale completed', type: 'success' });
      setCart([]);
      setCustomerId('');
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const completeSaleAndSendInvoice = async () => {
    if (cart.length === 0) {
      setToast({ message: 'Cart is empty', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      const invoice = await api.invoices.create({
        customerId: customerId || undefined,
        items: cart,
        tax,
        notes: '',
        sendWhatsApp: true,
      });

      setCart([]);
      setCustomerId('');

      const send = invoice.whatsappSend;
      if (!send?.ok) {
        const detail = send && !send.ok ? whatsAppSendFailureMessage(send.reason) : 'WhatsApp send did not run.';
        setToast({
          message: `Sale completed. ${detail}`,
          type: 'error',
        });
        return;
      }

      setToast({ message: 'Sale completed. Waiting for WhatsApp delivery…', type: 'success' });

      const delivery = await waitForWhatsAppDelivery(invoice.id);
      if (delivery === 'delivered' || delivery === 'read') {
        setToast({
          message: 'Sale completed and invoice delivered on WhatsApp',
          type: 'success',
        });
      } else if (delivery === 'failed') {
        setToast({
          message: 'Sale completed. WhatsApp reported delivery failed.',
          type: 'error',
        });
      } else {
        setToast({
          message: 'Sale completed. Invoice sent on WhatsApp (delivery not confirmed yet).',
          type: 'success',
        });
      }
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Billing</h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4">
          <h3 className="font-semibold text-slate-700">Scan or enter barcode / QR code</h3>
          <input
            ref={barcodeInputRef}
            type="text"
            placeholder="Scan barcode or QR code, or type and press Enter"
            className="input text-lg"
            onKeyDown={handleBarcodeKeyDown}
            autoFocus
          />
          <div className="flex gap-2">
            {!active ? (
              <button type="button" onClick={start} className="btn-primary px-4 py-2">
                Open camera scanner
              </button>
            ) : (
              <button type="button" onClick={stop} className="btn-secondary px-4 py-2">
                Stop camera
              </button>
            )}
          </div>
          {/* Scanner container: always in DOM so start() can find it; visible when active */}
          <div
            id={scannerContainerId}
            className={active ? 'max-h-64 overflow-hidden rounded-xl border border-slate-200 [&_video]:max-h-64' : 'hidden'}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-700">Customer (optional)</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await loadCustomers(customerSearch);
                  setCustomerDropdownOpen(true);
                }}
                className="btn-ghost text-sm"
              >
                Load list
              </button>
              <button type="button" onClick={openNewCustomer} className="btn-secondary text-sm">
                Add customer
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <input
              type="search"
              placeholder="Search by name, mobile, email..."
              value={customerSearch}
              onFocus={() => setCustomerDropdownOpen(true)}
              onChange={(e) => {
                handleCustomerSearchChange(e.target.value);
                setCustomerDropdownOpen(true);
              }}
              className="input text-sm"
            />
            <div className="relative">
              <button
                type="button"
                className="input flex w-full items-center justify-between"
                onClick={() => setCustomerDropdownOpen((open) => !open)}
                onBlur={() => {
                  // small delay so click on option still registers
                  setTimeout(() => setCustomerDropdownOpen(false), 150);
                }}
              >
                <span className={customerId ? '' : 'text-slate-400'}>
                  {customerId
                    ? (() => {
                        const c = customers.find((x) => x.id === customerId);
                        if (!c) return '— None —';
                        return `${c.name}${c.phone ? ` · ${c.phone}` : ''}`;
                      })()
                    : '— None —'}
                </span>
                <span className="ml-2 text-xs text-slate-500">▼</span>
              </button>
              {customerDropdownOpen && customers.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center px-3 py-1.5 text-left hover:bg-slate-100"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setCustomerId('');
                      setCustomerDropdownOpen(false);
                    }}
                  >
                    — None —
                  </button>
                  {customers.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className={`flex w-full cursor-pointer items-center px-3 py-1.5 text-left hover:bg-slate-100 ${
                        c.id === customerId ? 'bg-primary-50 font-medium text-primary-700' : ''
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setCustomerId(c.id);
                        setCustomerDropdownOpen(false);
                      }}
                    >
                      <span>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-4 font-semibold text-slate-700">Cart</h3>
        {cart.length === 0 ? (
          <p className="text-slate-500">Cart is empty. Scan or enter a barcode or QR code to add items.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-right">Available</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((i) => (
                    <tr key={i.productId}>
                      <td>
                        {i.productName}
                        {i.quantityOnHand <= 0 && (
                          <span className="ml-2 text-xs text-red-600">Out of stock</span>
                        )}
                      </td>
                      <td className="text-right text-slate-600">{i.quantityOnHand}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => changeQuantity(i.productId, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100"
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className="min-w-[2rem] text-center">{i.quantity}</span>
                          <button
                            type="button"
                            onClick={() => changeQuantity(i.productId, 1)}
                            disabled={i.quantity >= i.quantityOnHand}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-primary-50 text-primary-700 hover:bg-primary-100 disabled:opacity-40"
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="text-right">{i.unitPrice.toFixed(2)}</td>
                      <td className="text-right font-medium">{i.amount.toFixed(2)}</td>
                      <td>
                        <button type="button" onClick={() => removeItem(i.productId)} className="btn-ghost text-red-600 text-sm">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-4">
              <div className="text-lg">
                <span className="text-slate-600">Subtotal:</span> <span className="font-semibold">{subtotal.toFixed(2)}</span>
                {tax > 0 && (
                  <>
                    <span className="ml-4 text-slate-600">Tax:</span> <span className="font-semibold">{tax.toFixed(2)}</span>
                  </>
                )}
                <span className="ml-4 text-slate-600">Total:</span> <span className="font-bold text-primary-700">{total.toFixed(2)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={clearCart} className="btn-secondary px-4 py-2">
                  Clear cart
                </button>
                <button type="button" onClick={completeSale} disabled={loading} className="btn-secondary px-6 py-2">
                  {loading ? 'Processing…' : 'Complete sale'}
                </button>
                <button
                  type="button"
                  onClick={completeSaleAndSendInvoice}
                  disabled={loading}
                  className="btn-primary px-6 py-2"
                >
                  {loading ? 'Sending / waiting for delivery…' : 'Complete sale and send invoice'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {customerFormOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setCustomerFormOpen(false)}>
          <div className="card w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold">Add customer</h3>
            <div className="space-y-3">
              <input
                className="input"
                placeholder="Name"
                value={customerForm.name}
                onChange={(e) => setCustomerForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Phone (optional)"
                value={customerForm.phone}
                onChange={(e) => setCustomerForm((f) => ({ ...f, phone: e.target.value }))}
              />
              <input
                className="input"
                type="email"
                placeholder="Email (optional)"
                value={customerForm.email}
                onChange={(e) => setCustomerForm((f) => ({ ...f, email: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Address (optional)"
                value={customerForm.address}
                onChange={(e) => setCustomerForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setCustomerFormOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={saveCustomer} className="btn-primary">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
