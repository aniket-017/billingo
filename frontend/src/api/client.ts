const BASE = '/api';
const TOKEN_KEY = 'auth_token';

function getAuthHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type BusinessSettings = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
};

export type Product = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  unit: string;
  description?: string;
  quantityOnHand?: number;
  reorderLevel?: number;
  costPrice?: number | null;
};

export type StockMovement = {
  id: string;
  productId: { id: string; name: string; barcode: string; unit?: string } | string;
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

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};

export type Business = {
  id: string;
  slug: string;
  name: string;
  schemaName: string;
  status: string;
  userCount?: number;
};

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  businessId?: string | null;
  businessName?: string;
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
    list: (q?: string) => request<Customer[]>(q ? `/customers?q=${encodeURIComponent(q)}` : '/customers'),
    get: (id: string) => request<Customer>(`/customers/${id}`),
    create: (body: { name: string; phone?: string; email?: string; address?: string }) =>
      request<Customer>('/customers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<{ name: string; phone: string; email: string; address: string }>) =>
      request<Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/customers/${id}`, { method: 'DELETE' }),
  },
  invoices: {
    list: (from?: string, to?: string, page?: number, pageSize?: number) =>
      request<{ items: Invoice[]; total: number; page: number; pageSize: number; totalPages: number }>(
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
        }`
      ),
    get: (id: string) => request<Invoice>(`/invoices/${id}`),
    create: (body: {
      customerId?: string;
      items: { productId: string; productName: string; barcode: string; quantity: number; unitPrice: number; amount: number }[];
      tax?: number;
      notes?: string;
      sendWhatsApp?: boolean;
    }) => request<Invoice>('/invoices', { method: 'POST', body: JSON.stringify(body) }),
  },
  reports: {
    sales: (from?: string, to?: string) =>
      request<{ summary: { totalSales: number; count: number }; byDay: { day: string; total: number; count: number }[] }>(
        `/reports/sales${from || to ? '?' + new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString() : ''}`
      ),
    inventory: (from?: string, to?: string) =>
      request<{
        movementSummary: { type: string; totalQuantity: number; count: number }[];
        stock: { productCount: number; totalUnits: number; totalStockValue: number; lowStockCount: number; outOfStockCount: number };
        products: { id: string; name: string; barcode: string; quantityOnHand: number; reorderLevel: number; status: string; stockValue: number }[];
      }>(`/reports/inventory${from || to ? '?' + new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString() : ''}`),
  },
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: AppUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<AppUser>('/auth/me'),
  },
  settings: {
    get: () => request<BusinessSettings>('/settings'),
    update: (body: Partial<BusinessSettings>) =>
      request<BusinessSettings>('/settings', { method: 'PUT', body: JSON.stringify(body) }),
  },
  admin: {
    login: (email: string, password: string) =>
      request<{ token: string; user: AppUser }>('/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
  },
  platform: {
    listBusinesses: () => request<Business[]>('/platform/businesses'),
    createBusiness: (name: string, slug: string) =>
      request<Business>('/platform/businesses', {
        method: 'POST',
        body: JSON.stringify({ name, slug }),
      }),
    listBusinessUsers: (businessId: string) =>
      request<AppUser[]>(`/platform/businesses/${businessId}/users`),
    createBusinessUser: (
      businessId: string,
      body: { name: string; email: string; password: string; role?: 'user' | 'business_admin' }
    ) =>
      request<AppUser>(`/platform/businesses/${businessId}/users`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
};

export type WhatsAppDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export type Invoice = {
  id: string;
  invoiceNumber: string;
  date: string;
  customerId?: string | null;
  customer?: Customer | null;
  createdByEmail?: string;
  createdByName?: string;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  whatsappMessageId?: string | null;
  whatsappStatus?: WhatsAppDeliveryStatus | null;
  items?: { productName: string; barcode: string; quantity: number; unitPrice: number; amount: number }[];
};
