export function normalizeCustomerPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  let ten: string;
  if (digits.length === 10) ten = digits;
  else if (digits.length === 12 && digits.startsWith('91')) ten = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) ten = digits.slice(1);
  else return null;

  return /^\d{10}$/.test(ten) ? ten : null;
}

export function validateCustomerPhoneInput(
  raw: string
): { ok: true; phone: string } | { ok: false; message: string } {
  if (!raw.trim()) {
    return { ok: true, phone: '' };
  }
  const normalized = normalizeCustomerPhone(raw);
  if (!normalized) {
    return { ok: false, message: 'Phone must be a 10-digit mobile number' };
  }
  return { ok: true, phone: normalized };
}
