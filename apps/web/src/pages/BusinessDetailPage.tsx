import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteBusiness, getBusiness, updateBusiness } from '../api/businesses';
import { ApiError } from '../api/client';
import { BusinessAuditPanel } from '../components/BusinessAuditPanel';
import { StatusBadge } from '../components/StatusBadge';
import { WebsiteAnalysisPanel } from '../components/WebsiteAnalysisPanel';
import { BUSINESS_STATUSES, type Business, type BusinessStatus } from '../types/business';

interface FormState {
  name: string;
  website: string;
  email: string;
  phone: string;
  industry: string;
  country: string;
  city: string;
  status: BusinessStatus;
  notes: string;
  tags: string;
}

function toFormState(business: Business): FormState {
  return {
    name: business.name,
    website: business.website ?? '',
    email: business.email ?? '',
    phone: business.phone ?? '',
    industry: business.industry ?? '',
    country: business.country ?? '',
    city: business.city ?? '',
    status: business.status,
    notes: business.notes ?? '',
    tags: business.tags.join(', '),
  };
}

export function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [business, setBusiness] = useState<Business | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getBusiness(id)
      .then((loaded) => {
        setBusiness(loaded);
        setForm(toFormState(loaded));
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Failed to load business');
      });
  }, [id]);

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
    setNotice(null);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!id || !form) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateBusiness(id, {
        name: form.name,
        website: form.website || null,
        email: form.email || null,
        phone: form.phone || null,
        industry: form.industry || null,
        country: form.country || null,
        city: form.city || null,
        status: form.status,
        notes: form.notes || null,
        tags: form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setBusiness(updated);
      setForm(toFormState(updated));
      setNotice('Saved.');
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.details?.length
          ? cause.details.map((d) => `${d.path ?? ''}: ${d.message}`).join(' · ')
          : cause instanceof Error
            ? cause.message
            : 'Save failed',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || !business) return;
    if (!window.confirm(`Delete "${business.name}"? This cannot be undone.`)) return;
    try {
      await deleteBusiness(id);
      navigate('/businesses');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed');
    }
  }

  if (error && !business) {
    return (
      <div>
        <div className="alert alert-error">{error}</div>
        <Link className="btn btn-secondary" to="/businesses">
          ← Back to businesses
        </Link>
      </div>
    );
  }

  if (!business || !form) {
    return <p className="text-muted">Loading…</p>;
  }

  return (
    <div>
      <header className="content-header">
        <div>
          <Link className="breadcrumb" to="/businesses">
            ← Businesses
          </Link>
          <h2>{business.name}</h2>
        </div>
        <StatusBadge status={business.status} />
      </header>

      <div className="meta-row">
        <span className="text-muted">
          Domain: <strong>{business.domain ?? '—'}</strong>
        </span>
        <span className="text-muted">
          Score: <strong>{business.score ?? '—'}</strong>
        </span>
        <span className="text-muted">Created: {new Date(business.createdAt).toLocaleString()}</span>
        <span className="text-muted">Updated: {new Date(business.updatedAt).toLocaleString()}</span>
      </div>

      <form className="card form-card" onSubmit={(e) => void handleSave(e)}>
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
            <span>Phone</span>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
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
          <label className="field">
            <span>Status</span>
            <select
              className="input"
              value={form.status}
              onChange={(e) => set('status', e.target.value as BusinessStatus)}
            >
              {BUSINESS_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="field field-wide">
            <span>Tags (comma-separated)</span>
            <input
              className="input"
              placeholder="saas, priority"
              value={form.tags}
              onChange={(e) => set('tags', e.target.value)}
            />
          </label>
          <label className="field field-wide">
            <span>Notes</span>
            <textarea
              className="input"
              rows={5}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </label>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-success">{notice}</div>}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void handleDelete()}>
            Delete
          </button>
        </div>
      </form>

      <WebsiteAnalysisPanel businessId={business.id} hasWebsite={Boolean(business.website)} />
      <BusinessAuditPanel
        businessId={business.id}
        hasCompletedAnalysis={business.status !== 'NEW'}
      />
    </div>
  );
}
