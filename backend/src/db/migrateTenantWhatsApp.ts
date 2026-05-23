import { Prisma } from '@prisma/client';
import { prisma } from './connect.js';
import { quoteSchema } from './schemaUtils.js';

/** Adds WhatsApp delivery columns to every tenant schema (idempotent). */
export async function migrateTenantWhatsAppColumns(): Promise<void> {
  const businesses = await prisma.business.findMany({
    select: { schemaName: true },
  });

  for (const { schemaName } of businesses) {
    const s = quoteSchema(schemaName);
    await prisma.$executeRaw`
      ALTER TABLE ${Prisma.raw(`${s}.invoices`)}
        ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT,
        ADD COLUMN IF NOT EXISTS whatsapp_status TEXT
    `;
  }
}
