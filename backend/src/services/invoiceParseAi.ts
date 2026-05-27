import { cleanModelOutput, getInvoiceImageAiProvider, getProductNameAiProvider } from './productNameAiShared.js';
import { isGeminiConfigured } from './gemini.js';
import { isDeepSeekConfigured } from './deepseek.js';

export type PricingUnit = 'strip' | 'box' | 'tablet';
export type ParseConfidence = 'high' | 'low';

export type ParsedInvoiceProduct = {
  name: string;
  qty: number;
  rate: number;
  mrp: number;
  sellingPrice: number;
  batchNo: string;
  expiry: string;
  packSize: number;
  category: string;
  pricingUnit: PricingUnit;
  numBoxes: number;
  stripsPerBox: number;
  tabletsPerStrip: number;
  confidence: ParseConfidence;
  packRaw: string;
};

export type ParsedInvoiceResult = {
  dealerName: string;
  products: ParsedInvoiceProduct[];
};

const INVOICE_IMAGE_PARSE_PROMPT = `You extract structured data from a photo of an Indian medical/pharmaceutical supplier invoice, purchase bill, or stock sheet.

Read the full product table directly from the image (no OCR step). Return a JSON object with two fields:
1. "dealerName" (string): The supplier/dealer/distributor name from the invoice header. Default "" if not found.
2. "products" (array): An array of product objects in exact top-to-bottom invoice row order.

Each product object has these fields:
- "name" (string): Medicine/product name with strength if present (e.g. "MEFTAL SPAS TAB", "ONDEM MD 4MG TAB").
- "qty" (number): Invoice quantity column — count of strips/boxes/bottles purchased, NOT total tablet count. Default 0.
- "rate" (number): Purchase/cost price per pricing unit (strip, box, or bottle as printed). Default 0.
- "mrp" (number): Maximum Retail Price for the same pricing unit. Default 0.
- "sellingPrice" (number): Set equal to mrp when MRP is known. Default 0 if MRP missing.
- "batchNo" (string): Batch/lot number. Default "".
- "expiry" (string): Expiry in MM/YY format only (e.g. "06/27", "12/28"). Use 2-digit month with leading zero when needed. Default "".
- "packRaw" (string): Raw PACK/Pkg/UNIT text from invoice (e.g. "30*10", "10'S", "500ML", "1*10"). Default "".
- "packSize" (number): Tablets/capsules per strip (legacy). Same as tabletsPerStrip when applicable. Default 1.
- "category" (string): One of: "Tablet", "Capsule", "Syrup", "Injection", "Cream", "Ointment", "Drops", "Powder", "Inhaler", "Gel", "Lotion", "Spray", "Soap", "Surgical", "Device", "Supplement", "Ayurvedic", "General".
- "pricingUnit" (string): "strip", "box", or "tablet" — which unit MRP/rate refer to.
- "numBoxes" (number): Boxes or outer packs purchased. For liquids/devices use invoice qty. Default 1.
- "stripsPerBox" (number): Strips per box. Default 1 for non-strip products.
- "tabletsPerStrip" (number): Tablets/capsules per strip. Default 1 for bottles/liquids/devices.
- "confidence" (string): "high" if name, price, and pack are clear; "low" if any critical field was guessed or missing.

PACK parsing: "10'S" → tabletsPerStrip=10; "30*10" → stripsPerBox=30, tabletsPerStrip=10, pricingUnit="box"; "500ML" → single bottle, pricingUnit="box".

Rules:
- Extract ALL product rows visible in the image. Do not skip any.
- products array order MUST match invoice top-to-bottom order.
- Ignore totals, tax lines, invoice numbers.
- Escape double quotes inside string values as \\".
- Return ONLY valid JSON, no markdown.`;

