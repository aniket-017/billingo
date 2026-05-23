import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { quoteSchema } from './schemaUtils.js';

/** Adds unit_cost to invoice_items for profit reporting (idempotent). */
export async function migrateTenantInvoiceItemCost(): Promise<void> {
  const businesses = await prisma.business.findMany({
    select: { schemaName: true },
  });

  for (const { schemaName } of businesses) {
    const s = quoteSchema(schemaName);
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.invoice_items`)}
        ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12, 2)
    `;
  }
}
