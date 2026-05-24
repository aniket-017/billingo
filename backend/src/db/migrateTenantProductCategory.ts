import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { quoteSchema } from './schemaUtils.js';

/** Adds category to products for grouping (idempotent). */
export async function migrateTenantProductCategory(): Promise<void> {
  const businesses = await prisma.business.findMany({
    select: { schemaName: true },
  });

  for (const { schemaName } of businesses) {
    const s = quoteSchema(schemaName);
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.products`)}
        ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT ''
    `;
  }
}