const INVOICE_PARSE_PROMPT = `You extract structured data from OCR text of Indian medical/pharmaceutical supplier invoices, purchase bills, or stock sheets.

Return a JSON object with two fields:
1. "dealerName" (string): The supplier/dealer/distributor name from the invoice header. Default "" if not found.
2. "products" (array): An array of product objects in exact top-to-bottom invoice row order.

Each product object has these fields:
- "name" (string): Medicine/product name with strength if present (e.g. "MEFTAL SPAS TAB", "ONDEM MD 4MG TAB").
- "qty" (number): Invoice quantity column — count of strips/boxes/bottles purchased, NOT total tablet count. Default 0.
- "rate" (number): Purchase/cost price per pricing unit (strip, box, or bottle as printed). Default 0.
- "mrp" (number): Maximum Retail Price for the same pricing unit. Default 0.
- "sellingPrice" (number): Set equal to mrp when MRP is known. Default 0 if MRP missing.
- "batchNo" (string): Batch/lot number. Default "".
- "expiry" (string): Expiry in MM/YY format only (e.g. "06/27", "12/28"). Use 2-digit month with leading zero when needed. Default "".
- "packRaw" (string): Raw PACK/Pkg/UNIT text from invoice (e.g. "30*10", "10'S", "500ML", "1*10"). Default "".
- "packSize" (number): Tablets/capsules per strip (legacy). Same as tabletsPerStrip when applicable. Default 1.
- "category" (string): One of: "Tablet", "Capsule", "Syrup", "Injection", "Cream", "Ointment", "Drops", "Powder", "Inhaler", "Gel", "Lotion", "Spray", "Soap", "Surgical", "Device", "Supplement", "Ayurvedic", "General".
- "pricingUnit" (string): "strip", "box", or "tablet" — which unit MRP/rate refer to.
- "numBoxes" (number): Boxes or outer packs purchased. For liquids/devices use invoice qty. Default 1.
- "stripsPerBox" (number): Strips per box. Default 1 for non-strip products.
- "tabletsPerStrip" (number): Tablets/capsules per strip. Default 1 for bottles/liquids/devices.
- "confidence" (string): "high" if name, price, and pack are clear; "low" if any critical field was guessed or missing.

Common invoice layouts (OCR may mix columns):
- MARG ERP style: Qty | MFR | Product | PACK | Batch | Exp | HSN | MRP | Rate | Amount
- Sarda/Bhagirath style: Sr | HSN | MFG | Name | Pkg | Batch | Exp | MRP | Qty | Rate | Amount
- Vardhaman style: HSN | PRODUCT NAME | UNIT | COM | QTY | BATCH | EXP | M.R.P. | RATE

PACK / Pkg parsing rules:
- "10'S", "10S", "15 T", "10TA" → tabletsPerStrip=10, stripsPerBox=1, pricingUnit="strip"
- "1*10", "1x10", "1*20" → stripsPerBox=1, tabletsPerStrip from second number, pricingUnit="strip"
- "30*10", "50X10", "20X10", "30X10T" → stripsPerBox=first number, tabletsPerStrip=second, pricingUnit="box"
- "500ML", "250 ML", "30ML", "200M", "1 ML", "15ML" → numBoxes=qty, stripsPerBox=1, tabletsPerStrip=1, pricingUnit="box" (single bottle/unit)
- "1", "100X1" (syringe/set/device) → numBoxes=qty, stripsPerBox=1, tabletsPerStrip=1, pricingUnit="box"

Product type hints from name:
- TAB, CAP, DT → Tablet/Capsule with strip packaging
- SYP, SYRUP, LIQ, DROP, ML → Syrup/Drops, single-unit pricing
- CREAM, OINT, GEL, GM → Cream/Ointment, single tube
- INJ, I.V., VIAL → Injection
- DIAPER, SET, SYRN → General/Device

Rules:
- Extract ALL product rows. Do not skip any.
- CRITICAL: products array order MUST match invoice top-to-bottom order. Never sort alphabetically.
- dealerName = supplier at top (not the medical store buyer).
- Ignore totals, subtotals, tax/GST summary lines, invoice number, page numbers.
- rate = cost to retailer; mrp = printed MRP; sellingPrice = mrp when mrp > 0.
- qty column → numBoxes when it counts strips/boxes/bottles purchased.
- Numbers without currency symbols.
- Set confidence="low" when name, mrp/rate, or pack is unclear.
- Return ONLY valid JSON, no markdown.`;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_BASE_URL = (
  process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'
);
const GEMINI_MAX_OUTPUT_TOKENS = Math.min(
  32768,
  Math.max(8192, Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 16384)
);
const LOG_PREVIEW_CHARS = 1200;

const GEMINI_BASE_URL_NORMALIZED = GEMINI_BASE_URL.replace(/\/$/, '');

function logInvoiceAi(event: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log(`[invoice-ai] ${event}`, details);
  } else {
    console.log(`[invoice-ai] ${event}`);
  }
}

