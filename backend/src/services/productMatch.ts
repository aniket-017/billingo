/** Name-only product matching for invoice import (no user barcode). */

export const MATCH_AUTO_MIN = 92;
export const MATCH_REVIEW_MIN = 75;

const NOISE_WORDS = new Set([
  'TAB',
  'TABS',
  'TABLET',
  'TABLETS',
  'CAP',
  'CAPS',
  'CAPSULE',
  'CAPSULES',
  'SYRUP',
  'SUSP',
  'SUSPENSION',
  'INJ',
  'INJECTION',
  'DROPS',
  'CREAM',
  'OINT',
  'OINTMENT',
  'GEL',
  'LOTION',
  'POWDER',
  'SACHET',
  'STRIP',
  'STRIPS',
  'STP',
  'BOX',
  'PCS',
  'PC',
  'UNIT',
  'UNITS',
  'ML',
  'MG',
  'GM',
  'G',
]);

const PACK_TAIL_RE =
  /\s+\d+\s*['']?S\b|\s+\d+\s*[xX*]\s*\d+(?:\s*[xX*]\s*\d+)?\s*$/gi;

export type NormalizedName = {
  normalizedKey: string;
  tokens: string[];
  strengths: string[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  nameNormalized: string;
};

export type MatchCandidate = {
  id: string;
  name: string;
  score: number;
};

export type MatchStatus = 'auto' | 'review' | 'new';

export type MatchPreviewItem = {
  invoiceName: string;
  status: MatchStatus;
  productId?: string;
  productName?: string;
  score?: number;
  candidates?: MatchCandidate[];
};

export function normalizeProductName(raw: string): NormalizedName {
  let text = raw.trim().toUpperCase();
  const strengths = extractStrengths(text);

  text = text.replace(PACK_TAIL_RE, '');
  text = text.replace(/[^A-Z0-9]+/g, ' ');
  const parts = text.split(/\s+/).filter(Boolean);

  const tokens: string[] = [];
  for (const part of parts) {
    if (NOISE_WORDS.has(part)) continue;
    if (/^\d+$/.test(part) || /^\d+(?:\.\d+)?(?:MG|ML|GM|G)?$/i.test(part)) {
      tokens.push(part.replace(/\s+/g, ''));
      continue;
    }
    tokens.push(part);
  }

  const normalizedKey = tokens.join('');
  return { normalizedKey, tokens, strengths };
}

function extractStrengths(text: string): string[] {
  const found = new Set<string>();
  const re = /\b(\d+(?:\.\d+)?)\s*(MG|ML|GM|G)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const num = m[1];
    const unit = (m[2] || '').toUpperCase();
    if (num.length >= 2 || unit) {
      found.add(unit ? `${num}${unit}` : num);
    }
  }
  return [...found];
}

function strengthsCompatible(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  const setA = new Set(a.map((s) => s.replace(/\s+/g, '').toUpperCase()));
  for (const s of b) {
    if (setA.has(s.replace(/\s+/g, '').toUpperCase())) return true;
  }
  return false;
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dist[i][0] = i;
  for (let j = 0; j < cols; j++) dist[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost
      );
    }
  }
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist[rows - 1][cols - 1] / maxLen;
}

function tokenJaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function scoreNamePair(invoice: NormalizedName, catalog: NormalizedName): number {
  if (!invoice.normalizedKey || !catalog.normalizedKey) return 0;
  if (invoice.normalizedKey === catalog.normalizedKey) return 95;

  if (!strengthsCompatible(invoice.strengths, catalog.strengths)) return 0;

  const jaccard = tokenJaccard(invoice.tokens, catalog.tokens);
  const lev = levenshteinRatio(invoice.normalizedKey, catalog.normalizedKey);
  let score = Math.round(jaccard * 70 + lev * 30);

  if (invoice.strengths.length > 0 && catalog.strengths.length > 0) {
    score = Math.min(100, score + 5);
  }

  return Math.max(0, Math.min(100, score));
}

export function scoreCandidates(
  invoiceName: string,
  catalog: CatalogProduct[],
  limit = 3
): MatchCandidate[] {
  const invoice = normalizeProductName(invoiceName);
  const scored: MatchCandidate[] = [];

  for (const p of catalog) {
    const catalogNorm = normalizeProductName(p.name);
    if (p.nameNormalized) {
      catalogNorm.normalizedKey = p.nameNormalized;
    }

    const score = scoreNamePair(invoice, catalogNorm);
    if (score > 0) {
      scored.push({ id: p.id, name: p.name, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function classifyMatchScore(score: number): MatchStatus {
  if (score >= MATCH_AUTO_MIN) return 'auto';
  if (score >= MATCH_REVIEW_MIN) return 'review';
  return 'new';
}

export function previewMatch(
  invoiceName: string,
  catalog: CatalogProduct[]
): MatchPreviewItem {
  const trimmed = invoiceName.trim();
  if (!trimmed) {
    return { invoiceName: trimmed, status: 'new' };
  }

  const invoiceNorm = normalizeProductName(trimmed);
  const exact = catalog.find((p) => {
    const key = p.nameNormalized || normalizeProductName(p.name).normalizedKey;
    return key === invoiceNorm.normalizedKey && invoiceNorm.normalizedKey.length > 0;
  });
  if (exact) {
    return {
      invoiceName: trimmed,
      status: 'auto',
      productId: exact.id,
      productName: exact.name,
      score: 95,
    };
  }

  const candidates = scoreCandidates(trimmed, catalog);
  const top = candidates[0];
  if (!top) {
    return { invoiceName: trimmed, status: 'new', candidates: [] };
  }

  const status = classifyMatchScore(top.score);
  return {
    invoiceName: trimmed,
    status,
    productId: status === 'auto' ? top.id : undefined,
    productName: status === 'auto' ? top.name : undefined,
    score: top.score,
    candidates: status === 'review' ? candidates : candidates.slice(0, 3),
  };
}

export function previewMatches(
  names: string[],
  catalog: CatalogProduct[]
): MatchPreviewItem[] {
  return names.map((name) => previewMatch(name, catalog));
}

/** Validate client-chosen stock_in against catalog. */
export function validateStockInMatch(
  invoiceName: string,
  productId: string,
  catalog: CatalogProduct[]
): { ok: boolean; reason?: string } {
  const product = catalog.find((p) => p.id === productId);
  if (!product) return { ok: false, reason: 'Product not found' };

  const candidates = scoreCandidates(invoiceName, catalog, 10);
  const picked = candidates.find((c) => c.id === productId);
  if (picked && picked.score >= MATCH_REVIEW_MIN) return { ok: true };

  return { ok: false, reason: 'Name does not match selected product' };
}
