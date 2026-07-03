import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createBusiness,
  deleteBusiness,
  listBusinesses,
  type BusinessListResponse,
} from '../api/businesses';
import { ApiError } from '../api/client';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { BUSINESS_STATUSES, type BusinessStatus } from '../types/business';

interface Filters {
  q: string;
  status: BusinessStatus | '';
  industry: string;
  country: string;
}

const EMPTY_FILTERS: Filters = { q: '', status: '', industry: '', country: '' };

export function BusinessListPage() {
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState('-createdAt');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<BusinessListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Debounce free-text search into the applied filters.
  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((current) => ({ ...current, q: searchInput }));
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await listBusinesses({ ...filters, sort, page, limit: 25 }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load businesses');
    } finally {
      setLoading(false);
    }
  }, [filters, sort, page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function toggleSort(field: 'name' | 'createdAt' | 'status') {
    setSort((current) => (current === field ? `-${field}` : field));
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteBusiness(id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    }
  }

  return (
    <div>
      <header className="content-header">
        <h2>Businesses</h2>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate((s) => !s)}>
          {showCreate ? 'Close' : '+ Add business'}
        </button>
      </header>

      {showCreate && (
        <CreateBusinessForm
          onCreated={() => {
            setShowCreate(false);
            void refresh();
          }}
        />
      )}

      <div className="toolbar">
        <input
          className="input"
          type="search"
          placeholder="Search name, domain, email, city…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className="input"
          value={filters.status}
          onChange={(e) => updateFilter('status', e.target.value as BusinessStatus | '')}
        >
          <option value="">All statuses</option>
          {BUSINESS_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Industry"
          value={filters.industry}
          onChange={(e) => updateFilter('industry', e.target.value)}
        />
        <input
          className="input"
          placeholder="Country"
          value={filters.country}
          onChange={(e) => updateFilter('country', e.target.value)}
        />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th className="th-sortable" onClick={() => toggleSort('name')}>
                Name {sort === 'name' ? '▲' : sort === '-name' ? '▼' : ''}
              </th>
              <th>Domain</th>
              <th>Email</th>
              <th className="th-sortable" onClick={() => toggleSort('status')}>
                Status {sort === 'status' ? '▲' : sort === '-status' ? '▼' : ''}
              </th>
              <th>Industry</th>
              <th>Country</th>
              <th className="th-sortable" onClick={() => toggleSort('createdAt')}>
                Created {sort === 'createdAt' ? '▲' : sort === '-createdAt' ? '▼' : ''}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="table-empty">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && result?.data.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty">
                  No businesses found. Add one or import a CSV.
                </td>
              </tr>
            )}
            {!loading &&
              result?.data.map((business) => (
                <tr key={business.id}>
                  <td>
                    <Link className="row-link" to={`/businesses/${business.id}`}>
                      {business.name}
                    </Link>
                  </td>
                  <td className="text-muted">{business.domain ?? '—'}</td>
                  <td className="text-muted">{business.email ?? '—'}</td>
                  <td>
                    <StatusBadge status={business.status} />
                  </td>
                  <td className="text-muted">{business.industry ?? '—'}</td>
                  <td className="text-muted">{business.country ?? '—'}</td>
                  <td className="text-muted">
                    {new Date(business.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-small"
                      onClick={() => void handleDelete(business.id, business.name)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {result && result.pagination.totalPages > 1 && (
        <Pagination pagination={result.pagination} onPageChange={setPage} />
      )}
    </div>
  );
}

function CreateBusinessForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    website: '',
    email: '',
    industry: '',
    country: '',
    city: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createBusiness(form);
      onCreated();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.details?.length
          ? cause.details.map((d) => `${d.path ?? ''}: ${d.message}`).join(' · ')
          : cause instanceof Error
            ? cause.message
            : 'Create failed',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={(e) => void handleSubmit(e)}>
      <div className="form-grid">
        <label className="field">
          <span>Name *</span>
          <input
            className="input"
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Website</span>
          <input
            className="input"
            placeholder="acme.com"
            value={form.website}
            onChange={(e) => set('website', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Industry</span>
          <input
            className="input"
            value={form.industry}
            onChange={(e) => set('industry', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Country</span>
          <input
            className="input"
            value={form.country}
            onChange={(e) => set('country', e.target.value)}
          />
        </label>
        <label className="field">
          <span>City</span>
          <input
            className="input"
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
          />
        </label>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Create business'}
        </button>
      </div>
    </form>
  );
}
