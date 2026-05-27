import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { quoteSchema } from './schemaUtils.js';
import type {
  BusinessSettingsData,
  TenantCustomer,
  TenantInvoice,
  TenantInvoiceItem,
  TenantProduct,
  TenantStockInInvoice,
  TenantStockMovement,
  StockMovementType,
  WhatsAppDeliveryStatus,
} from '../types/tenant.js';
import { normalizeProductName } from '../services/productMatch.js';
import type { CatalogProduct } from '../services/productMatch.js';

function toNum(v: unknown): number {
  if (v == null) return 0;
  return Number(v);
}

function toIsoIfValid(v?: string | Date | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isPgUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ??
    (err as { meta?: { code?: string } })?.meta?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

function mapProduct(row: Record<string, unknown>): TenantProduct {
  return {
    id: String(row.id),
    barcode: String(row.barcode),
    name: String(row.name),
    price: toNum(row.price),
    mrp: row.mrp != null ? toNum(row.mrp) : null,
    sellingPrice: row.selling_price != null ? toNum(row.selling_price) : null,
    unit: String(row.unit ?? 'pcs'),
    description: String(row.description ?? ''),
    category: String(row.category ?? ''),
    batchNo: String(row.batch_no ?? ''),
    expiryDate: row.expiry_date
      ? new Date(row.expiry_date as string | Date).toISOString().slice(0, 10)
      : null,
    packSize: Number(row.pack_size ?? 1),
    numBoxes: Number(row.num_boxes ?? 1),
    stripsPerBox: Number(row.strips_per_box ?? 1),
    tabletsPerStrip: Number(row.tablets_per_strip ?? 1),
    quantityOnHand: Number(row.quantity_on_hand ?? 0),
    reorderLevel: Number(row.reorder_level ?? 0),
    costPrice: row.cost_price != null ? toNum(row.cost_price) : null,
    dealerName: String(row.dealer_name ?? ''),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}

function mapCustomer(row: Record<string, unknown>): TenantCustomer {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone ?? ''),
    email: String(row.email ?? ''),
    address: String(row.address ?? ''),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
  };
}

function mapMovement(row: Record<string, unknown>): TenantStockMovement {
  const product = row.p_name
    ? {
        id: String(row.product_id),
        name: String(row.p_name),
        barcode: String(row.p_barcode),
        unit: String(row.p_unit ?? 'pcs'),
      }
    : undefined;
  return {
    id: String(row.id),
    productId: String(row.product_id),
    type: row.type as StockMovementType,
    quantity: Number(row.quantity),
    balanceAfter: Number(row.balance_after),
    date: toIsoIfValid(row.date as string | Date) ?? new Date(0).toISOString(),
    referenceType: String(row.reference_type ?? 'manual'),
    referenceId: row.reference_id ? String(row.reference_id) : null,
    referenceLabel: String(row.reference_label ?? ''),
    notes: String(row.notes ?? ''),
    stockInInvoiceId: row.stock_in_invoice_id ? String(row.stock_in_invoice_id) : null,
    dealerName: String(row.dealer_name ?? ''),
    batchNo: String(row.batch_no ?? ''),
    expiryDate: toIsoIfValid(row.expiry_date as string | Date)?.slice(0, 10) ?? null,
    costPrice: row.cost_price != null ? toNum(row.cost_price) : null,
    mrp: row.mrp != null ? toNum(row.mrp) : null,
    sellingPrice: row.selling_price != null ? toNum(row.selling_price) : null,
    numBoxes: Number(row.num_boxes ?? 1),
    stripsPerBox: Number(row.strips_per_box ?? 1),
    tabletsPerStrip: Number(row.tablets_per_strip ?? 1),
    createdByEmail: String(row.created_by_email ?? ''),
    createdByName: String(row.created_by_name ?? ''),
    createdAt: toIsoIfValid(row.created_at as string | Date) ?? new Date(0).toISOString(),
    product,
    stockInInvoice: row.sii_id
      ? {
          id: String(row.sii_id),
          supplierName: String(row.sii_supplier_name ?? ''),
          supplierGstNumber: String(row.sii_supplier_gst_number ?? ''),
          supplierDrugLicenseNumber: String(row.sii_supplier_drug_license_number ?? ''),
          supplierAddress: String(row.sii_supplier_address ?? ''),
          supplierMobile: String(row.sii_supplier_mobile ?? ''),
          supplierEmail: String(row.sii_supplier_email ?? ''),
          supplierStateCode: String(row.sii_supplier_state_code ?? ''),
          supplierPanNumber: String(row.sii_supplier_pan_number ?? ''),
          supplierCode: String(row.sii_supplier_code ?? ''),
          invoiceNumber: String(row.sii_invoice_number ?? ''),
          invoiceDate: toIsoIfValid(row.sii_invoice_date as string | Date),
          dueDate: toIsoIfValid(row.sii_due_date as string | Date),
          invoiceTotal: row.sii_invoice_total != null ? toNum(row.sii_invoice_total) : null,
          gstTotal: row.sii_gst_total != null ? toNum(row.sii_gst_total) : null,
          discount: row.sii_discount != null ? toNum(row.sii_discount) : null,
          roundOff: row.sii_round_off != null ? toNum(row.sii_round_off) : null,
          paymentType: String(row.sii_payment_type ?? ''),
          supplierGst: String(row.sii_supplier_gst ?? ''),
          placeOfSupply: String(row.sii_place_of_supply ?? ''),
          notes: String(row.sii_notes ?? ''),
          createdByEmail: String(row.sii_created_by_email ?? ''),
          createdByName: String(row.sii_created_by_name ?? ''),
          createdAt: toIsoIfValid(row.sii_created_at as string | Date) ?? new Date(0).toISOString(),
          updatedAt: toIsoIfValid(row.sii_updated_at as string | Date) ?? new Date(0).toISOString(),
        }
      : null,
  };
}

