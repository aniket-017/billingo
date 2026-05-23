import { useBusinessDisplayName } from '../contexts/BusinessSettingsContext';

interface LayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export default function Layout({ sidebar, children }: LayoutProps) {
  const { displayName } = useBusinessDisplayName();

  return (
    <div className="flex h-screen overflow-hidden flex-col md:flex-row">
      <aside className="no-print flex w-full shrink-0 flex-col border-b border-slate-200 bg-white shadow-soft md:h-full md:w-56 md:border-b-0 md:border-r">
        <div className="flex h-full flex-col py-4">
          <h1 className="shrink-0 px-4 text-lg font-bold text-primary-700">{displayName}</h1>
          <div className="flex min-h-0 flex-1 flex-col">{sidebar}</div>
        </div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">{children}</main>
    </div>
  );
}
