import { prisma } from '../db/connect.js';
import { createTenantDb } from '../db/tenant.js';
import type { WhatsAppDeliveryStatus } from '../types/tenant.js';

const STATUS_ORDER: Record<WhatsAppDeliveryStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 99,
};

export function shouldApplyWhatsAppStatus(
  current: WhatsAppDeliveryStatus | null | undefined,
  incoming: WhatsAppDeliveryStatus
): boolean {
  if (incoming === 'failed') return true;
  if (!current) return true;
  if (current === 'failed') return false;
  return STATUS_ORDER[incoming] >= STATUS_ORDER[current];
}

export async function findInvoiceByWhatsAppMessageId(
  waMessageId: string
): Promise<{ schemaName: string; invoiceId: string } | null> {
  const businesses = await prisma.business.findMany({
    where: { status: 'active' },
    select: { schemaName: true },
  });

  for (const { schemaName } of businesses) {
    const invoiceId = await createTenantDb(schemaName).findInvoiceIdByWhatsAppMessageId(
      waMessageId
    );
    if (invoiceId) {
      return { schemaName, invoiceId };
    }
  }
  return null;
}

export async function applyWhatsAppStatusUpdate(
  waMessageId: string,
  status: WhatsAppDeliveryStatus
): Promise<boolean> {
  const located = await findInvoiceByWhatsAppMessageId(waMessageId);
  if (!located) {
    console.warn(`WhatsApp status "${status}" for unknown message id ${waMessageId}`);
    return false;
  }

  const db = createTenantDb(located.schemaName);
  const invoice = await db.getInvoice(located.invoiceId);
  if (!invoice) return false;

  if (!shouldApplyWhatsAppStatus(invoice.whatsappStatus, status)) {
    return true;
  }

  await db.updateInvoiceWhatsApp(located.invoiceId, { status });
  return true;
}
