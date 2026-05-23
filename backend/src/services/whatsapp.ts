import { getInvoicePresignedUrl, validateS3Config } from './s3.js';

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
const WHATSAPP_SHOP_CONTACT = process.env.WHATSAPP_SHOP_CONTACT || '+91 8421630880';

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

export async function sendInvoiceWhatsApp(
  businessId: string,
  invoice: InvoiceForWhatsApp
): Promise<void> {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.warn(
      'WhatsApp config missing (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN); skipping WhatsApp send.'
    );
    return;
  }

  if (!validateS3Config()) {
    console.warn(
      'S3 config missing (AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY); skipping WhatsApp send.'
    );
    return;
  }

  const customer = invoice.customer ?? invoice.customerId;
  const customerPhone = customer?.phone;
  const to = normalizeIndianPhone(customerPhone || '');

  if (!to) {
    console.warn(
      `No valid customer phone for WhatsApp invoice ${invoice.invoiceNumber}; skipping send.`
    );
    return;
  }

  let invoiceLink: string;
  try {
    invoiceLink = await getInvoicePresignedUrl(businessId, invoice.invoiceNumber);
  } catch (err) {
    console.error(
      `Failed to generate presigned URL for invoice ${invoice.invoiceNumber}:`,
      err
    );
    return;
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
              text: WHATSAPP_SHOP_CONTACT,
            },
          ],
        },
      ],
    },
  };

  const fetchFn: typeof fetch | undefined = (globalThis as any).fetch;
  if (!fetchFn) {
    console.warn('globalThis.fetch is not available; skipping WhatsApp send.');
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        `Failed to send WhatsApp invoice ${invoice.invoiceNumber}:`,
        res.status,
        res.statusText,
        text
      );
    }
  } catch (err) {
    console.error(
      `Error while calling WhatsApp API for invoice ${invoice.invoiceNumber}:`,
      err
    );
  }
}
