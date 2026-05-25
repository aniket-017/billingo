import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { quoteSchema } from './schemaUtils.js';

/** Adds batch_no, expiry_date, pack_size to products for medical bulk import (idempotent). */
export async function migrateTenantBulkFields(): Promise<void> {
  const businesses = await prisma.business.findMany({
    select: { schemaName: true },
  });

  for (const { schemaName } of businesses) {
    const s = quoteSchema(schemaName);
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.products`)}
        ADD COLUMN IF NOT EXISTS batch_no TEXT NOT NULL DEFAULT ''
    `;
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.products`)}
        ADD COLUMN IF NOT EXISTS expiry_date DATE
    `;
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.products`)}
        ADD COLUMN IF NOT EXISTS pack_size INTEGER NOT NULL DEFAULT 1
    `;
  }
}
