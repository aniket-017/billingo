import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { useBusinessDisplayName } from '../contexts/BusinessSettingsContext';

export default function AdminLogin() {
  const { displayName } = useBusinessDisplayName();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user: u } = await api.admin.login(email, password);
      login(token, { id: u.id, email: u.email, name: u.name || '', role: 'admin' });
      navigate('/admin/login'); // stay on admin page to show create-user form
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-lg md:p-8">
        <div className="mb-6 flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary-700">Admin</h1>
            <p className="text-sm text-slate-600">{displayName}</p>
          </div>
          <p className="text-xs text-slate-500">Only trusted staff should have admin access.</p>
        </div>

        {!user || user.role !== 'admin' ? (
          <>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Admin sign in
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-primary-600 px-4 py-2.5 font-medium text-white shadow-soft transition hover:bg-primary-700 disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Admin sign in'}
              </button>
            </form>
          </>
        ) : (
          <AdminCreateUser />
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/login" className="text-primary-600 hover:underline">Back to store login</Link>
        </p>
      </div>
    </div>
  );
}

function AdminCreateUser() {
  const { logout } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<{ _id: string; name: string; email: string; role: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const data = await api.admin.listUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      await api.admin.createUser(name, email, password, role);
      setMessage({ type: 'success', text: `User ${name} (${email}) created. They can now sign in at the store login.` });
      setName('');
      setEmail('');
      setPassword('');
      await loadUsers();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create user' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)] md:items-start">
        <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-1 text-sm font-medium text-slate-700">Create user login</p>
          <p className="mb-2 text-xs text-slate-500">
            Create store logins for staff. Share only with trusted people.
          </p>
          {message && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
              }`}
            >
              {message.text}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm text-slate-600">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="User name"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="user@example.com"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
              className="w-full rounded-xl border border-slate-300 px-4 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="user">User (store login)</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary-600 px-4 py-2.5 font-medium text-white shadow-soft transition hover:bg-primary-700 disabled:opacity-60"
          >
            {loading ? 'Creating...' : 'Create user'}
          </button>
        </form>

        <div className="mt-2 md:mt-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Existing users</p>
            {usersLoading && <span className="text-xs text-slate-500">Loading…</span>}
          </div>
          {users.length === 0 ? (
            <p className="text-xs text-slate-500">No users yet.</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {users.map((u) => (
                <UserRow key={u._id} user={u} onChanged={loadUsers} />
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => logout()}
        className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Log out
      </button>
    </div>
  );
}

interface UserRowProps {
  user: { _id: string; name: string; email: string; role: string };
  onChanged: () => void;
}

function UserRow({ user, onChanged }: UserRowProps) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<'user' | 'admin'>(user.role === 'admin' ? 'admin' : 'user');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await api.admin.updateUser(user._id, { name, email, role });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    setDeleting(true);
    setError('');
    try {
      await api.admin.deleteUser(user._id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg bg-white p-3 shadow-sm">
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-[1.2fr,1.6fr,0.9fr] sm:items-center">
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-slate-500">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-slate-500">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-slate-500">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2 text-xs">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || deleting}
          className="rounded-md bg-primary-600 px-3 py-1 font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving || deleting}
          className="rounded-md border border-red-300 px-3 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