function previewText(text: string, max = LOG_PREVIEW_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… (${text.length} chars total)`;
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL;
const DEEPSEEK_IMAGE_MODEL = process.env.DEEPSEEK_IMAGE_MODEL;

console.log('DEEPSEEK_API_KEY', DEEPSEEK_API_KEY);
console.log('DEEPSEEK_MODEL', DEEPSEEK_MODEL);
console.log('DEEPSEEK_IMAGE_MODEL', DEEPSEEK_IMAGE_MODEL);
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(
  /\/$/,
  ''
);
const DEEPSEEK_MAX_OUTPUT_TOKENS = Math.min(
  8192,
  Math.max(4096, Number(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS) || 8192)
);

const STRIP_CATEGORIES = new Set(['Tablet', 'Capsule']);

function clampInt(n: number, min = 1): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.round(n));
}

/** Normalize expiry to MM/YY from various invoice formats. */
export function normalizeExpiryMmYy(raw: string): string {
  const s = raw.trim();
  if (!s) return '';

  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[1].slice(-2)}`;

  const sep = s.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
  if (sep) {
    const mm = sep[1].padStart(2, '0');
    const yy = sep[2].length === 4 ? sep[2].slice(-2) : sep[2];
    return `${mm}/${yy}`;
  }

  return s;
}

