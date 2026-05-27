import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { quoteSchema } from './schemaUtils.js';
import { normalizeProductName } from '../services/productMatch.js';

/** Adds name_normalized to products and backfills from name (idempotent). */
export async function migrateTenantNameNormalized(): Promise<void> {
  const businesses = await prisma.business.findMany({
    select: { schemaName: true },
  });

  for (const { schemaName } of businesses) {
    const s = quoteSchema(schemaName);
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.products`)}
        ADD COLUMN IF NOT EXISTS name_normalized TEXT NOT NULL DEFAULT ''
    `;
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS idx_products_name_normalized ON ${s}.products (name_normalized)`
    );

    const rows = await prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM ${Prisma.raw(`${s}.products`)}
      WHERE name_normalized = '' OR name_normalized IS NULL
    `;

    for (const row of rows) {
      const key = normalizeProductName(row.name).normalizedKey;
      await prisma.$executeRaw`
        UPDATE ${Prisma.raw(`${s}.products`)}
        SET name_normalized = ${key}
        WHERE id = ${row.id}::uuid
      `;
    }
  }
}
