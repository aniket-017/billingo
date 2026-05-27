import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { quoteSchema } from './schemaUtils.js';

export async function migrateStockInInvoices(): Promise<void> {
  const businesses = await prisma.business.findMany({
    select: { schemaName: true },
  });

  for (const { schemaName } of businesses) {
    const s = quoteSchema(schemaName);

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS ${Prisma.raw(`${s}.stock_in_invoices`)} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_name TEXT NOT NULL DEFAULT '',
        supplier_gst_number TEXT NOT NULL DEFAULT '',
        supplier_drug_license_number TEXT NOT NULL DEFAULT '',
        supplier_address TEXT NOT NULL DEFAULT '',
        supplier_mobile TEXT NOT NULL DEFAULT '',
        supplier_email TEXT NOT NULL DEFAULT '',
        supplier_state_code TEXT NOT NULL DEFAULT '',
        supplier_pan_number TEXT NOT NULL DEFAULT '',
        supplier_code TEXT NOT NULL DEFAULT '',
        invoice_number TEXT NOT NULL DEFAULT '',
        invoice_date TIMESTAMPTZ,
        due_date TIMESTAMPTZ,
        invoice_total DECIMAL(12, 2),
        gst_total DECIMAL(12, 2),
        discount DECIMAL(12, 2),
        round_off DECIMAL(12, 2),
        payment_type TEXT NOT NULL DEFAULT '',
        supplier_gst TEXT NOT NULL DEFAULT '',
        place_of_supply TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_by_email TEXT NOT NULL DEFAULT '',
        created_by_name TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_in_invoices_lookup ON ${s}.stock_in_invoices (invoice_number, supplier_gst)`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_in_invoices_date ON ${s}.stock_in_invoices (invoice_date DESC, created_at DESC)`
    );

    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.stock_movements`)}
      ADD COLUMN IF NOT EXISTS stock_in_invoice_id UUID
    `;
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_stock_movements_stock_in_invoice ON ${s}.stock_movements (stock_in_invoice_id)`
    );
  }
}

