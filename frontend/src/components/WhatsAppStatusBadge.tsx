import type { WhatsAppDeliveryStatus } from '../api/client';

const LABELS: Record<WhatsAppDeliveryStatus, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
};

const STYLES: Record<WhatsAppDeliveryStatus, string> = {
  sent: 'bg-sky-100 text-sky-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  read: 'bg-indigo-100 text-indigo-800',
  failed: 'bg-red-100 text-red-800',
};

export default function WhatsAppStatusBadge({
  status,
}: {
  status?: WhatsAppDeliveryStatus | null;
}) {
  if (!status) return <span className="text-slate-400">—</span>;

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
      title={`WhatsApp: ${LABELS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