/** Parse PACK column strings into packaging fields. */
export function parsePackString(
  packRaw: string,
  qty: number
): Pick<ParsedInvoiceProduct, 'numBoxes' | 'stripsPerBox' | 'tabletsPerStrip' | 'pricingUnit'> & {
  guessed: boolean;
} {
  const raw = packRaw.trim().toUpperCase();
  if (!raw) {
    return {
      numBoxes: Math.max(1, qty || 1),
      stripsPerBox: 1,
      tabletsPerStrip: 1,
      pricingUnit: 'strip',
      guessed: true,
    };
  }

  if (/\d+\s*ML|\d+\s*M\b|ML\b|GM\b|G\b/i.test(raw) && !/\*|X/.test(raw)) {
    return {
      numBoxes: Math.max(1, qty || 1),
      stripsPerBox: 1,
      tabletsPerStrip: 1,
      pricingUnit: 'box',
      guessed: false,
    };
  }

  const star = raw.match(/^(\d+)\s*[*X]\s*(\d+)/);
  if (star) {
    const a = parseInt(star[1], 10);
    const b = parseInt(star[2], 10);
    if (a === 1) {
      return {
        numBoxes: Math.max(1, qty || 1),
        stripsPerBox: 1,
        tabletsPerStrip: clampInt(b),
        pricingUnit: 'strip',
        guessed: false,
      };
    }
    return {
      numBoxes: Math.max(1, qty || 1),
      stripsPerBox: clampInt(a),
      tabletsPerStrip: clampInt(b),
      pricingUnit: 'box',
      guessed: false,
    };
  }

  const stripOnly = raw.match(/^(\d+)\s*'?S?\s*T?A?$/i) || raw.match(/^(\d+)\s*T$/i);
  if (stripOnly) {
    return {
      numBoxes: Math.max(1, qty || 1),
      stripsPerBox: 1,
      tabletsPerStrip: clampInt(parseInt(stripOnly[1], 10)),
      pricingUnit: 'strip',
      guessed: false,
    };
  }

  if (raw === '1' || /^1\s*[*X]\s*1$/i.test(raw)) {
    return {
      numBoxes: Math.max(1, qty || 1),
      stripsPerBox: 1,
      tabletsPerStrip: 1,
      pricingUnit: 'box',
      guessed: false,
    };
  }

  const num = parseInt(raw.replace(/\D/g, ''), 10);
  if (num > 1 && num <= 200) {
    return {
      numBoxes: Math.max(1, qty || 1),
      stripsPerBox: 1,
      tabletsPerStrip: clampInt(num),
      pricingUnit: 'strip',
      guessed: true,
    };
  }

  return {
    numBoxes: Math.max(1, qty || 1),
    stripsPerBox: 1,
    tabletsPerStrip: 1,
    pricingUnit: 'box',
    guessed: true,
  };
}

function parsePricingUnit(val: unknown): PricingUnit {
  const s = String(val ?? '').toLowerCase();
  if (s === 'box' || s === 'tablet') return s;
  return 'strip';
}

function mapProduct(item: Record<string, unknown>): ParsedInvoiceProduct {
  const name = String(item.name ?? '').trim();
  const qty = Number(item.qty) || 0;
  const rate = Number(item.rate) || 0;
  const mrp = Number(item.mrp ?? item.MRP ?? 0) || 0;
  let sellingPrice = Number(item.sellingPrice ?? item.selling_price ?? 0) || 0;
  if (mrp > 0 && sellingPrice === 0) sellingPrice = mrp;

  const packRaw = String(item.packRaw ?? item.pack_raw ?? item.pack ?? item.PACK ?? '').trim();
  const expiry = normalizeExpiryMmYy(
    String(item.expiry ?? item.expiryDate ?? item.expiry_date ?? '').trim()
  );
  const category = String(item.category ?? 'General').trim() || 'General';

  let numBoxes = clampInt(Number(item.numBoxes ?? item.num_boxes ?? 0) || qty || 1);
  let stripsPerBox = clampInt(Number(item.stripsPerBox ?? item.strips_per_box ?? 0) || 1);
  let tabletsPerStrip = clampInt(
    Number(item.tabletsPerStrip ?? item.tablets_per_strip ?? item.packSize ?? item.pack_size ?? 0) ||
      1
  );
  let pricingUnit = parsePricingUnit(item.pricingUnit ?? item.pricing_unit);
  let confidence: ParseConfidence =
    String(item.confidence ?? '').toLowerCase() === 'low' ? 'low' : 'high';

  const hasStructuredPack =
    Number(item.stripsPerBox ?? item.strips_per_box) > 0 ||
    Number(item.tabletsPerStrip ?? item.tablets_per_strip) > 0;

  if (!hasStructuredPack && packRaw) {
    const parsed = parsePackString(packRaw, qty);
    numBoxes = parsed.numBoxes;
    stripsPerBox = parsed.stripsPerBox;
    tabletsPerStrip = parsed.tabletsPerStrip;
    pricingUnit = parsed.pricingUnit;
    if (parsed.guessed) confidence = 'low';
  }

  if (qty > 0 && numBoxes === 1 && qty > 1) {
    numBoxes = clampInt(qty);
  }

  if (!name) confidence = 'low';
  if (mrp <= 0 && rate <= 0) confidence = 'low';
  if (!packRaw && STRIP_CATEGORIES.has(category) && stripsPerBox === 1 && tabletsPerStrip === 1) {
    confidence = 'low';
  }

  return {
    name,
    qty,
    rate,
    mrp,
    sellingPrice,
    batchNo: String(item.batchNo ?? item.batch_no ?? item.batch ?? '').trim(),
    expiry,
    packSize: tabletsPerStrip,
    category,
    pricingUnit,
    numBoxes,
    stripsPerBox,
    tabletsPerStrip,
    confidence,
    packRaw,
  };
}

function normalizeParsedJson(parsed: unknown): ParsedInvoiceResult {
  if (parsed && !Array.isArray(parsed) && Array.isArray((parsed as { products?: unknown }).products)) {
    const obj = parsed as { dealerName?: unknown; dealer_name?: unknown; products: Record<string, unknown>[] };
    return {
      dealerName: String(obj.dealerName ?? obj.dealer_name ?? '').trim(),
      products: obj.products.map((item) => mapProduct(item)),
    };
  }

  if (Array.isArray(parsed)) {
    return {
      dealerName: '',
      products: parsed.map((item: Record<string, unknown>) => mapProduct(item)),
    };
  }

  throw new Error('Expected a JSON object with products array');
}

/** Pull complete product objects from truncated/malformed JSON. */
function extractCompleteProductObjects(jsonText: string): Record<string, unknown>[] {
  const products: Record<string, unknown>[] = [];
  const key = '"products"';
  const idx = jsonText.indexOf(key);
  if (idx < 0) return products;

  let i = jsonText.indexOf('[', idx);
  if (i < 0) return products;
  i++;

  while (i < jsonText.length) {
    while (i < jsonText.length && /[\s,]/.test(jsonText[i])) i++;
    if (jsonText[i] === ']') break;
    if (jsonText[i] !== '{') break;

    const start = i;
    let depth = 0;
    let inString = false;
    let escape = false;

    for (; i < jsonText.length; i++) {
      const c = jsonText[i];
      if (inString) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const chunk = jsonText.slice(start, i + 1);
          try {
            products.push(JSON.parse(chunk) as Record<string, unknown>);
          } catch {
            logInvoiceAi('salvage_skip_object', { chunkPreview: previewText(chunk, 200) });
          }
          i++;
          break;
        }
      }
    }
    if (depth !== 0) break;
  }

  return products;
}

