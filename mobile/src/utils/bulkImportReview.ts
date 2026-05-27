import type { ParsedInvoiceConfidence } from '@/src/api/client';
import { isValidExpiryMmYy } from '@/src/utils/expiry';

export type PricingUnit = 'strip' | 'box' | 'tablet';

export type BulkImportRow = {
  key: string;
  name: string;
  qty: number;
  rate: number;
  mrp: number;
  sellingPrice: number;
  batchNo: string;
  expiry: string;
  packSize: number;
  category: string;
  numBoxes: number;
  stripsPerBox: number;
  tabletsPerStrip: number;
  pricingUnit: PricingUnit;
  confidence: ParsedInvoiceConfidence;
  packRaw?: string;
};

const STRIP_CATEGORIES = new Set(['Tablet', 'Capsule']);

export function getRowReviewIssues(row: BulkImportRow, allRows: BulkImportRow[]): string[] {
  const issues: string[] = [];

  if (!row.name.trim()) issues.push('Missing name');
  if (row.mrp <= 0 && row.rate <= 0) issues.push('Missing price');
  if (row.confidence === 'low') issues.push('Needs verification');
  if (row.expiry.trim() && !isValidExpiryMmYy(row.expiry)) issues.push('Invalid expiry');
  if (row.sellingPrice > 0 && row.mrp > 0 && row.sellingPrice > row.mrp) {
    issues.push('Sell above MRP');
  }

  const isStripProduct = STRIP_CATEGORIES.has(row.category);
  const allOnes =
    row.numBoxes <= 1 && row.stripsPerBox <= 1 && row.tabletsPerStrip <= 1 && row.packSize <= 1;
  if (isStripProduct && allOnes && !row.packRaw?.trim()) {
    issues.push('Check packaging');
  }

  const dup = allRows.filter(
    (r) => r.key !== row.key && r.name.trim().toLowerCase() === row.name.trim().toLowerCase()
  );
  if (row.name.trim() && dup.length > 0) issues.push('Duplicate name');

  return issues;
}

export function rowNeedsReview(row: BulkImportRow, allRows: BulkImportRow[]): boolean {
  return getRowReviewIssues(row, allRows).length > 0;
}

export function countReviewStats(rows: BulkImportRow[]): { ready: number; needsReview: number } {
  let needsReview = 0;
  for (const row of rows) {
    if (rowNeedsReview(row, rows)) needsReview++;
  }
  return { ready: rows.length - needsReview, needsReview };
}

export function packSummary(row: BulkImportRow): string {
  const b = Math.max(1, row.numBoxes);
  const s = Math.max(1, row.stripsPerBox);
  const t = Math.max(1, row.tabletsPerStrip);
  if (b === 1 && s === 1 && t === 1) return '1 unit';
  if (s === 1 && t === 1) return `${b} box`;
  if (t === 1) return `${b} box × ${s} strip`;
  return `${b} box × ${s} strip × ${t} tab`;
}
