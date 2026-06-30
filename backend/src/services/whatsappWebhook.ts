import type { WhatsAppDeliveryStatus } from '../types/tenant.js';
import { applyWhatsAppStatusUpdate } from './whatsappDelivery.js';
import {
  logWhatsAppCallback,
  logWhatsAppError,
  logWhatsAppInfo,
  logWhatsAppWarn,
  maskPhone,
  type MetaWebhookError,
  summarizeWebhookErrors,
} from './whatsappLog.js';

type WebhookStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: MetaWebhookError[];
};

type WebhookBody = {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        statuses?: WebhookStatus[];
      };
    }[];
  }[];
};

const VALID_STATUSES = new Set<WhatsAppDeliveryStatus>(['sent', 'delivered', 'read', 'failed']);

export type ParsedWhatsAppStatusUpdate = {
  messageId: string;
  status: WhatsAppDeliveryStatus;
  timestamp?: string;
  recipientId?: string;
  errors?: MetaWebhookError[];
  phoneNumberId?: string;
  displayPhoneNumber?: string;
};

export function parseWebhookStatuses(body: WebhookBody): ParsedWhatsAppStatusUpdate[] {
  const results: ParsedWhatsAppStatusUpdate[] = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const metadata = value?.metadata;
      for (const item of value?.statuses ?? []) {
        if (!item.id || !item.status) continue;
        const status = item.status.toLowerCase() as WhatsAppDeliveryStatus;
        if (!VALID_STATUSES.has(status)) continue;
        results.push({
          messageId: item.id,
          status,
          timestamp: item.timestamp,
          recipientId: item.recipient_id,
          errors: item.errors,
          phoneNumberId: metadata?.phone_number_id,
          displayPhoneNumber: metadata?.display_phone_number,
        });
      }
    }
  }

  return results;
}

export async function handleWhatsAppWebhookPayload(body: WebhookBody): Promise<void> {
  logWhatsAppInfo('webhook_received', {
    object: body.object,
    entryCount: body.entry?.length ?? 0,
    rawPayload: JSON.stringify(body).slice(0, 4000),
  });

  const updates = parseWebhookStatuses(body);

  if (updates.length === 0) {
    logWhatsAppInfo('webhook_no_status_updates', {
      object: body.object,
    });
    return;
  }

  for (const update of updates) {
    const errorSummary = summarizeWebhookErrors(update.errors);

    // Easy grep: search logs for "webhook_callback messageId=wamid...."
    logWhatsAppCallback(update.messageId, update.status, {
      recipient: maskPhone(update.recipientId),
      ...(errorSummary ?? {}),
    });

    const logPayload = {
      messageId: update.messageId,
      status: update.status,
      timestamp: update.timestamp,
      recipient: maskPhone(update.recipientId),
      phoneNumberId: update.phoneNumberId,
      displayPhoneNumber: update.displayPhoneNumber,
      ...(errorSummary ?? {}),
    };

    if (update.status === 'failed') {
      logWhatsAppError('webhook_delivery_failed', logPayload);
    } else {
      logWhatsAppInfo('webhook_status_update', logPayload);
    }

    try {
      const applied = await applyWhatsAppStatusUpdate(update.messageId, update.status);
      if (!applied) {
        logWhatsAppWarn('webhook_status_not_applied', {
          messageId: update.messageId,
          status: update.status,
        });
      }
    } catch (err) {
      logWhatsAppError('webhook_status_apply_error', {
        messageId: update.messageId,
        status: update.status,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
