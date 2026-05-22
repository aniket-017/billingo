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

// Base URL where invoices are publicly accessible, e.g. https://dayalsir.plan2automate.com
// Should point to the same host that serves /invoices/:fileName from the backend.
const INVOICE_BASE_URL =
  process.env.INVOICE_BASE_URL ||
  `http://localhost:${process.env.PORT || 1970}`;

// Fixed public host for local development (NODE_ENV=development) so WhatsApp can fetch the PDF.
const DEV_INVOICE_BASE_URL = 'https://dayalsir.plan2automate.com';

function getInvoicePdfLink(invoiceNumber: string): string {
  console.log("process.env.NODE_ENV",process.env.NODE_ENV);
  if (process.env.NODE_ENV === 'development') {
    return `https://dayalsir.plan2automate.com/invoices/INV-1773223350379.pdf`;
  }
  const baseUrl = INVOICE_BASE_URL.replace(/\/+$/, '');
  return `${baseUrl}/invoices/${encodeURIComponent(invoiceNumber)}.pdf`;
}

function normalizeIndianPhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // If already starts with 91 and length 12 (91 + 10 digits), keep as is
  if (digits.startsWith('91') && digits.length === 12) {
    return digits;
  }

  // If plain 10-digit mobile number, prepend 91
  if (digits.length === 10) {
    return `91${digits}`;
  }

  // If starts with 0 and then 10-digit number, strip leading 0 and prepend 91
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }

  // Fallback: return digits as-is
  return digits;
}

export async function sendInvoiceWhatsApp(
  invoice: InvoiceForWhatsApp
): Promise<void> {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.warn(
      'WhatsApp config missing (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN); skipping WhatsApp send.'
    );
    return;
  }

  if (!INVOICE_BASE_URL) {
    console.warn('INVOICE_BASE_URL not set; skipping WhatsApp send.');
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

  const invoiceLink = getInvoicePdfLink(invoice.invoiceNumber);

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
