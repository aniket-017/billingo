export type BusinessSettingsData = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
};

export type TenantProduct = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  unit: string;
  description: string;
  quantityOnHand: number;
  reorderLevel: number;
  costPrice: number | null;
  createdAt: string;
  updatedAt: string;
};

export type TenantCustomer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
  updatedAt: string;
};

export type TenantInvoiceItem = {
  id: string;
  invoiceId: string;
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  amount: number;
};

export type WhatsAppDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export type TenantInvoice = {
  id: string;
  customerId: string | null;
  invoiceNumber: string;
  date: string;
  createdByEmail: string;
  createdByName: string;
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
  whatsappMessageId?: string | null;
  whatsappStatus?: WhatsAppDeliveryStatus | null;
  createdAt: string;
  updatedAt: string;
  items?: TenantInvoiceItem[];
  customer?: TenantCustomer | null;
};

export type StockMovementType = 'OPENING' | 'STOCK_IN' | 'SALE' | 'ADJUSTMENT' | 'RETURN_IN';

export type TenantStockMovement = {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  date: string;
  referenceType: string;
  referenceId: string | null;
  referenceLabel: string;
  notes: string;
  createdByEmail: string;
  createdByName: string;
  createdAt: string;
  product?: { id: string; name: string; barcode: string; unit: string };
};
