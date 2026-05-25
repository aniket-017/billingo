export type ProductNameAiProvider = 'google' | 'deepseek';

export const PRODUCT_NAME_SYSTEM_PROMPT = `You extract the product name from noisy OCR text of Indian retail product labels.
Return ONLY the product name as plain text — no quotes, markdown, or explanation.
Exclude: MRP, price, batch/lot, expiry, barcode numbers, net weight, legal boilerplate, and manufacturer address.
If both a brand and a specific product title appear, prefer the full product title (e.g. "Class 8 Mathematics" not just the publisher brand).
Support English and Hindi/Devanagari. If no clear product name exists, return the shortest meaningful descriptive phrase from the label.`;

export function getProductNameAiProvider(): ProductNameAiProvider {
  const raw = (process.env.PRODUCT_NAME_AI_PROVIDER || 'google').trim().toLowerCase();
  if (raw === 'google' || raw === 'gemini') return 'google';
  if (raw === 'deepseek') return 'deepseek';
  throw new Error(
    `Invalid PRODUCT_NAME_AI_PROVIDER "${process.env.PRODUCT_NAME_AI_PROVIDER}". Use "google" or "deepseek".`
  );
}

export function cleanModelOutput(raw: string): string {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}
