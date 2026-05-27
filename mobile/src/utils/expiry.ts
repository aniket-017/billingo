/** Normalize user/OCR input to MM/YY display format. */
export function formatExpiryDisplay(val?: string | null): string {
  if (!val) return '';
  const s = val.trim();

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

/** True if value is valid MM/YY (month 01–12). */
export function isValidExpiryMmYy(val: string): boolean {
  const s = formatExpiryDisplay(val);
  const m = s.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = parseInt(m[1], 10);
  return month >= 1 && month <= 12;
}

/** Format partial input as user types (auto-insert / after month). */
export function formatExpiryInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Convert MM/YY to ISO date (first of month) for API. */
export function parseExpiryToIso(val: string): string | null {
  const s = formatExpiryDisplay(val);
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  if (month < 1 || month > 12) return null;
  const yyyy = `20${m[2]}`;
  return `${yyyy}-${m[1]}-01`;
}