function mapStockInInvoice(row: Record<string, unknown>): TenantStockInInvoice {
  return {
    id: String(row.id),
    supplierName: String(row.supplier_name ?? ''),
    supplierGstNumber: String(row.supplier_gst_number ?? ''),
    supplierDrugLicenseNumber: String(row.supplier_drug_license_number ?? ''),
    supplierAddress: String(row.supplier_address ?? ''),
    supplierMobile: String(row.supplier_mobile ?? ''),
    supplierEmail: String(row.supplier_email ?? ''),
    supplierStateCode: String(row.supplier_state_code ?? ''),
    supplierPanNumber: String(row.supplier_pan_number ?? ''),
    supplierCode: String(row.supplier_code ?? ''),
    invoiceNumber: String(row.invoice_number ?? ''),
    invoiceDate: toIsoIfValid(row.invoice_date as string | Date),
    dueDate: toIsoIfValid(row.due_date as string | Date),
    invoiceTotal: row.invoice_total != null ? toNum(row.invoice_total) : null,
    gstTotal: row.gst_total != null ? toNum(row.gst_total) : null,
    discount: row.discount != null ? toNum(row.discount) : null,
    roundOff: row.round_off != null ? toNum(row.round_off) : null,
    paymentType: String(row.payment_type ?? ''),
    supplierGst: String(row.supplier_gst ?? ''),
    placeOfSupply: String(row.place_of_supply ?? ''),
    notes: String(row.notes ?? ''),
    createdByEmail: String(row.created_by_email ?? ''),
    createdByName: String(row.created_by_name ?? ''),
    createdAt: toIsoIfValid(row.created_at as string | Date) ?? new Date(0).toISOString(),
    updatedAt: toIsoIfValid(row.updated_at as string | Date) ?? new Date(0).toISOString(),
  };
}

export class TenantDb {
  constructor(private readonly schemaName: string) {}

  private get s(): string {
    return quoteSchema(this.schemaName);
  }

