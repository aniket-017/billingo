type LogLevel = 'info' | 'warn' | 'error';

function logWhatsApp(level: LogLevel, event: string, details?: Record<string, unknown>): void {
  const prefix = `[whatsapp] ${event}`;
  if (details && Object.keys(details).length > 0) {
    console[level](prefix, details);
  } else {
    console[level](prefix);
  }
}

export function logWhatsAppInfo(event: string, details?: Record<string, unknown>): void {
  logWhatsApp('info', event, details);
}

export function logWhatsAppWarn(event: string, details?: Record<string, unknown>): void {
  logWhatsApp('warn', event, details);
}

export function logWhatsAppError(event: string, details?: Record<string, unknown>): void {
  logWhatsApp('error', event, details);
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

export function truncateUrl(url: string, max = 80): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max)}…`;
}

export function parseMetaApiError(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { error?: Record<string, unknown> };
    if (parsed.error) return parsed.error;
    return parsed as Record<string, unknown>;
  } catch {
    return { raw };
  }
}

export type MetaWebhookError = {
  code?: number;
  title?: string;
  message?: string;
  error_data?: Record<string, unknown>;
};

export function summarizeWebhookErrors(errors?: MetaWebhookError[]): Record<string, unknown> | undefined {
  if (!errors?.length) return undefined;
  return {
    count: errors.length,
    errors: errors.map((e) => ({
      code: e.code,
      title: e.title,
      message: e.message,
      details: e.error_data?.details ?? e.error_data,
    })),
  };
}

/** Grep-friendly single-line callback log: search backend logs for the messageId. */
export function logWhatsAppCallback(
  messageId: string,
  status: string,
  extra?: Record<string, unknown>
): void {
  const suffix = extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[whatsapp] webhook_callback messageId=${messageId} status=${status}${suffix}`);
}

