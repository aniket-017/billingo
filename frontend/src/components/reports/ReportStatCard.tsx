type ReportStatCardProps = {
  label: string;
  value: string;
  hint?: string;
  accent?: 'primary' | 'emerald' | 'amber' | 'rose' | 'slate' | 'violet';
  icon?: React.ReactNode;
};

const accentStyles = {
  primary: 'from-primary-500/10 to-primary-600/5 text-primary-700 ring-primary-500/20',
  emerald: 'from-emerald-500/10 to-emerald-600/5 text-emerald-700 ring-emerald-500/20',
  amber: 'from-amber-500/10 to-amber-600/5 text-amber-700 ring-amber-500/20',
  rose: 'from-rose-500/10 to-rose-600/5 text-rose-700 ring-rose-500/20',
  slate: 'from-slate-500/10 to-slate-600/5 text-slate-700 ring-slate-500/20',
  violet: 'from-violet-500/10 to-violet-600/5 text-violet-700 ring-violet-500/20',
};

const iconBg = {
  primary: 'bg-primary-100 text-primary-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  rose: 'bg-rose-100 text-rose-600',
  slate: 'bg-slate-100 text-slate-600',
  violet: 'bg-violet-100 text-violet-600',
};

export default function ReportStatCard({
  label,
  value,
  hint,
  accent = 'slate',
  icon,
}: ReportStatCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 ring-1 ring-inset ${accentStyles[accent]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        {icon ? (
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg[accent]}`}>
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}
