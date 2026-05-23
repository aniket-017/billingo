/** Normalize to 10-digit Indian mobile, or null if empty/invalid. */
export function normalizeCustomerPhone(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  let ten: string;
  if (digits.length === 10) {
    ten = digits;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    ten = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    ten = digits.slice(1);
  } else {
    return null;
  }

  return /^\d{10}$/.test(ten) ? ten : null;
}

export function parseCustomerPhoneInput(
  raw: string | undefined | null
): { ok: true; phone: string } | { ok: false; error: string } {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    return { ok: true, phone: '' };
  }
  const normalized = normalizeCustomerPhone(trimmed);
  if (!normalized) {
    return { ok: false, error: 'Phone must be a 10-digit mobile number' };
  }
  return { ok: true, phone: normalized };
}
