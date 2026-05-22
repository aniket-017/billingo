import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, type AppUser, type Business } from '../api/client';
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
      login(token, {
        id: u.id,
        email: u.email,
        name: u.name || '',
        role: 'platform_admin',
      });
      navigate('/admin/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-lg md:p-8">
        <div className="mb-6 flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary-700">Platform Admin</h1>
            <p className="text-sm text-slate-600">{displayName}</p>
          </div>
          <p className="text-xs text-slate-500">Create businesses and store logins for each tenant.</p>
        </div>

        {!user || user.role !== 'platform_admin' ? (
          <>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Admin sign in
            </h2>
            <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4">
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
          <PlatformAdminPanel />
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/login" className="text-primary-600 hover:underline">
            Back to store login
          </Link>
        </p>
      </div>
    </div>
  );
}

function PlatformAdminPanel() {
  const { logout } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [bizName, setBizName] = useState('');
  const [bizSlug, setBizSlug] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadBusinesses() {
    try {
      const data = await api.platform.listBusinesses();
      setBusinesses(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadBusinesses();
  }, []);

  async function handleCreateBusiness(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const b = await api.platform.createBusiness(bizName, bizSlug);
      setMessage({ type: 'success', text: `Business "${b.name}" created.` });
      setBizName('');
      setBizSlug('');
      await loadBusinesses();
      setSelectedId(b.id);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create business' });
    } finally {
      setLoading(false);
    }
  }

  const selected = businesses.find((b) => b.id === selectedId);

  return (
    <div className="space-y-8">
      <form onSubmit={handleCreateBusiness} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Create business</h3>
        {message && (
          <div
            className={`mb-3 rounded-lg px-3 py-2 text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-slate-600">Business name</label>
            <input
              type="text"
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-600">Slug (URL-safe)</label>
            <input
              type="text"
              value={bizSlug}
              onChange={(e) => setBizSlug(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2"
              placeholder="acme-books"
              required
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {loading ? 'Creating...' : 'Create business'}
        </button>
      </form>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Businesses</h3>
          {businesses.length === 0 ? (
            <p className="text-sm text-slate-500">No businesses yet.</p>
          ) : (
            <ul className="space-y-2">
              {businesses.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(b.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      selectedId === b.id
                        ? 'bg-primary-100 font-medium text-primary-800'
                        : 'bg-white hover:bg-slate-100'
                    }`}
                  >
                    <span className="block">{b.name}</span>
                    <span className="text-xs text-slate-500">
                      {b.slug} · {b.userCount ?? 0} users
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected ? (
          <BusinessUsersPanel business={selected} key={selected.id} />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            Select a business to manage store users.
          </div>
        )}
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

function BusinessUsersPanel({ business }: { business: Business }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'business_admin'>('user');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function loadUsers() {
    try {
      const data = await api.platform.listBusinessUsers(business.id);
      setUsers(data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [business.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      await api.platform.createBusinessUser(business.id, { name, email, password, role });
      setMessage({
        type: 'success',
        text: `User ${email} can sign in at the store login.`,
      });
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
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">{business.name}</h3>
        <p className="text-xs text-slate-500">Schema: {business.schemaName}</p>
      </div>

      <form onSubmit={handleCreate} className="space-y-3">
        <p className="text-sm font-medium text-slate-700">Add store user</p>
        {message && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'user' | 'business_admin')}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="user">Store user</option>
          <option value="business_admin">Business admin</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {loading ? 'Creating...' : 'Create user'}
        </button>
      </form>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Users</p>
        {users.length === 0 ? (
          <p className="text-xs text-slate-500">No users for this business.</p>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id} className="rounded-lg bg-white px-3 py-2 text-sm">
                <span className="font-medium">{u.name || u.email}</span>
                <span className="block text-xs text-slate-500">
                  {u.email} · {u.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