function salvageTruncatedInvoiceJson(text: string): ParsedInvoiceResult | null {
  const dealerMatch = text.match(/"dealerName"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const dealerName = dealerMatch?.[1]?.replace(/\\"/g, '"') ?? '';
  const products = extractCompleteProductObjects(text);
  if (products.length === 0) return null;

  logInvoiceAi('salvage_recovered_products', { count: products.length, dealerName });
  return {
    dealerName,
    products: products.map((item) => mapProduct(item)),
  };
}

function parseJsonResult(raw: string, context = 'gemini'): ParsedInvoiceResult {
  const text = cleanModelOutput(raw);
  logInvoiceAi('parse_json_start', { context, length: text.length });

  try {
    const result = normalizeParsedJson(JSON.parse(text));
    logInvoiceAi('parse_json_ok', { context, productCount: result.products.length });
    return result;
  } catch (firstErr) {
    const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    logInvoiceAi('parse_json_failed', {
      context,
      error: errMsg,
      preview: previewText(text),
    });

    const salvaged = salvageTruncatedInvoiceJson(text);
    if (salvaged) return salvaged;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch && jsonMatch[0] !== text) {
      try {
        const result = normalizeParsedJson(JSON.parse(jsonMatch[0]));
        logInvoiceAi('parse_json_ok_extracted', { context, productCount: result.products.length });
        return result;
      } catch {
        // fall through
      }
    }

    throw new Error(`AI returned invalid JSON (${errMsg}). Try a clearer photo or fewer rows per scan.`);
  }
}

type GeminiResponse = {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string }[] };
  }[];
  error?: { message?: string };
};

function readGeminiResponse(data: GeminiResponse): { text: string; finishReason?: string } {
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? '').join('').trim();
  return { text, finishReason: candidate?.finishReason };
}

