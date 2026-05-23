import type { WhatsAppDeliveryStatus } from '../types/tenant.js';
import { applyWhatsAppStatusUpdate } from './whatsappDelivery.js';

type WebhookStatus = {
  id?: string;
  status?: string;
};

type WebhookBody = {
  object?: string;
  entry?: {
    changes?: {
      value?: {
        statuses?: WebhookStatus[];
      };
    }[];
  }[];
};

const VALID_STATUSES = new Set<WhatsAppDeliveryStatus>(['sent', 'delivered', 'read', 'failed']);

function parseStatuses(body: WebhookBody): { messageId: string; status: WhatsAppDeliveryStatus }[] {
  const results: { messageId: string; status: WhatsAppDeliveryStatus }[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const item of change.value?.statuses ?? []) {
        if (!item.id || !item.status) continue;
        const status = item.status.toLowerCase() as WhatsAppDeliveryStatus;
        if (!VALID_STATUSES.has(status)) continue;
        results.push({ messageId: item.id, status });
      }
    }
  }

  return results;
}

export async function handleWhatsAppWebhookPayload(body: WebhookBody): Promise<void> {
  const updates = parseStatuses(body);
  for (const { messageId, status } of updates) {
    try {
      await applyWhatsAppStatusUpdate(messageId, status);
    } catch (err) {
      console.error(`Failed to apply WhatsApp status ${status} for ${messageId}:`, err);
    }
  }
}
