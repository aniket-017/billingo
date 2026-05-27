import * as SecureStore from 'expo-secure-store';

// const BASE = 'https://billingo.plan2automate.com/api';
const BASE = 'http://10.255.155.117:1975/api';
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
  mrp?: number | null;
  sellingPrice?: number | null;
  unit: string;
  description?: string;
  category?: string;
  batchNo?: string;
  expiryDate?: string | null;
  packSize?: number;
  numBoxes?: number;
  stripsPerBox?: number;
  tabletsPerStrip?: number;
  quantityOnHand?: number;
  reorderLevel?: number;
  costPrice?: number | null;
  dealerName?: string;
};

export type ParsedInvoicePricingUnit = 'strip' | 'box' | 'tablet';
export type ParsedInvoiceConfidence = 'high' | 'low';

export type ParsedInvoiceProduct = {
  name: string;
  qty: number;
  rate: number;
  mrp: number;
  sellingPrice: number;
  batchNo: string;
  expiry: string;
  packSize: number;
  category: string;
  pricingUnit: ParsedInvoicePricingUnit;
  numBoxes: number;
  stripsPerBox: number;
  tabletsPerStrip: number;
  confidence: ParsedInvoiceConfidence;
  packRaw: string;
};

export type ParsedInvoiceResult = {
  dealerName: string;
  products: ParsedInvoiceProduct[];
};

export type BulkCreateInput = {
  barcode?: string;
  name: string;
  price: number;
  mrp?: number;
  sellingPrice?: number;
  unit?: string;
  description?: string;
  category?: string;
  batchNo?: string;
  expiryDate?: string;
  packSize?: number;
  numBoxes?: number;
  stripsPerBox?: number;
  tabletsPerStrip?: number;
  openingQuantity?: number;
  reorderLevel?: number;
  costPrice?: number;
  dealerName?: string;
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
  dealerName?: string;
  batchNo?: string;
  expiryDate?: string | null;
  costPrice?: number | null;
  mrp?: number | null;
  sellingPrice?: number | null;
  numBoxes?: number;
  stripsPerBox?: number;
  tabletsPerStrip?: number;
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

function guessImageMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

async function uploadInvoiceImage<T>(imageUri: string): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const name = imageUri.split('/').pop() || 'invoice.jpg';
  const type = guessImageMime(imageUri);

  const form = new FormData();
  form.append('image', {
    uri: imageUri,
    name,
    type,
  } as unknown as Blob);

  const res = await fetch(BASE + '/products/parse-invoice-image', {
    method: 'POST',
    headers: { ...authHeaders },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
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
      request<ParsedInvoiceResult>('/products/parse-invoice', {
        method: 'POST',
        body: JSON.stringify({ ocrText }),
      }),
    parseInvoiceImage: (imageUri: string) =>
      uploadInvoiceImage<ParsedInvoiceResult>(imageUri),
    bulkCreate: (products: BulkCreateInput[]) =>
      request<BulkCreateResult>('/products/bulk-create', {
        method: 'POST',
        body: JSON.stringify({ products }),
      }),
    create: (body: {
      barcode: string;
      name: string;
      price: number;
      mrp?: number;
      sellingPrice?: number;
      unit?: string;
      description?: string;
      category?: string;
      batchNo?: string;
      expiryDate?: string;
      packSize?: number;
      numBoxes?: number;
      stripsPerBox?: number;
      tabletsPerStrip?: number;
      openingQuantity?: number;
      reorderLevel?: number;
      costPrice?: number;
      dealerName?: string;
    }) => request<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
    update: (
      id: string,
      body: Partial<{
        barcode: string;
        name: string;
        price: number;
        mrp: number | null;
        sellingPrice: number | null;
        unit: string;
        description: string;
        category: string;
        batchNo: string;
        expiryDate: string | null;
        packSize: number;
        numBoxes: number;
        stripsPerBox: number;
        tabletsPerStrip: number;
        reorderLevel: number;
        costPrice: number | '';
        dealerName: string;
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
      dealerName?: string;
      batchNo?: string;
      expiryDate?: string;
      mrp?: number;
      sellingPrice?: number;
      numBoxes?: number;
      stripsPerBox?: number;
      tabletsPerStrip?: number;
    }) =>
      request<{ product: Product; movement: StockMovement }>('/inventory/stock-in', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    movementsByProduct: (productId: string, page = 1, limit = 20) =>
      request<{ items: StockMovement[]; total: number; page: number; pageSize: number; totalPages: number }>(
        `/inventory/movements/product/${productId}?page=${page}&limit=${limit}`
      ),
    updateMovement: (id: string, body: {
      quantity?: number;
      dealerName?: string;
      batchNo?: string;
      expiryDate?: string | null;
      costPrice?: number | null;
      mrp?: number | null;
      sellingPrice?: number | null;
      numBoxes?: number;
      stripsPerBox?: number;
      tabletsPerStrip?: number;
      notes?: string;
    }) =>
      request<StockMovement>(`/inventory/movements/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
  },
  customers: {
    list: (q?: string, page = 1, limit = 20) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      params.set('page', String(page));
      params.set('limit', String(limit));
      return request<{ items: Customer[]; total: number; page: number; pageSize: number; totalPages: number }>(
        `/customers?${params.toString()}`
      );
    },
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
    topProducts: (from?: string, to?: string, limit = 10) =>
      request<{ productId: string; productName: string; totalQty: number; totalRevenue: number; orderCount: number }[]>(
        `/reports/top-products?${new URLSearchParams({ ...(from && { from }), ...(to && { to }), limit: String(limit) }).toString()}`
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
