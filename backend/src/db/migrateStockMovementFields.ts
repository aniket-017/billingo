import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { quoteSchema } from './schemaUtils.js';

export async function migrateStockMovementFields(): Promise<void> {
  const businesses = await prisma.business.findMany({
    select: { schemaName: true },
  });

  for (const { schemaName } of businesses) {
    const s = quoteSchema(schemaName);
    const t = `${s}.stock_movements`;
    await prisma.$executeRaw`ALTER TABLE ${Prisma.raw(t)} ADD COLUMN IF NOT EXISTS dealer_name TEXT NOT NULL DEFAULT ''`;
    await prisma.$executeRaw`ALTER TABLE ${Prisma.raw(t)} ADD COLUMN IF NOT EXISTS batch_no TEXT NOT NULL DEFAULT ''`;
    await prisma.$executeRaw`ALTER TABLE ${Prisma.raw(t)} ADD COLUMN IF NOT EXISTS expiry_date DATE`;
    await prisma.$executeRaw`ALTER TABLE ${Prisma.raw(t)} ADD COLUMN IF NOT EXISTS cost_price DECIMAL(12, 2)`;
    await prisma.$executeRaw`ALTER TABLE ${Prisma.raw(t)} ADD COLUMN IF NOT EXISTS mrp DECIMAL(12, 2)`;
    await prisma.$executeRaw`ALTER TABLE ${Prisma.raw(t)} ADD COLUMN IF NOT EXISTS selling_price DECIMAL(12, 2)`;
    await prisma.$executeRaw`ALTER TABLE ${Prisma.raw(t)} ADD COLUMN IF NOT EXISTS num_boxes INTEGER NOT NULL DEFAULT 1`;
    await prisma.$executeRaw`ALTER TABLE ${Prisma.raw(t)} ADD COLUMN IF NOT EXISTS strips_per_box INTEGER NOT NULL DEFAULT 1`;
    await prisma.$executeRaw`ALTER TABLE ${Prisma.raw(t)} ADD COLUMN IF NOT EXISTS tablets_per_strip INTEGER NOT NULL DEFAULT 1`;
  }
}