async function parseInvoiceWithGemini(ocrText: string): Promise<ParsedInvoiceResult> {
  if (!isGeminiConfigured()) throw new Error('AI_NOT_CONFIGURED');

  const url = `${GEMINI_BASE_URL_NORMALIZED}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  logInvoiceAi('gemini_ocr_request', { model: GEMINI_MODEL, ocrChars: ocrText.length });

  const started = Date.now();
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
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = (await res.json()) as GeminiResponse;
  logInvoiceAi('gemini_ocr_response', {
    status: res.status,
    ms: Date.now() - started,
    finishReason: data.candidates?.[0]?.finishReason,
  });

  if (!res.ok) {
    const msg = data.error?.message || res.statusText || 'Gemini request failed';
    throw new Error(`Gemini: ${msg}`);
  }

  const { text: content, finishReason } = readGeminiResponse(data);
  if (!content) throw new Error('Gemini returned empty response');
  if (finishReason === 'MAX_TOKENS') {
    logInvoiceAi('gemini_ocr_max_tokens', { responseChars: content.length });
  }

  return parseJsonResult(content, 'gemini-ocr');
}

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function isInvoiceImageParseSupported(): boolean {
  try {
    const provider = getInvoiceImageAiProvider();
    return provider === 'google' ? isGeminiConfigured() : isDeepSeekConfigured();
  } catch {
    return false;
  }
}

function normalizeImageMime(mimeType: string): string {
  const m = mimeType.toLowerCase().split(';')[0].trim();
  if (m === 'image/jpg') return 'image/jpeg';
  return m;
}

async function parseInvoiceWithGeminiImage(
  mimeType: string,
  dataBase64: string
): Promise<ParsedInvoiceResult> {
  if (!isGeminiConfigured()) throw new Error('AI_NOT_CONFIGURED');

  const normalizedMime = normalizeImageMime(mimeType);
  if (!ALLOWED_IMAGE_MIME.has(normalizedMime)) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }
  const geminiMime = normalizedMime === 'image/jpg' ? 'image/jpeg' : normalizedMime;

  const imageBytes = Math.round((dataBase64.length * 3) / 4);
  logInvoiceAi('gemini_image_request', {
    model: GEMINI_MODEL,
    mimeType: geminiMime,
    imageBytesApprox: imageBytes,
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
  });

  const url = `${GEMINI_BASE_URL_NORMALIZED}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const started = Date.now();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY!,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INVOICE_IMAGE_PARSE_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Extract all products from this invoice image.' },
            { inlineData: { mimeType: geminiMime, data: dataBase64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = (await res.json()) as GeminiResponse;
  logInvoiceAi('gemini_image_response', {
    status: res.status,
    ms: Date.now() - started,
    finishReason: data.candidates?.[0]?.finishReason,
  });

  if (!res.ok) {
    const msg = data.error?.message || res.statusText || 'Gemini request failed';
    logInvoiceAi('gemini_image_error', { message: msg });
    throw new Error(`Gemini: ${msg}`);
  }

  const { text: content, finishReason } = readGeminiResponse(data);
  if (!content) {
    logInvoiceAi('gemini_image_empty', { finishReason });
    throw new Error('Gemini returned empty response');
  }

  logInvoiceAi('gemini_image_content', {
    finishReason,
    responseChars: content.length,
    preview: previewText(content),
  });

  if (finishReason === 'MAX_TOKENS') {
    logInvoiceAi('gemini_image_max_tokens', {
      hint: 'Response truncated; salvaging complete product rows if possible',
    });
  }

  const result = parseJsonResult(content, 'gemini-image');
  if (finishReason === 'MAX_TOKENS' && result.products.length > 0) {
    logInvoiceAi('gemini_image_partial_ok', { productCount: result.products.length });
  }
  return result;
}

async function parseInvoiceWithDeepSeek(ocrText: string): Promise<ParsedInvoiceResult> {
  if (!isDeepSeekConfigured()) throw new Error('AI_NOT_CONFIGURED');

  logInvoiceAi('deepseek_ocr_request', { model: DEEPSEEK_MODEL, ocrChars: ocrText.length });
  const started = Date.now();

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
      max_tokens: DEEPSEEK_MAX_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await res.json();
  logInvoiceAi('deepseek_ocr_response', {
    status: res.status,
    ms: Date.now() - started,
    finishReason: data.choices?.[0]?.finish_reason,
  });

  if (!res.ok) {
    const msg = data.error?.message || res.statusText || 'DeepSeek request failed';
    throw new Error(`DeepSeek: ${msg}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error('DeepSeek returned empty response');

  return parseJsonResult(content, 'deepseek-ocr');
}

async function parseInvoiceWithDeepSeekImage(
  mimeType: string,
  dataBase64: string
): Promise<ParsedInvoiceResult> {
  if (!isDeepSeekConfigured()) throw new Error('AI_NOT_CONFIGURED');

  const normalizedMime = normalizeImageMime(mimeType);
  if (!ALLOWED_IMAGE_MIME.has(normalizedMime)) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }
  const imageDataUrl = `data:${normalizedMime};base64,${dataBase64}`;

  logInvoiceAi('deepseek_image_start', {
    model: DEEPSEEK_IMAGE_MODEL,
    mimeType: normalizedMime,
    imageBytesApprox: Math.round((dataBase64.length * 3) / 4),
    note: 'Sending image directly to DeepSeek API (no OCR fallback)',
  });

  const started = Date.now();
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_IMAGE_MODEL,
      messages: [
        { role: 'system', content: INVOICE_IMAGE_PARSE_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all products from this invoice image.' },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      stream: false,
      temperature: 0.1,
      max_tokens: DEEPSEEK_MAX_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await res.json();
  logInvoiceAi('deepseek_image_response', {
    status: res.status,
    ms: Date.now() - started,
    finishReason: data.choices?.[0]?.finish_reason,
  });

  if (!res.ok) {
    const msg = data.error?.message || res.statusText || 'DeepSeek request failed';
    throw new Error(`DeepSeek image API: ${msg}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error('DeepSeek returned empty image response');
  return parseJsonResult(content, 'deepseek-image');
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

export async function parseInvoiceImage(
  mimeType: string,
  imageBuffer: Buffer
): Promise<ParsedInvoiceResult> {
  const provider = getInvoiceImageAiProvider();
  logInvoiceAi('parse_invoice_image_start', { provider, mimeType, imageBytes: imageBuffer.length });

  const dataBase64 = imageBuffer.toString('base64');
  const result =
    provider === 'google'
      ? await parseInvoiceWithGeminiImage(mimeType, dataBase64)
      : await parseInvoiceWithDeepSeekImage(mimeType, dataBase64);

  logInvoiceAi('parse_invoice_image_done', {
    provider,
    dealerName: result.dealerName,
    productCount: result.products.length,
  });
  return result;
}