  // --- Settings ---
  async getSettings(): Promise<BusinessSettingsData> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT business_name, address, phone, email, tax_id
      FROM ${Prisma.raw(`${this.s}.settings`)}
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return { businessName: '', address: '', phone: '', email: '', taxId: '' };
    }
    return {
      businessName: String(row.business_name ?? ''),
      address: String(row.address ?? ''),
      phone: String(row.phone ?? ''),
      email: String(row.email ?? ''),
      taxId: String(row.tax_id ?? ''),
    };
  }

  async updateSettings(body: Partial<BusinessSettingsData>): Promise<BusinessSettingsData> {
    const current = await this.getSettings();
    const next = { ...current, ...body };
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM ${Prisma.raw(`${this.s}.settings`)} LIMIT 1
    `;
    if (existing.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO ${Prisma.raw(`${this.s}.settings`)}
          (business_name, address, phone, email, tax_id)
        VALUES (${next.businessName}, ${next.address}, ${next.phone}, ${next.email}, ${next.taxId})
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE ${Prisma.raw(`${this.s}.settings`)}
        SET business_name = ${next.businessName},
            address = ${next.address},
            phone = ${next.phone},
            email = ${next.email},
            tax_id = ${next.taxId},
            updated_at = NOW()
        WHERE id = ${existing[0].id}::uuid
      `;
    }
    return next;
  }

  // --- Products ---
  async listProducts(q?: string): Promise<TenantProduct[]> {
    if (q?.trim()) {
      const pattern = `%${q.trim()}%`;
      const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM ${Prisma.raw(`${this.s}.products`)}
        WHERE name ILIKE ${pattern} OR barcode ILIKE ${pattern}
        ORDER BY created_at DESC
      `;
      return rows.map(mapProduct);
    }
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM ${Prisma.raw(`${this.s}.products`)}
      ORDER BY created_at DESC
    `;
    return rows.map(mapProduct);
  }

  async getProduct(id: string): Promise<TenantProduct | null> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM ${Prisma.raw(`${this.s}.products`)}
      WHERE id = ${id}::uuid
    `;
    return rows[0] ? mapProduct(rows[0]) : null;
  }

  async getProductByBarcode(barcode: string): Promise<TenantProduct | null> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM ${Prisma.raw(`${this.s}.products`)}
      WHERE barcode = ${barcode}
    `;
    return rows[0] ? mapProduct(rows[0]) : null;
  }

  async countProductsByBarcode(barcode: string): Promise<number> {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM ${Prisma.raw(`${this.s}.products`)}
      WHERE barcode = ${barcode}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async listProductsForMatch(): Promise<CatalogProduct[]> {
    const rows = await prisma.$queryRaw<{ id: string; name: string; name_normalized: string }[]>`
      SELECT id, name, name_normalized FROM ${Prisma.raw(`${this.s}.products`)}
    `;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      nameNormalized: String(r.name_normalized ?? ''),
    }));
  }

  async getProductByNameNormalized(key: string): Promise<TenantProduct | null> {
    if (!key) return null;
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM ${Prisma.raw(`${this.s}.products`)}
      WHERE name_normalized = ${key}
      ORDER BY created_at ASC
      LIMIT 1
    `;
    return rows[0] ? mapProduct(rows[0]) : null;
  }

  async createProduct(data: {
    barcode: string;
    name: string;
    price: number;
    mrp?: number | null;
    sellingPrice?: number | null;
    unit?: string;
    description?: string;
    category?: string;
    batchNo?: string;
    expiryDate?: string | null;
    packSize?: number;
    numBoxes?: number;
    stripsPerBox?: number;
    tabletsPerStrip?: number;
    reorderLevel?: number;
    costPrice?: number | null;
    dealerName?: string;
  }): Promise<TenantProduct> {
    const expiry = data.expiryDate ? new Date(data.expiryDate) : null;
    const nameNormalized = normalizeProductName(data.name).normalizedKey;
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      INSERT INTO ${Prisma.raw(`${this.s}.products`)}
        (barcode, name, name_normalized, price, mrp, selling_price, unit, description, category, batch_no, expiry_date, pack_size, num_boxes, strips_per_box, tablets_per_strip, reorder_level, cost_price, dealer_name)
      VALUES (
        ${data.barcode},
        ${data.name},
        ${nameNormalized},
        ${data.price},
        ${data.mrp ?? null},
        ${data.sellingPrice ?? null},
        ${data.unit ?? 'pcs'},
        ${data.description ?? ''},
        ${data.category ?? ''},
        ${data.batchNo ?? ''},
        ${expiry},
        ${data.packSize ?? 1},
        ${data.numBoxes ?? 1},
        ${data.stripsPerBox ?? 1},
        ${data.tabletsPerStrip ?? 1},
        ${data.reorderLevel ?? 0},
        ${data.costPrice ?? null},
        ${data.dealerName ?? ''}
      )
      RETURNING *
    `;
    return mapProduct(rows[0]);
  }

  async updateProduct(
    id: string,
    data: Partial<{
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
      costPrice: number | null;
      dealerName: string;
    }>
  ): Promise<TenantProduct | null> {
    const current = await this.getProduct(id);
    if (!current) return null;
    const nextName = data.name ?? current.name;
    const nameNormalized = normalizeProductName(nextName).normalizedKey;
    const expiry = data.expiryDate !== undefined
      ? (data.expiryDate ? new Date(data.expiryDate) : null)
      : (current.expiryDate ? new Date(current.expiryDate) : null);
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      UPDATE ${Prisma.raw(`${this.s}.products`)}
      SET barcode = ${data.barcode ?? current.barcode},
          name = ${nextName},
          name_normalized = ${nameNormalized},
          price = ${data.price ?? current.price},
          mrp = ${data.mrp !== undefined ? data.mrp : current.mrp},
          selling_price = ${data.sellingPrice !== undefined ? data.sellingPrice : current.sellingPrice},
          unit = ${data.unit ?? current.unit},
          description = ${data.description ?? current.description},
          category = ${data.category ?? current.category},
          batch_no = ${data.batchNo ?? current.batchNo},
          expiry_date = ${expiry},
          pack_size = ${data.packSize ?? current.packSize},
          num_boxes = ${data.numBoxes ?? current.numBoxes},
          strips_per_box = ${data.stripsPerBox ?? current.stripsPerBox},
          tablets_per_strip = ${data.tabletsPerStrip ?? current.tabletsPerStrip},
          reorder_level = ${data.reorderLevel ?? current.reorderLevel},
          cost_price = ${data.costPrice !== undefined ? data.costPrice : current.costPrice},
          dealer_name = ${data.dealerName ?? current.dealerName},
          updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return rows[0] ? mapProduct(rows[0]) : null;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const count = await prisma.$executeRaw`
      DELETE FROM ${Prisma.raw(`${this.s}.products`)}
      WHERE id = ${id}::uuid
    `;
    return count > 0;
  }

  async updateProductQuantity(id: string, delta: number, minQty = 0): Promise<TenantProduct | null> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      UPDATE ${Prisma.raw(`${this.s}.products`)}
      SET quantity_on_hand = quantity_on_hand + ${delta},
          updated_at = NOW()
      WHERE id = ${id}::uuid
        AND quantity_on_hand + ${delta} >= ${minQty}
      RETURNING *
    `;
    return rows[0] ? mapProduct(rows[0]) : null;
  }

  async setProductQuantity(id: string, qty: number): Promise<TenantProduct | null> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      UPDATE ${Prisma.raw(`${this.s}.products`)}
      SET quantity_on_hand = ${qty}, updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return rows[0] ? mapProduct(rows[0]) : null;
  }

  // --- Customers ---
  async listCustomers(q?: string): Promise<TenantCustomer[]> {
    if (q?.trim()) {
      const pattern = `%${q.trim()}%`;
      const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM ${Prisma.raw(`${this.s}.customers`)}
        WHERE name ILIKE ${pattern} OR phone ILIKE ${pattern} OR email ILIKE ${pattern}
        ORDER BY created_at DESC
      `;
      return rows.map(mapCustomer);
    }
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM ${Prisma.raw(`${this.s}.customers`)}
      ORDER BY created_at DESC
    `;
    return rows.map(mapCustomer);
  }

  async getCustomer(id: string): Promise<TenantCustomer | null> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM ${Prisma.raw(`${this.s}.customers`)}
      WHERE id = ${id}::uuid
    `;
    return rows[0] ? mapCustomer(rows[0]) : null;
  }

  async findCustomerByPhone(phone: string, excludeId?: string): Promise<TenantCustomer | null> {
    if (!phone) return null;
    const rows = excludeId
      ? await prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT * FROM ${Prisma.raw(`${this.s}.customers`)}
          WHERE phone <> ''
            AND id <> ${excludeId}::uuid
            AND (
              phone = ${phone}
              OR RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = ${phone}
              OR regexp_replace(phone, '[^0-9]', '', 'g') = ${'91' + phone}
            )
          LIMIT 1
        `
      : await prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT * FROM ${Prisma.raw(`${this.s}.customers`)}
          WHERE phone <> ''
            AND (
              phone = ${phone}
              OR RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = ${phone}
              OR regexp_replace(phone, '[^0-9]', '', 'g') = ${'91' + phone}
            )
          LIMIT 1
        `;
    return rows[0] ? mapCustomer(rows[0]) : null;
  }

  async createCustomer(data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  }): Promise<TenantCustomer> {
    const phone = data.phone?.trim() ?? '';
    if (phone) {
      const existing = await this.findCustomerByPhone(phone);
      if (existing) {
        throw new Error(`PHONE_CONFLICT:${existing.name}`);
      }
    }
    try {
      const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
        INSERT INTO ${Prisma.raw(`${this.s}.customers`)}
          (name, phone, email, address)
        VALUES (${data.name}, ${phone}, ${data.email ?? ''}, ${data.address ?? ''})
        RETURNING *
      `;
      return mapCustomer(rows[0]);
    } catch (err) {
      if (isPgUniqueViolation(err) && phone) {
        const existing = await this.findCustomerByPhone(phone);
        throw new Error(`PHONE_CONFLICT:${existing?.name ?? 'another customer'}`);
      }
      throw err;
    }
  }

  async updateCustomer(
    id: string,
    data: Partial<{ name: string; phone: string; email: string; address: string }>
  ): Promise<TenantCustomer | null> {
    const current = await this.getCustomer(id);
    if (!current) return null;
    const phone = data.phone !== undefined ? data.phone.trim() : current.phone;
    if (phone) {
      const existing = await this.findCustomerByPhone(phone, id);
      if (existing) {
        throw new Error(`PHONE_CONFLICT:${existing.name}`);
      }
    }
    try {
      const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
        UPDATE ${Prisma.raw(`${this.s}.customers`)}
        SET name = ${data.name ?? current.name},
            phone = ${phone},
            email = ${data.email ?? current.email},
            address = ${data.address ?? current.address},
            updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING *
      `;
      return rows[0] ? mapCustomer(rows[0]) : null;
    } catch (err) {
      if (isPgUniqueViolation(err) && phone) {
        const existing = await this.findCustomerByPhone(phone, id);
        throw new Error(`PHONE_CONFLICT:${existing?.name ?? 'another customer'}`);
      }
      throw err;
    }
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const count = await prisma.$executeRaw`
      DELETE FROM ${Prisma.raw(`${this.s}.customers`)}
      WHERE id = ${id}::uuid
    `;
    return count > 0;
  }

  // --- Stock movements ---
  async createStockInInvoice(data: {
    supplierName?: string;
    supplierGstNumber?: string;
    supplierDrugLicenseNumber?: string;
    supplierAddress?: string;
    supplierMobile?: string;
    supplierEmail?: string;
    supplierStateCode?: string;
    supplierPanNumber?: string;
    supplierCode?: string;
    invoiceNumber?: string;
    invoiceDate?: string | null;
    dueDate?: string | null;
    invoiceTotal?: number | null;
    gstTotal?: number | null;
    discount?: number | null;
    roundOff?: number | null;
    paymentType?: string;
    supplierGst?: string;
    placeOfSupply?: string;
    notes?: string;
    createdByEmail?: string;
    createdByName?: string;
  }): Promise<TenantStockInInvoice> {
    const invoiceDateIso = toIsoIfValid(data.invoiceDate);
    const dueDateIso = toIsoIfValid(data.dueDate);
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      INSERT INTO ${Prisma.raw(`${this.s}.stock_in_invoices`)}
        (supplier_name, supplier_gst_number, supplier_drug_license_number, supplier_address,
         supplier_mobile, supplier_email, supplier_state_code, supplier_pan_number, supplier_code,
         invoice_number, invoice_date, due_date, invoice_total, gst_total, discount, round_off,
         payment_type, supplier_gst, place_of_supply, notes, created_by_email, created_by_name)
      VALUES (
        ${data.supplierName ?? ''},
        ${data.supplierGstNumber ?? ''},
        ${data.supplierDrugLicenseNumber ?? ''},
        ${data.supplierAddress ?? ''},
        ${data.supplierMobile ?? ''},
        ${data.supplierEmail ?? ''},
        ${data.supplierStateCode ?? ''},
        ${data.supplierPanNumber ?? ''},
        ${data.supplierCode ?? ''},
        ${data.invoiceNumber ?? ''},
        ${invoiceDateIso}::timestamptz,
        ${dueDateIso}::timestamptz,
        ${data.invoiceTotal ?? null},
        ${data.gstTotal ?? null},
        ${data.discount ?? null},
        ${data.roundOff ?? null},
        ${data.paymentType ?? ''},
        ${data.supplierGst ?? ''},
        ${data.placeOfSupply ?? ''},
        ${data.notes ?? ''},
        ${data.createdByEmail ?? ''},
        ${data.createdByName ?? ''}
      )
      RETURNING *
    `;
    return mapStockInInvoice(rows[0]);
  }

  async findStockInInvoiceByNumberAndSupplierGst(
    invoiceNumber: string,
    supplierGst: string
  ): Promise<TenantStockInInvoice | null> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM ${Prisma.raw(`${this.s}.stock_in_invoices`)}
      WHERE invoice_number = ${invoiceNumber}
        AND supplier_gst = ${supplierGst}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] ? mapStockInInvoice(rows[0]) : null;
  }

  async mergeStockInInvoice(id: string, data: Partial<{
    supplierName: string;
    supplierGstNumber: string;
    supplierDrugLicenseNumber: string;
    supplierAddress: string;
    supplierMobile: string;
    supplierEmail: string;
    supplierStateCode: string;
    supplierPanNumber: string;
    supplierCode: string;
    invoiceNumber: string;
    invoiceDate: string | null;
    dueDate: string | null;
    invoiceTotal: number | null;
    gstTotal: number | null;
    discount: number | null;
    roundOff: number | null;
    paymentType: string;
    supplierGst: string;
    placeOfSupply: string;
    notes: string;
  }>): Promise<TenantStockInInvoice | null> {
    const current = await this.getStockInInvoice(id);
    if (!current) return null;
    const nextInvoiceDate = data.invoiceDate !== undefined ? data.invoiceDate : current.invoiceDate;
    const nextDueDate = data.dueDate !== undefined ? data.dueDate : current.dueDate;
    const nextInvoiceDateIso = toIsoIfValid(nextInvoiceDate);
    const nextDueDateIso = toIsoIfValid(nextDueDate);
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      UPDATE ${Prisma.raw(`${this.s}.stock_in_invoices`)}
      SET supplier_name = ${data.supplierName ?? current.supplierName},
          supplier_gst_number = ${data.supplierGstNumber ?? current.supplierGstNumber},
          supplier_drug_license_number = ${data.supplierDrugLicenseNumber ?? current.supplierDrugLicenseNumber},
          supplier_address = ${data.supplierAddress ?? current.supplierAddress},
          supplier_mobile = ${data.supplierMobile ?? current.supplierMobile},
          supplier_email = ${data.supplierEmail ?? current.supplierEmail},
          supplier_state_code = ${data.supplierStateCode ?? current.supplierStateCode},
          supplier_pan_number = ${data.supplierPanNumber ?? current.supplierPanNumber},
          supplier_code = ${data.supplierCode ?? current.supplierCode},
          invoice_number = ${data.invoiceNumber ?? current.invoiceNumber},
          invoice_date = ${nextInvoiceDateIso}::timestamptz,
          due_date = ${nextDueDateIso}::timestamptz,
          invoice_total = ${data.invoiceTotal !== undefined ? data.invoiceTotal : current.invoiceTotal},
          gst_total = ${data.gstTotal !== undefined ? data.gstTotal : current.gstTotal},
          discount = ${data.discount !== undefined ? data.discount : current.discount},
          round_off = ${data.roundOff !== undefined ? data.roundOff : current.roundOff},
          payment_type = ${data.paymentType ?? current.paymentType},
          supplier_gst = ${data.supplierGst ?? current.supplierGst},
          place_of_supply = ${data.placeOfSupply ?? current.placeOfSupply},
          notes = ${data.notes ?? current.notes},
          updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return rows[0] ? mapStockInInvoice(rows[0]) : null;
  }

  async getStockInInvoice(id: string): Promise<TenantStockInInvoice | null> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM ${Prisma.raw(`${this.s}.stock_in_invoices`)}
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    return rows[0] ? mapStockInInvoice(rows[0]) : null;
  }

  async listStockInInvoices(opts: {
    page: number;
    pageSize: number;
  }): Promise<{ items: TenantStockInInvoice[]; total: number }> {
    const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM ${Prisma.raw(`${this.s}.stock_in_invoices`)}
    `;
    const total = Number(countRows[0]?.count ?? 0);
    const offset = (opts.page - 1) * opts.pageSize;
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM ${Prisma.raw(`${this.s}.stock_in_invoices`)}
      ORDER BY COALESCE(invoice_date, created_at) DESC, created_at DESC
      LIMIT ${opts.pageSize} OFFSET ${offset}
    `;
    return { items: rows.map(mapStockInInvoice), total };
  }

  async createMovement(data: {
    productId: string;
    type: StockMovementType;
    quantity: number;
    balanceAfter: number;
    date?: Date;
    referenceType?: string;
    referenceId?: string | null;
    referenceLabel?: string;
    notes?: string;
    stockInInvoiceId?: string | null;
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
  }): Promise<TenantStockMovement> {
    const expiryVal = data.expiryDate ? new Date(data.expiryDate) : null;
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      INSERT INTO ${Prisma.raw(`${this.s}.stock_movements`)}
        (product_id, type, quantity, balance_after, date, reference_type, reference_id, reference_label, notes,
         stock_in_invoice_id,
         dealer_name, batch_no, expiry_date, cost_price, mrp, selling_price,
         num_boxes, strips_per_box, tablets_per_strip,
         created_by_email, created_by_name)
      VALUES (
        ${data.productId}::uuid,
        ${data.type},
        ${data.quantity},
        ${data.balanceAfter},
        ${data.date ?? new Date()},
        ${data.referenceType ?? 'manual'},
        ${data.referenceId ?? null},
        ${data.referenceLabel ?? ''},
        ${data.notes ?? ''},
        ${data.stockInInvoiceId ? Prisma.sql`${data.stockInInvoiceId}::uuid` : null},
        ${data.dealerName ?? ''},
        ${data.batchNo ?? ''},
        ${expiryVal}::date,
        ${data.costPrice ?? null},
        ${data.mrp ?? null},
        ${data.sellingPrice ?? null},
        ${data.numBoxes ?? 1},
        ${data.stripsPerBox ?? 1},
        ${data.tabletsPerStrip ?? 1},
        ${data.createdByEmail ?? ''},
        ${data.createdByName ?? ''}
      )
      RETURNING *
    `;
    return mapMovement(rows[0]);
  }

  async getMovement(id: string): Promise<TenantStockMovement | null> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT m.*, p.name AS p_name, p.barcode AS p_barcode, p.unit AS p_unit,
        sii.id AS sii_id, sii.supplier_name AS sii_supplier_name, sii.supplier_gst_number AS sii_supplier_gst_number,
        sii.supplier_drug_license_number AS sii_supplier_drug_license_number, sii.supplier_address AS sii_supplier_address,
        sii.supplier_mobile AS sii_supplier_mobile, sii.supplier_email AS sii_supplier_email,
        sii.supplier_state_code AS sii_supplier_state_code, sii.supplier_pan_number AS sii_supplier_pan_number,
        sii.supplier_code AS sii_supplier_code, sii.invoice_number AS sii_invoice_number,
        sii.invoice_date AS sii_invoice_date, sii.due_date AS sii_due_date, sii.invoice_total AS sii_invoice_total,
        sii.gst_total AS sii_gst_total, sii.discount AS sii_discount, sii.round_off AS sii_round_off,
        sii.payment_type AS sii_payment_type, sii.supplier_gst AS sii_supplier_gst,
        sii.place_of_supply AS sii_place_of_supply, sii.notes AS sii_notes,
        sii.created_by_email AS sii_created_by_email, sii.created_by_name AS sii_created_by_name,
        sii.created_at AS sii_created_at, sii.updated_at AS sii_updated_at
      FROM ${Prisma.raw(`${this.s}.stock_movements`)} m
      LEFT JOIN ${Prisma.raw(`${this.s}.products`)} p ON p.id = m.product_id
      LEFT JOIN ${Prisma.raw(`${this.s}.stock_in_invoices`)} sii ON sii.id = m.stock_in_invoice_id
      WHERE m.id = ${id}::uuid
      LIMIT 1
    `;
    return rows.length ? mapMovement(rows[0]) : null;
  }

  async updateMovement(id: string, data: {
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
  }): Promise<TenantStockMovement | null> {
    const sets: Prisma.Sql[] = [];
    if (data.quantity !== undefined) sets.push(Prisma.sql`quantity = ${data.quantity}`);
    if (data.dealerName !== undefined) sets.push(Prisma.sql`dealer_name = ${data.dealerName}`);
    if (data.batchNo !== undefined) sets.push(Prisma.sql`batch_no = ${data.batchNo}`);
    if (data.expiryDate !== undefined) {
      const expiryVal = data.expiryDate ? new Date(data.expiryDate) : null;
      sets.push(Prisma.sql`expiry_date = ${expiryVal}::date`);
    }
    if (data.costPrice !== undefined) sets.push(Prisma.sql`cost_price = ${data.costPrice}`);
    if (data.mrp !== undefined) sets.push(Prisma.sql`mrp = ${data.mrp}`);
    if (data.sellingPrice !== undefined) sets.push(Prisma.sql`selling_price = ${data.sellingPrice}`);
    if (data.numBoxes !== undefined) sets.push(Prisma.sql`num_boxes = ${data.numBoxes}`);
    if (data.stripsPerBox !== undefined) sets.push(Prisma.sql`strips_per_box = ${data.stripsPerBox}`);
    if (data.tabletsPerStrip !== undefined) sets.push(Prisma.sql`tablets_per_strip = ${data.tabletsPerStrip}`);
    if (data.notes !== undefined) sets.push(Prisma.sql`notes = ${data.notes}`);
    if (sets.length === 0) return this.getMovement(id);
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      UPDATE ${Prisma.raw(`${this.s}.stock_movements`)}
      SET ${Prisma.join(sets, ', ')}
      WHERE id = ${id}::uuid
      RETURNING *
    `;
    return rows.length ? await this.getMovement(id) : null;
  }

  async linkSaleMovementsToInvoice(invoiceId: string, invoiceNumber: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE ${Prisma.raw(`${this.s}.stock_movements`)}
      SET reference_id = ${invoiceId}::uuid
      WHERE type = 'SALE'
        AND reference_id IS NULL
        AND reference_type = 'invoice'
        AND reference_label = ${invoiceNumber}
    `;
  }

  async listMovements(opts: {
    productId?: string;
    from?: Date;
    to?: Date;
    type?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: TenantStockMovement[]; total: number }> {
    const conditions: Prisma.Sql[] = [];
    if (opts.productId) conditions.push(Prisma.sql`m.product_id = ${opts.productId}::uuid`);
    if (opts.type) conditions.push(Prisma.sql`m.type = ${opts.type}`);
    if (opts.from) conditions.push(Prisma.sql`m.date >= ${opts.from}`);
    if (opts.to) conditions.push(Prisma.sql`m.date <= ${opts.to}`);
    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM ${Prisma.raw(`${this.s}.stock_movements`)} m
      ${where}
    `;
    const total = Number(countRows[0]?.count ?? 0);
    const offset = (opts.page - 1) * opts.pageSize;

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT m.*, p.name AS p_name, p.barcode AS p_barcode, p.unit AS p_unit,
        sii.id AS sii_id, sii.supplier_name AS sii_supplier_name, sii.supplier_gst_number AS sii_supplier_gst_number,
        sii.supplier_drug_license_number AS sii_supplier_drug_license_number, sii.supplier_address AS sii_supplier_address,
        sii.supplier_mobile AS sii_supplier_mobile, sii.supplier_email AS sii_supplier_email,
        sii.supplier_state_code AS sii_supplier_state_code, sii.supplier_pan_number AS sii_supplier_pan_number,
        sii.supplier_code AS sii_supplier_code, sii.invoice_number AS sii_invoice_number,
        sii.invoice_date AS sii_invoice_date, sii.due_date AS sii_due_date, sii.invoice_total AS sii_invoice_total,
        sii.gst_total AS sii_gst_total, sii.discount AS sii_discount, sii.round_off AS sii_round_off,
        sii.payment_type AS sii_payment_type, sii.supplier_gst AS sii_supplier_gst,
        sii.place_of_supply AS sii_place_of_supply, sii.notes AS sii_notes,
        sii.created_by_email AS sii_created_by_email, sii.created_by_name AS sii_created_by_name,
        sii.created_at AS sii_created_at, sii.updated_at AS sii_updated_at
      FROM ${Prisma.raw(`${this.s}.stock_movements`)} m
      LEFT JOIN ${Prisma.raw(`${this.s}.products`)} p ON p.id = m.product_id
      LEFT JOIN ${Prisma.raw(`${this.s}.stock_in_invoices`)} sii ON sii.id = m.stock_in_invoice_id
      ${where}
      ORDER BY m.date DESC, m.created_at DESC
      LIMIT ${opts.pageSize} OFFSET ${offset}
    `;
    return { items: rows.map(mapMovement), total };
  }

  async listMovementsByStockInInvoice(stockInInvoiceId: string): Promise<TenantStockMovement[]> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT m.*, p.name AS p_name, p.barcode AS p_barcode, p.unit AS p_unit,
        sii.id AS sii_id, sii.supplier_name AS sii_supplier_name, sii.supplier_gst_number AS sii_supplier_gst_number,
        sii.supplier_drug_license_number AS sii_supplier_drug_license_number, sii.supplier_address AS sii_supplier_address,
        sii.supplier_mobile AS sii_supplier_mobile, sii.supplier_email AS sii_supplier_email,
        sii.supplier_state_code AS sii_supplier_state_code, sii.supplier_pan_number AS sii_supplier_pan_number,
        sii.supplier_code AS sii_supplier_code, sii.invoice_number AS sii_invoice_number,
        sii.invoice_date AS sii_invoice_date, sii.due_date AS sii_due_date, sii.invoice_total AS sii_invoice_total,
        sii.gst_total AS sii_gst_total, sii.discount AS sii_discount, sii.round_off AS sii_round_off,
        sii.payment_type AS sii_payment_type, sii.supplier_gst AS sii_supplier_gst,
        sii.place_of_supply AS sii_place_of_supply, sii.notes AS sii_notes,
        sii.created_by_email AS sii_created_by_email, sii.created_by_name AS sii_created_by_name,
        sii.created_at AS sii_created_at, sii.updated_at AS sii_updated_at
      FROM ${Prisma.raw(`${this.s}.stock_movements`)} m
      LEFT JOIN ${Prisma.raw(`${this.s}.products`)} p ON p.id = m.product_id
      LEFT JOIN ${Prisma.raw(`${this.s}.stock_in_invoices`)} sii ON sii.id = m.stock_in_invoice_id
      WHERE m.stock_in_invoice_id = ${stockInInvoiceId}::uuid
      ORDER BY m.date ASC, m.created_at ASC
    `;
    return rows.map(mapMovement);
  }

  // --- Invoices ---
  async listInvoices(opts: {
    from?: Date;
    to?: Date;
    customerId?: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: TenantInvoice[]; total: number }> {
    const conditions: Prisma.Sql[] = [];
    if (opts.from) conditions.push(Prisma.sql`i.date >= ${opts.from}`);
    if (opts.to) conditions.push(Prisma.sql`i.date <= ${opts.to}`);
    if (opts.customerId) conditions.push(Prisma.sql`i.customer_id = ${opts.customerId}::uuid`);
    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM ${Prisma.raw(`${this.s}.invoices`)} i ${where}
    `;
    const total = Number(countRows[0]?.count ?? 0);
    const offset = (opts.page - 1) * opts.pageSize;

    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT i.*,
        c.id AS c_id, c.name AS c_name, c.phone AS c_phone, c.email AS c_email, c.address AS c_address
      FROM ${Prisma.raw(`${this.s}.invoices`)} i
      LEFT JOIN ${Prisma.raw(`${this.s}.customers`)} c ON c.id = i.customer_id
      ${where}
      ORDER BY i.date DESC
      LIMIT ${opts.pageSize} OFFSET ${offset}
    `;

    const items = rows.map((row) => this.mapInvoiceRow(row));
    return { items, total };
  }

  async getInvoice(id: string): Promise<TenantInvoice | null> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT i.*,
        c.id AS c_id, c.name AS c_name, c.phone AS c_phone, c.email AS c_email, c.address AS c_address
      FROM ${Prisma.raw(`${this.s}.invoices`)} i
      LEFT JOIN ${Prisma.raw(`${this.s}.customers`)} c ON c.id = i.customer_id
      WHERE i.id = ${id}::uuid
    `;
    if (!rows[0]) return null;
    const invoice = this.mapInvoiceRow(rows[0]);
    const itemRows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM ${Prisma.raw(`${this.s}.invoice_items`)}
      WHERE invoice_id = ${id}::uuid
    `;
    invoice.items = itemRows.map((r) => ({
      id: String(r.id),
      invoiceId: String(r.invoice_id),
      productId: String(r.product_id),
      productName: String(r.product_name),
      barcode: String(r.barcode),
      quantity: Number(r.quantity),
      unitPrice: toNum(r.unit_price),
      unitCost: r.unit_cost != null ? toNum(r.unit_cost) : null,
      amount: toNum(r.amount),
    }));
    return invoice;
  }

  private mapInvoiceRow(row: Record<string, unknown>): TenantInvoice {
    const customer = row.c_id
      ? {
          id: String(row.c_id),
          name: String(row.c_name),
          phone: String(row.c_phone ?? ''),
          email: String(row.c_email ?? ''),
          address: String(row.c_address ?? ''),
          createdAt: '',
          updatedAt: '',
        }
      : null;
    return {
      id: String(row.id),
      customerId: row.customer_id ? String(row.customer_id) : null,
      invoiceNumber: String(row.invoice_number),
      date: new Date(row.date as string | Date).toISOString(),
      createdByEmail: String(row.created_by_email ?? ''),
      createdByName: String(row.created_by_name ?? ''),
      subtotal: toNum(row.subtotal),
      tax: toNum(row.tax),
      total: toNum(row.total),
      notes: String(row.notes ?? ''),
      whatsappMessageId: row.whatsapp_message_id ? String(row.whatsapp_message_id) : null,
      whatsappStatus: row.whatsapp_status
        ? (String(row.whatsapp_status) as WhatsAppDeliveryStatus)
        : null,
      createdAt: new Date(row.created_at as string | Date).toISOString(),
      updatedAt: new Date(row.updated_at as string | Date).toISOString(),
      customer,
    };
  }

  async updateInvoiceWhatsApp(
    invoiceId: string,
    data: { messageId?: string; status?: WhatsAppDeliveryStatus | null }
  ): Promise<void> {
    if (data.messageId !== undefined) {
      await prisma.$executeRaw`
        UPDATE ${Prisma.raw(`${this.s}.invoices`)}
        SET whatsapp_message_id = ${data.messageId},
            updated_at = NOW()
        WHERE id = ${invoiceId}::uuid
      `;
    }
    if (data.status !== undefined) {
      await prisma.$executeRaw`
        UPDATE ${Prisma.raw(`${this.s}.invoices`)}
        SET whatsapp_status = ${data.status},
            updated_at = NOW()
        WHERE id = ${invoiceId}::uuid
      `;
    }
  }

  async findInvoiceIdByWhatsAppMessageId(waMessageId: string): Promise<string | null> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM ${Prisma.raw(`${this.s}.invoices`)}
      WHERE whatsapp_message_id = ${waMessageId}
      LIMIT 1
    `;
    return rows[0] ? String(rows[0].id) : null;
  }

  async createInvoice(data: {
    customerId?: string | null;
    invoiceNumber: string;
    date?: Date;
    createdByEmail?: string;
    createdByName?: string;
    subtotal: number;
    tax: number;
    total: number;
    notes?: string;
    items: {
      productId: string;
      productName: string;
      barcode: string;
      quantity: number;
      unitPrice: number;
      unitCost?: number | null;
      amount: number;
    }[];
  }): Promise<TenantInvoice> {
    const invoiceId = await prisma.$transaction(async (tx) => {
      const invRows = await tx.$queryRaw<Record<string, unknown>[]>`
        INSERT INTO ${Prisma.raw(`${this.s}.invoices`)}
          (customer_id, invoice_number, date, created_by_email, created_by_name, subtotal, tax, total, notes)
        VALUES (
          ${data.customerId ? Prisma.sql`${data.customerId}::uuid` : null},
          ${data.invoiceNumber},
          ${data.date ?? new Date()},
          ${data.createdByEmail ?? ''},
          ${data.createdByName ?? ''},
          ${data.subtotal},
          ${data.tax},
          ${data.total},
          ${data.notes ?? ''}
        )
        RETURNING *
      `;
      const id = String(invRows[0].id);
      for (const item of data.items) {
        await tx.$executeRaw`
          INSERT INTO ${Prisma.raw(`${this.s}.invoice_items`)}
            (invoice_id, product_id, product_name, barcode, quantity, unit_price, unit_cost, amount)
          VALUES (
            ${id}::uuid,
            ${item.productId}::uuid,
            ${item.productName},
            ${item.barcode},
            ${item.quantity},
            ${item.unitPrice},
            ${item.unitCost ?? null},
            ${item.amount}
          )
        `;
      }
      return id;
    });

    const invoice = await this.getInvoice(invoiceId);
    if (!invoice) {
      throw new Error('Failed to load created invoice');
    }
    return invoice;
  }

  // --- Reports ---
  async salesReport(from?: Date, to?: Date) {
    const invoiceConditions: Prisma.Sql[] = [];
    if (from) invoiceConditions.push(Prisma.sql`i.date >= ${from}`);
    if (to) invoiceConditions.push(Prisma.sql`i.date <= ${to}`);
    const invoiceWhere =
      invoiceConditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(invoiceConditions, ' AND ')}`
        : Prisma.empty;

    const summaryRows = await prisma.$queryRaw<
      { total_sales: unknown; count: bigint; revenue: unknown; cogs: unknown }[]
    >`
      SELECT
        COALESCE(SUM(i.total), 0) AS total_sales,
        COUNT(DISTINCT i.id)::bigint AS count,
        COALESCE(SUM(ii.amount), 0) AS revenue,
        COALESCE(SUM(ii.quantity * COALESCE(ii.unit_cost, p.cost_price, 0)), 0) AS cogs
      FROM ${Prisma.raw(`${this.s}.invoices`)} i
      LEFT JOIN ${Prisma.raw(`${this.s}.invoice_items`)} ii ON ii.invoice_id = i.id
      LEFT JOIN ${Prisma.raw(`${this.s}.products`)} p ON p.id = ii.product_id
      ${invoiceWhere}
    `;

    const byDayRows = await prisma.$queryRaw<
      { day: string; total: unknown; count: bigint; revenue: unknown; cogs: unknown }[]
    >`
      SELECT
        TO_CHAR(i.date, 'YYYY-MM-DD') AS day,
        COALESCE(SUM(i.total), 0) AS total,
        COUNT(DISTINCT i.id)::bigint AS count,
        COALESCE(SUM(ii.amount), 0) AS revenue,
        COALESCE(SUM(ii.quantity * COALESCE(ii.unit_cost, p.cost_price, 0)), 0) AS cogs
      FROM ${Prisma.raw(`${this.s}.invoices`)} i
      LEFT JOIN ${Prisma.raw(`${this.s}.invoice_items`)} ii ON ii.invoice_id = i.id
      LEFT JOIN ${Prisma.raw(`${this.s}.products`)} p ON p.id = ii.product_id
      ${invoiceWhere}
      GROUP BY TO_CHAR(i.date, 'YYYY-MM-DD')
      ORDER BY day ASC
    `;

    const revenue = toNum(summaryRows[0]?.revenue);
    const cogs = toNum(summaryRows[0]?.cogs);

    return {
      summary: {
        totalSales: toNum(summaryRows[0]?.total_sales),
        count: Number(summaryRows[0]?.count ?? 0),
        revenue,
        cogs,
        profit: revenue - cogs,
      },
      byDay: byDayRows.map((r) => {
        const dayRevenue = toNum(r.revenue);
        const dayCogs = toNum(r.cogs);
        return {
          day: String(r.day),
          total: toNum(r.total),
          count: Number(r.count),
          revenue: dayRevenue,
          cogs: dayCogs,
          profit: dayRevenue - dayCogs,
        };
      }),
    };
  }

  async inventoryReport(from?: Date, to?: Date) {
    const conditions: Prisma.Sql[] = [];
    if (from) conditions.push(Prisma.sql`date >= ${from}`);
    if (to) conditions.push(Prisma.sql`date <= ${to}`);
    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const movementSummary = await prisma.$queryRaw<{ type: string; total_quantity: unknown; count: bigint }[]>`
      SELECT type, COALESCE(SUM(quantity), 0) AS total_quantity, COUNT(*)::bigint AS count
      FROM ${Prisma.raw(`${this.s}.stock_movements`)}
      ${where}
      GROUP BY type
    `;

    const products = await this.listProducts();
    return {
      movementSummary: movementSummary.map((m) => ({
        type: m.type,
        totalQuantity: toNum(m.total_quantity),
        count: Number(m.count),
      })),
      products,
    };
  }

  async topSellingProducts(from?: Date, to?: Date, limit = 10) {
    const conditions: Prisma.Sql[] = [];
    if (from) conditions.push(Prisma.sql`i.date >= ${from}`);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(Prisma.sql`i.date <= ${toDate}`);
    }
    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const rows = await prisma.$queryRaw<
      { product_id: string; product_name: string; total_qty: unknown; total_revenue: unknown; order_count: bigint }[]
    >`
      SELECT
        ii.product_id,
        ii.product_name,
        COALESCE(SUM(ii.quantity), 0) AS total_qty,
        COALESCE(SUM(ii.amount), 0) AS total_revenue,
        COUNT(DISTINCT i.id)::bigint AS order_count
      FROM ${Prisma.raw(`${this.s}.invoice_items`)} ii
      JOIN ${Prisma.raw(`${this.s}.invoices`)} i ON i.id = ii.invoice_id
      ${where}
      GROUP BY ii.product_id, ii.product_name
      ORDER BY total_qty DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      productId: String(r.product_id),
      productName: String(r.product_name),
      totalQty: toNum(r.total_qty),
      totalRevenue: toNum(r.total_revenue),
      orderCount: Number(r.order_count),
    }));
  }

  async lowStockProducts(): Promise<TenantProduct[]> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM ${Prisma.raw(`${this.s}.products`)}
      WHERE reorder_level > 0 AND quantity_on_hand <= reorder_level
      ORDER BY quantity_on_hand ASC
    `;
    return rows.map(mapProduct);
  }
}

export function createTenantDb(schemaName: string): TenantDb {
  return new TenantDb(schemaName);
}
