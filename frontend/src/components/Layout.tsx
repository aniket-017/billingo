import { useBusinessDisplayName } from '../contexts/BusinessSettingsContext';

interface LayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export default function Layout({ sidebar, children }: LayoutProps) {
  const { displayName } = useBusinessDisplayName();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="no-print flex w-full shrink-0 flex-col border-b border-slate-200 bg-white shadow-soft md:w-56 md:border-b-0 md:border-r">
        <div className="flex min-h-full flex-col py-4 md:sticky md:top-0">
          <h1 className="px-4 text-lg font-bold text-primary-700">{displayName}</h1>
          {sidebar}
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-8">{children}</main>
    </div>
  );
}
