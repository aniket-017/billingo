import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Toast from '../components/Toast';

type Customer = { id: string; name: string; phone: string; email: string; address: string };

export default function Customers() {
  const [list, setList] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.customers.list(q || undefined);
      setList(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [q]);

  const openAdd = () => {
    setForm({ name: '', phone: '', email: '', address: '' });
    setEditing(null);
    setModal('add');
  };

  const openEdit = (c: Customer) => {
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '' });
    setEditing(c);
    setModal('edit');
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      setToast({ message: 'Name is required', type: 'error' });
      return;
    }
    try {
      if (editing) {
        await api.customers.update(editing.id, form);
        setToast({ message: 'Customer updated', type: 'success' });
      } else {
        await api.customers.create(form);
        setToast({ message: 'Customer added', type: 'success' });
      }
      setModal(null);
      load();
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    }
  };

  const deleteCustomer = async (id: string) => {
    if (!confirm('Delete this customer?')) return;
    try {
      await api.customers.delete(id);
      setToast({ message: 'Customer deleted', type: 'success' });
      load();
    } catch (e) {
      setToast({ message: (e as Error).message, type: 'error' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Customers</h2>
        <button type="button" onClick={openAdd} className="btn-primary px-4 py-2">
          Add customer
        </button>
      </div>

      <div className="card">
        <input
          type="search"
          placeholder="Search by name..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input mb-4 max-w-md"
        />
        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>
                      <button type="button" onClick={() => openEdit(c)} className="btn-ghost text-sm">
                        Edit
                      </button>
                      <button type="button" onClick={() => deleteCustomer(c.id)} className="btn-ghost text-red-600 text-sm">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.length === 0 && !loading && <p className="mt-4 text-slate-500">No customers. Add one to get started.</p>}
      </div>

      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="card w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold">{editing ? 'Edit customer' : 'Add customer'}</h3>
            <div className="space-y-3">
              <input
                className="input"
                placeholder="Name *"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={save} className="btn-primary">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
