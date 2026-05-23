export const CHART_COLORS = {
  primary: '#0284c7',
  primaryLight: '#38bdf8',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  violet: '#8b5cf6',
  slate: '#94a3b8',
  slateLight: '#e2e8f0',
};

export const PIE_COLORS = [CHART_COLORS.primary, CHART_COLORS.amber, CHART_COLORS.emerald, CHART_COLORS.violet, CHART_COLORS.rose];

export function formatRupee(value: number, compact = false) {
  if (compact && Math.abs(value) >= 1000) {
    return `₹${(value / 1000).toFixed(1)}k`;
  }
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDayLabel(day: string) {
  const d = new Date(day + 'T12:00:00');
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
