import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:1975/api';
console.log('BASE', BASE);
export const TOKEN_KEY = 'auth_token';

let memoryToken: string | null = null;

export async function getStoredToken(): Promise<string | null> {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export async function setStoredToken(token: string | null): Promise<void> {
  memoryToken = token;
  try {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch {
    // SecureStore may fail on web; memory cache still works for session
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken();
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
  category?: string;
  batchNo?: string;
  expiryDate?: string | null;
  packSize?: number;
  quantityOnHand?: number;
  reorderLevel?: number;
  costPrice?: number | null;
};

export type ParsedInvoiceProduct = {
  name: string;
  qty: number;
  rate: number;
  mrp: number;
  batchNo: string;
  expiry: string;
  packSize: number;
};

export type BulkCreateInput = {
  barcode?: string;
  name: string;
  price: number;
  unit?: string;
  description?: string;
  category?: string;
  batchNo?: string;
  expiryDate?: string;
  packSize?: number;
  openingQuantity?: number;
  reorderLevel?: number;
  costPrice?: number;
};

export type BulkCreateResult = {
  created: Product[];
  skipped: { name: string; reason: string }[];
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

export type WhatsAppDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export type WhatsAppSendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string };

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

export type InvoiceWithWhatsAppSend = Invoice & {
  whatsappSend?: WhatsAppSendResult;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeaders, ...options?.headers },
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
    extractNameFromOcr: (ocrText: string) =>
      request<{ name: string }>('/products/extract-name', {
        method: 'POST',
        body: JSON.stringify({ ocrText }),
      }),
    parseInvoice: (ocrText: string) =>
      request<{ products: ParsedInvoiceProduct[] }>('/products/parse-invoice', {
        method: 'POST',
        body: JSON.stringify({ ocrText }),
      }),
    bulkCreate: (products: BulkCreateInput[]) =>
      request<BulkCreateResult>('/products/bulk-create', {
        method: 'POST',
        body: JSON.stringify({ products }),
      }),
    create: (body: {
      barcode: string;
      name: string;
      price: number;
      unit?: string;
      description?: string;
      category?: string;
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
        category: string;
        reorderLevel: number;
        costPrice: number | '';
      }>
    ) => request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  inventory: {
    stockIn: (body: {
      productId: string;
      quantity: number;
      date?: string;
      notes?: string;
      referenceLabel?: string;
      costPrice?: number;
    }) =>
      request<{ product: Product; movement: StockMovement }>('/inventory/stock-in', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  customers: {
    list: (q?: string) => request<Customer[]>(q ? `/customers?q=${encodeURIComponent(q)}` : '/customers'),
    get: (id: string) => request<Customer>(`/customers/${id}`),
    create: (body: { name: string; phone?: string; email?: string; address?: string }) =>
      request<Customer>('/customers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<{ name: string; phone: string; email: string; address: string }>) =>
      request<Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },
  invoices: {
    list: (from?: string, to?: string, page?: number, pageSize?: number, customerId?: string) =>
      request<{ items: Invoice[]; total: number; page: number; pageSize: number; totalPages: number }>(
        `/invoices${
          from || to || page || pageSize || customerId
            ? '?' +
              new URLSearchParams({
                ...(from && { from }),
                ...(to && { to }),
                ...(page && { page: String(page) }),
                ...(pageSize && { limit: String(pageSize) }),
                ...(customerId && { customerId }),
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
    }) => request<InvoiceWithWhatsAppSend>('/invoices', { method: 'POST', body: JSON.stringify(body) }),
    resendWhatsApp: (id: string) =>
      request<{ whatsappSend: WhatsAppSendResult }>(`/invoices/${id}/resend-whatsapp`, { method: 'POST' }),
  },
  reports: {
    sales: (from?: string, to?: string) =>
      request<{
        summary: { totalSales: number; count: number; revenue: number; cogs: number; profit: number };
        byDay: { day: string; total: number; count: number; revenue: number; cogs: number; profit: number }[];
      }>(
        `/reports/sales${from || to ? '?' + new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString() : ''}`
      ),
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
};
