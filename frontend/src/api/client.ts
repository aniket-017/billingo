const BASE = '/api';
const TOKEN_KEY = 'auth_token';

function getAuthHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type Product = {
  _id: string;
  barcode: string;
  name: string;
  price: number;
  unit: string;
  description?: string;
  quantityOnHand?: number;
  reorderLevel?: number;
  costPrice?: number;
};

export type StockMovement = {
  _id: string;
  productId: { _id: string; name: string; barcode: string; unit?: string } | string;
  type: string;
  quantity: number;
  balanceAfter: number;
  date: string;
  referenceType: string;
  referenceId?: string | null;
  referenceLabel: string;
  notes: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: string;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  products: {
    list: (q?: string) => request<Product[]>(q ? `/products?q=${encodeURIComponent(q)}` : '/products'),
    get: (id: string) => request<Product>(`/products/${id}`),
    getByBarcode: (barcode: string) => request<Product>(`/products/by-barcode/${encodeURIComponent(barcode)}`),
    barcodeImageUrl: (id: string) => BASE + `/products/${id}/barcode.png`,
    generateBarcode: () => request<{ barcode: string }>('/products/generate-barcode', { method: 'POST' }),
    create: (body: {
      barcode: string;
      name: string;
      price: number;
      unit?: string;
      description?: string;
      openingQuantity?: number;
      reorderLevel?: number;
      costPrice?: number;
    }) => request<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
    update: (
      id: string,
      body: Partial<{
        barcode: string;
        name: string;
        price: number;
        unit: string;
        description: string;
        reorderLevel: number;
        costPrice: number | '';
      }>
    ) => request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/products/${id}`, { method: 'DELETE' }),
  },
  inventory: {
    movements: (params?: { productId?: string; from?: string; to?: string; type?: string; page?: number; limit?: number }) =>
      request<{ items: StockMovement[]; total: number; page: number; pageSize: number; totalPages: number }>(
        `/inventory/movements${params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : ''}`
      ),
    stockIn: (body: { productId: string; quantity: number; date?: string; notes?: string; referenceLabel?: string }) =>
      request<{ product: Product; movement: StockMovement }>('/inventory/stock-in', { method: 'POST', body: JSON.stringify(body) }),
    adjust: (body: { productId: string; quantityDelta: number; date?: string; notes?: string }) =>
      request<{ product: Product; movement: StockMovement }>('/inventory/adjust', { method: 'POST', body: JSON.stringify(body) }),
    summary: (q?: string) =>
      request<{
        items: (Product & { status: string; stockValue: number })[];
        totals: { productCount: number; totalUnits: number; totalStockValue: number; lowStockCount: number; outOfStockCount: number };
      }>(q ? `/inventory/summary?q=${encodeURIComponent(q)}` : '/inventory/summary'),
    lowStock: () => request<(Product & { status: string })[]>('/inventory/low-stock'),
  },
  customers: {
    list: (q?: string) => request<{ _id: string; name: string; phone: string; email: string; address: string }[]>(q ? `/customers?q=${encodeURIComponent(q)}` : '/customers'),
    get: (id: string) => request<{ _id: string; name: string; phone: string; email: string; address: string }>(`/customers/${id}`),
    create: (body: { name: string; phone?: string; email?: string; address?: string }) => request<{ _id: string }>('/customers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<{ name: string; phone: string; email: string; address: string }>) => request<{ _id: string }>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/customers/${id}`, { method: 'DELETE' }),
  },
  invoices: {
    list: (from?: string, to?: string, page?: number, pageSize?: number) =>
      request<any>(
        `/invoices${
          from || to || page || pageSize
            ? '?' +
              new URLSearchParams({
                ...(from && { from }),
                ...(to && { to }),
                ...(page && { page: String(page) }),
                ...(pageSize && { limit: String(pageSize) }),
              }).toString()
            : ''
        }`,
      ),
    get: (id: string) => request<any>(`/invoices/${id}`),
    create: (body: { customerId?: string; items: { productId: string; productName: string; barcode: string; quantity: number; unitPrice: number; amount: number }[]; tax?: number; notes?: string }) => request<any>('/invoices', { method: 'POST', body: JSON.stringify(body) }),
  },
  reports: {
    sales: (from?: string, to?: string) => request<{ summary: { totalSales: number; count: number }; byDay: { _id: string; total: number; count: number }[] }>(`/reports/sales${from || to ? '?' + new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString() : ''}`),
    inventory: (from?: string, to?: string) =>
      request<{
        movementSummary: { _id: string; totalQuantity: number; count: number }[];
        stock: { productCount: number; totalUnits: number; totalStockValue: number; lowStockCount: number; outOfStockCount: number };
        products: { _id: string; name: string; barcode: string; quantityOnHand: number; reorderLevel: number; status: string; stockValue: number }[];
      }>(`/reports/inventory${from || to ? '?' + new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString() : ''}`),
  },
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: { id: string; email: string; name: string; role: string } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () =>
      request<{ id: string; email: string; name: string; role: string }>('/auth/me'),
  },
  admin: {
    login: (email: string, password: string) =>
      request<{ token: string; user: { id: string; email: string; name: string; role: string } }>('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    createUser: (name: string, email: string, password: string, role?: 'user' | 'admin') =>
      request<{ id: string; name: string; email: string; role: string }>('/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role: role || 'user' }),
      }),
    listUsers: () =>
      request<{ _id: string; name: string; email: string; role: string }[]>('/admin/users'),
    updateUser: (id: string, body: { name: string; email: string; role: 'user' | 'admin' }) =>
      request<{ _id: string; name: string; email: string; role: string }>(`/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    deleteUser: (id: string) =>
      request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
  },
};
