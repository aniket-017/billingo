import { api, type Invoice, type WhatsAppDeliveryStatus } from '../api/client';

const TERMINAL: WhatsAppDeliveryStatus[] = ['delivered', 'read', 'failed'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll invoice until webhook updates delivery status or timeout. */
export async function waitForWhatsAppDelivery(
  invoiceId: string,
  options?: { maxMs?: number; intervalMs?: number }
): Promise<WhatsAppDeliveryStatus | 'timeout'> {
  const maxMs = options?.maxMs ?? 90_000;
  const intervalMs = options?.intervalMs ?? 2_500;
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    const inv: Invoice = await api.invoices.get(invoiceId);
    const status = inv.whatsappStatus;
    if (status && TERMINAL.includes(status)) {
      return status;
    }
    await sleep(intervalMs);
  }

  return 'timeout';
}

const SEND_FAILURE_MESSAGES: Record<string, string> = {
  config_missing: 'WhatsApp is not configured on the server.',
  s3_config_missing: 'Invoice storage (S3) is not configured.',
  invalid_phone: 'Customer has no valid phone number.',
  presign_failed: 'Could not prepare the invoice PDF link.',
  api_error: 'WhatsApp API rejected the message.',
  no_message_id: 'WhatsApp accepted the request but returned no message id.',
  network_error: 'Could not reach the WhatsApp API.',
  unexpected_error: 'WhatsApp send failed unexpectedly.',
  fetch_unavailable: 'Server cannot call WhatsApp API.',
};

export function whatsAppSendFailureMessage(reason: string): string {
  return SEND_FAILURE_MESSAGES[reason] ?? 'WhatsApp invoice could not be sent.';
}
