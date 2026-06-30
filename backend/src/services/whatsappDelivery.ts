import { prisma } from '../db/connect.js';
import { createTenantDb } from '../db/tenant.js';
import type { WhatsAppDeliveryStatus } from '../types/tenant.js';
import { logWhatsAppInfo, logWhatsAppWarn } from './whatsappLog.js';

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
    logWhatsAppWarn('status_unknown_message', { messageId: waMessageId, status });
    return false;
  }

  const db = createTenantDb(located.schemaName);
  const invoice = await db.getInvoice(located.invoiceId);
  if (!invoice) {
    logWhatsAppWarn('status_invoice_not_found', {
      messageId: waMessageId,
      status,
      schemaName: located.schemaName,
      invoiceId: located.invoiceId,
    });
    return false;
  }

  const previousStatus = invoice.whatsappStatus ?? null;

  if (!shouldApplyWhatsAppStatus(invoice.whatsappStatus, status)) {
    logWhatsAppInfo('status_skipped', {
      messageId: waMessageId,
      invoiceNumber: invoice.invoiceNumber,
      previousStatus,
      incomingStatus: status,
      reason: 'status_already_ahead_or_failed_locked',
    });
    return true;
  }

  await db.updateInvoiceWhatsApp(located.invoiceId, { status });

  logWhatsAppInfo('status_applied', {
    messageId: waMessageId,
    invoiceNumber: invoice.invoiceNumber,
    schemaName: located.schemaName,
    customerName: invoice.customer?.name ?? '—',
    previousStatus,
    newStatus: status,
  });

  return true;
}
