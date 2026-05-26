import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { quoteSchema } from './schemaUtils.js';

/** Adds mrp, selling_price, num_boxes, strips_per_box, tablets_per_strip, dealer_name to products (idempotent). */
export async function migrateTenantProductFields(): Promise<void> {
  const businesses = await prisma.business.findMany({
    select: { schemaName: true },
  });

  for (const { schemaName } of businesses) {
    const s = quoteSchema(schemaName);
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.products`)}
        ADD COLUMN IF NOT EXISTS mrp DECIMAL(12, 2)
    `;
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.products`)}
        ADD COLUMN IF NOT EXISTS selling_price DECIMAL(12, 2)
    `;
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.products`)}
        ADD COLUMN IF NOT EXISTS num_boxes INTEGER NOT NULL DEFAULT 1
    `;
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.products`)}
        ADD COLUMN IF NOT EXISTS strips_per_box INTEGER NOT NULL DEFAULT 1
    `;
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.products`)}
        ADD COLUMN IF NOT EXISTS tablets_per_strip INTEGER NOT NULL DEFAULT 1
    `;
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.products`)}
        ADD COLUMN IF NOT EXISTS dealer_name TEXT NOT NULL DEFAULT ''
    `;
  }
}
