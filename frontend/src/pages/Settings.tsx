import { useEffect, useState } from 'react';
import { useBusinessSettings } from '../contexts/BusinessSettingsContext';
import Toast from '../components/Toast';

export default function Settings() {
  const { settings, update } = useBusinessSettings();
  const [form, setForm] = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setForm({ ...settings });
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      await update({
        businessName: form.businessName.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        taxId: form.taxId.trim(),
      });
      setToast({ message: 'Business details saved', type: 'success' });
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Settings</h2>
        <p className="mt-1 text-sm text-slate-600">
          Add your store or business details. These appear in the sidebar, on invoices, and on printed bills.
        </p>
      </div>

      <div className="card max-w-xl space-y-4 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Business name</label>
          <input
            type="text"
            value={form.businessName}
            onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="e.g. ABC Retail Store"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
          <textarea
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            rows={3}
            className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Street, city, state (one line per row)"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
          <input
            type="text"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="+91 9876543210"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="contact@yourbusiness.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tax ID / GSTIN (optional)</label>
          <input
            type="text"
            value={form.taxId}
            onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="GSTIN or tax registration number"
          />
        </div>
        <button type="button" onClick={save} disabled={saving} className="btn-primary px-4 py-2 disabled:opacity-60">
          {saving ? 'Saving...' : 'Save details'}
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
