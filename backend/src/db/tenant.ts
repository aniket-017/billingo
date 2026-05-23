import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { quoteSchema } from './schemaUtils.js';
import type {
  BusinessSettingsData,
  TenantCustomer,
  TenantInvoice,
  TenantInvoiceItem,
  TenantProduct,
  TenantStockMovement,
  StockMovementType,
  WhatsAppDeliveryStatus,
} from '../types/tenant.js';

function toNum(v: unknown): number {
  if (v == null) return 0;
  return Number(v);
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
    unit: String(row.unit ?? 'pcs'),
    description: String(row.description ?? ''),
    quantityOnHand: Number(row.quantity_on_hand ?? 0),
    reorderLevel: Number(row.reorder_level ?? 0),
    costPrice: row.cost_price != null ? toNum(row.cost_price) : null,
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
    date: new Date(row.date as string | Date).toISOString(),
    referenceType: String(row.reference_type ?? 'manual'),
    referenceId: row.reference_id ? String(row.reference_id) : null,
    referenceLabel: String(row.reference_label ?? ''),
    notes: String(row.notes ?? ''),
    createdByEmail: String(row.created_by_email ?? ''),
    createdByName: String(row.created_by_name ?? ''),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    product,
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

  async createProduct(data: {
    barcode: string;
    name: string;
    price: number;
    unit?: string;
    description?: string;
    reorderLevel?: number;
    costPrice?: number | null;
  }): Promise<TenantProduct> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      INSERT INTO ${Prisma.raw(`${this.s}.products`)}
        (barcode, name, price, unit, description, reorder_level, cost_price)
      VALUES (
        ${data.barcode},
        ${data.name},
        ${data.price},
        ${data.unit ?? 'pcs'},
        ${data.description ?? ''},
        ${data.reorderLevel ?? 0},
        ${data.costPrice ?? null}
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
      unit: string;
      description: string;
      reorderLevel: number;
      costPrice: number | null;
    }>
  ): Promise<TenantProduct | null> {
    const current = await this.getProduct(id);
    if (!current) return null;
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      UPDATE ${Prisma.raw(`${this.s}.products`)}
      SET barcode = ${data.barcode ?? current.barcode},
          name = ${data.name ?? current.name},
          price = ${data.price ?? current.price},
          unit = ${data.unit ?? current.unit},
          description = ${data.description ?? current.description},
          reorder_level = ${data.reorderLevel ?? current.reorderLevel},
          cost_price = ${data.costPrice !== undefined ? data.costPrice : current.costPrice},
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
    createdByEmail?: string;
    createdByName?: string;
  }): Promise<TenantStockMovement> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      INSERT INTO ${Prisma.raw(`${this.s}.stock_movements`)}
        (product_id, type, quantity, balance_after, date, reference_type, reference_id, reference_label, notes, created_by_email, created_by_name)
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
        ${data.createdByEmail ?? ''},
        ${data.createdByName ?? ''}
      )
      RETURNING *
    `;
    return mapMovement(rows[0]);
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
      SELECT m.*, p.name AS p_name, p.barcode AS p_barcode, p.unit AS p_unit
      FROM ${Prisma.raw(`${this.s}.stock_movements`)} m
      LEFT JOIN ${Prisma.raw(`${this.s}.products`)} p ON p.id = m.product_id
      ${where}
      ORDER BY m.date DESC, m.created_at DESC
      LIMIT ${opts.pageSize} OFFSET ${offset}
    `;
    return { items: rows.map(mapMovement), total };
  }

  // --- Invoices ---
  async listInvoices(opts: {
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }): Promise<{ items: TenantInvoice[]; total: number }> {
    const conditions: Prisma.Sql[] = [];
    if (opts.from) conditions.push(Prisma.sql`i.date >= ${opts.from}`);
    if (opts.to) conditions.push(Prisma.sql`i.date <= ${opts.to}`);
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
