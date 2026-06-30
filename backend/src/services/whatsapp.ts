import { getInvoicePresignedUrl, validateS3Config } from './s3.js';
import {
  logWhatsAppError,
  logWhatsAppInfo,
  logWhatsAppWarn,
  maskPhone,
  parseMetaApiError,
  truncateUrl,
} from './whatsappLog.js';

type CustomerForWhatsApp = {
  name?: string;
  phone?: string;
};

type InvoiceForWhatsApp = {
  invoiceNumber: string;
  customerId?: CustomerForWhatsApp | null;
  customer?: CustomerForWhatsApp | null;
};

const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || 'bookstore_invoice';

function normalizeIndianPhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('91') && digits.length === 12) {
    return digits;
  }

  if (digits.length === 10) {
    return `91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }

  return digits;
}

export type SendInvoiceWhatsAppResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string; detail?: string };

type BusinessDetails = {
  storeName: string;
  shopContact: string;
};

export async function sendInvoiceWhatsApp(
  businessId: string,
  invoice: InvoiceForWhatsApp,
  business: BusinessDetails
): Promise<SendInvoiceWhatsAppResult> {
  const customer = invoice.customer ?? invoice.customerId;
  const context = {
    businessId,
    invoiceNumber: invoice.invoiceNumber,
    customerName: customer?.name || '—',
    customerPhone: maskPhone(customer?.phone),
    template: WHATSAPP_TEMPLATE_NAME,
  };

  logWhatsAppInfo('send_start', context);

  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    logWhatsAppWarn('send_skipped', { ...context, reason: 'config_missing' });
    return { ok: false, reason: 'config_missing' };
  }

  if (!validateS3Config()) {
    logWhatsAppWarn('send_skipped', { ...context, reason: 's3_config_missing' });
    return { ok: false, reason: 's3_config_missing' };
  }

  const customerPhone = customer?.phone;
  const to = normalizeIndianPhone(customerPhone || '');

  if (!to) {
    logWhatsAppWarn('send_skipped', {
      ...context,
      reason: 'invalid_phone',
      rawPhone: customerPhone ?? null,
    });
    return { ok: false, reason: 'invalid_phone' };
  }

  let invoiceLink: string;
  try {
    invoiceLink = await getInvoicePresignedUrl(businessId, invoice.invoiceNumber);
    logWhatsAppInfo('presign_ok', {
      ...context,
      pdfLink: truncateUrl(invoiceLink),
    });
  } catch (err) {
    logWhatsAppError('presign_failed', {
      ...context,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: 'presign_failed' };
  }

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: WHATSAPP_TEMPLATE_NAME,
      language: {
        code: 'en',
      },
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'document',
              document: {
                link: invoiceLink,
                filename: 'invoice.pdf',
              },
            },
          ],
        },
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: customer?.name || '',
            },
            {
              type: 'text',
              text: invoice.invoiceNumber,
            },
            {
              type: 'text',
              text: business.storeName || '',
            },
            {
              type: 'text',
              text: business.shopContact || '',
            },
          ],
        },
      ],
    },
  };

  const fetchFn: typeof fetch | undefined = (globalThis as any).fetch;
  if (!fetchFn) {
    logWhatsAppWarn('send_skipped', { ...context, reason: 'fetch_unavailable' });
    return { ok: false, reason: 'fetch_unavailable' };
  }

  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  logWhatsAppInfo('api_request', {
    ...context,
    to: maskPhone(to),
    storeName: business.storeName,
    shopContact: maskPhone(business.shopContact),
    pdfLink: truncateUrl(invoiceLink),
  });

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const responseText = await res.text().catch(() => '');

    if (!res.ok) {
      const metaError = parseMetaApiError(responseText);
      logWhatsAppError('api_error', {
        ...context,
        httpStatus: res.status,
        httpStatusText: res.statusText,
        metaError,
        responseBody: responseText.slice(0, 2000),
      });
      const detail =
        metaError && typeof metaError.message === 'string'
          ? metaError.message
          : responseText.slice(0, 500) || undefined;
      return { ok: false, reason: 'api_error', detail };
    }

    let data: { messages?: { id?: string }[]; error?: Record<string, unknown> } | null = null;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      logWhatsAppError('api_response_invalid_json', {
        ...context,
        httpStatus: res.status,
        responseBody: responseText.slice(0, 2000),
      });
      return { ok: false, reason: 'invalid_response' };
    }

    const messageId = data?.messages?.[0]?.id;
    if (!messageId) {
      logWhatsAppWarn('api_no_message_id', {
        ...context,
        httpStatus: res.status,
        responseBody: responseText.slice(0, 2000),
      });
      return { ok: false, reason: 'no_message_id' };
    }

    logWhatsAppInfo('send_success', {
      ...context,
      messageId,
      httpStatus: res.status,
      responseBody: responseText.slice(0, 500),
    });

    return { ok: true, messageId };
  } catch (err) {
    logWhatsAppError('network_error', {
      ...context,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return { ok: false, reason: 'network_error' };
  }
}
