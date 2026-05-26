import { cleanModelOutput, getProductNameAiProvider } from './productNameAiShared.js';
import { isGeminiConfigured } from './gemini.js';
import { isDeepSeekConfigured } from './deepseek.js';

export type ParsedInvoiceProduct = {
  name: string;
  qty: number;
  rate: number;
  mrp: number;
  sellingPrice: number;
  batchNo: string;
  expiry: string;
  packSize: number;
};

export type ParsedInvoiceResult = {
  dealerName: string;
  products: ParsedInvoiceProduct[];
};

const INVOICE_PARSE_PROMPT = `You extract structured data from OCR text of Indian medical/pharmaceutical supplier invoices, purchase bills, or stock sheets.

Return a JSON object with two fields:
1. "dealerName" (string): The supplier/dealer/distributor name from the invoice header. Default "" if not found.
2. "products" (array): An array of product objects.

Each product object has these fields:
- "name" (string): The medicine/product name. Include strength/dosage if present (e.g. "Paracetamol 500mg", "Amoxicillin 250mg").
- "qty" (number): Quantity purchased. Use the numeric value. Default 0 if not found.
- "rate" (number): Purchase price/rate (the cost the shop owner pays to the supplier) per unit or per strip. Default 0 if not found.
- "mrp" (number): Maximum Retail Price (the price printed on the product packaging). Default 0 if not found.
- "sellingPrice" (number): The actual selling price if different from MRP (e.g. discounted price). Default 0 if not found. If only MRP is shown, set to 0.
- "batchNo" (string): Batch/lot number. Default "" if not found.
- "expiry" (string): Expiry date in YYYY-MM-DD format. If only month and year are given (e.g. "06/27", "Jun 2027"), use the last day of that month (e.g. "2027-06-30"). Default "" if not found.
- "packSize" (number): Number of units (tablets/capsules) per strip or pack if mentioned (e.g. "10s", "1x10", "strip of 10", "10T" = 10). Default 1 if not mentioned or if the item is not a strip/pack product.

Rules:
- Extract ALL product rows from the text. Do not skip any.
- The dealerName should come from the invoice header — look for the company/firm name at the top.
- Ignore totals, subtotals, tax lines, GST details, invoice number, date.
- If a value is ambiguous or unreadable, use the defaults above.
- Numbers should be plain numbers without currency symbols.
- Return ONLY the JSON object, no explanation or markdown.`;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_BASE_URL = (
  process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'
).replace(/\/$/, '');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(
  /\/$/,
  ''
);

function mapProduct(item: Record<string, unknown>): ParsedInvoiceProduct {
  return {
    name: String(item.name ?? '').trim(),
    qty: Number(item.qty) || 0,
    rate: Number(item.rate) || 0,
    mrp: Number(item.mrp ?? item.MRP ?? 0) || 0,
    sellingPrice: Number(item.sellingPrice ?? item.selling_price ?? 0) || 0,
    batchNo: String(item.batchNo ?? item.batch_no ?? item.batch ?? '').trim(),
    expiry: String(item.expiry ?? item.expiryDate ?? item.expiry_date ?? '').trim(),
    packSize: Math.max(1, Number(item.packSize ?? item.pack_size ?? 1)),
  };
}

function parseJsonResult(raw: string): ParsedInvoiceResult {
  let text = cleanModelOutput(raw);

  const parsed = JSON.parse(text);

  // Handle new object format: { dealerName, products: [...] }
  if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.products)) {
    return {
      dealerName: String(parsed.dealerName ?? parsed.dealer_name ?? '').trim(),
      products: parsed.products.map((item: Record<string, unknown>) => mapProduct(item)),
    };
  }

  // Backwards-compat: plain array response
  if (Array.isArray(parsed)) {
    return {
      dealerName: '',
      products: parsed.map((item: Record<string, unknown>) => mapProduct(item)),
    };
  }

  throw new Error('Expected a JSON object with products array');
}

async function parseInvoiceWithGemini(ocrText: string): Promise<ParsedInvoiceResult> {
  if (!isGeminiConfigured()) throw new Error('AI_NOT_CONFIGURED');

  const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY!,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INVOICE_PARSE_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: ocrText }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message || res.statusText || 'Gemini request failed';
    throw new Error(`Gemini: ${msg}`);
  }

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content?.trim()) throw new Error('Gemini returned empty response');

  return parseJsonResult(content);
}

async function parseInvoiceWithDeepSeek(ocrText: string): Promise<ParsedInvoiceResult> {
  if (!isDeepSeekConfigured()) throw new Error('AI_NOT_CONFIGURED');

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: INVOICE_PARSE_PROMPT },
        { role: 'user', content: ocrText },
      ],
      stream: false,
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message || res.statusText || 'DeepSeek request failed';
    throw new Error(`DeepSeek: ${msg}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error('DeepSeek returned empty response');

  return parseJsonResult(content);
}

export function isInvoiceParseAiConfigured(): boolean {
  try {
    const provider = getProductNameAiProvider();
    return provider === 'google' ? isGeminiConfigured() : isDeepSeekConfigured();
  } catch {
    return false;
  }
}

export async function parseInvoiceOcr(ocrText: string): Promise<ParsedInvoiceResult> {
  const provider = getProductNameAiProvider();

  if (provider === 'google') {
    return parseInvoiceWithGemini(ocrText);
  }
  return parseInvoiceWithDeepSeek(ocrText);
}
