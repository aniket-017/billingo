import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { quoteSchema } from './schemaUtils.js';

/** Normalize stored phones and add a partial unique index (one non-empty phone per tenant). */
export async function migrateTenantCustomerPhoneUnique(): Promise<void> {
  const businesses = await prisma.business.findMany({
    select: { schemaName: true },
  });

  for (const { schemaName } of businesses) {
    const s = quoteSchema(schemaName);
    const table = Prisma.raw(`${s}.customers`);

    await prisma.$executeRaw`
      UPDATE ${table}
      SET phone = RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10),
          updated_at = NOW()
      WHERE phone <> ''
        AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 10
    `;

    try {
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique
        ON ${quoteSchema(schemaName)}.customers (phone)
        WHERE phone <> ''
      `);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('duplicate key') || msg.includes('23505') || msg.includes('unique')) {
        console.warn(
          `Tenant ${schemaName}: duplicate customer phones exist — remove duplicates, then restart to enforce unique index.`
        );
      } else {
        throw err;
      }
    }
  }
}
