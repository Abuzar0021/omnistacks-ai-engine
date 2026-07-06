import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  listLeadDiscoveryJobs,
  startLeadDiscovery,
  getLeadDiscoveryJob,
} from '../api/leadDiscovery';
import { ApiError } from '../api/client';
import { LeadDiscoveryStatusBadge } from '../components/LeadDiscoveryStatusBadge';
import { Pagination } from '../components/Pagination';
import type { LeadDiscoveryJob } from '../types/leadDiscovery';

const POLL_INTERVAL_MS = 2000;

export function LeadDiscoveryPage() {
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('');
  const [limit, setLimit] = useState(20);
  const [job, setJob] = useState<LeadDiscoveryJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [history, setHistory] = useState<LeadDiscoveryJob[] | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState<{
    page: number;
    total: number;
    totalPages: number;
  } | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await listLeadDiscoveryJobs(historyPage, 10);
      setHistory(res.data);
      setHistoryPagination(res.pagination);
    } catch {
      // History is a nice-to-have; leave the form usable even if this fails.
    }
  }, [historyPage]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function pollJob(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const updated = await getLeadDiscoveryJob(jobId);
          setJob(updated);
          if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            void refreshHistory();
          }
        } catch (cause) {
          setError(cause instanceof ApiError ? cause.message : 'Failed to check search status');
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      })();
    }, POLL_INTERVAL_MS);
  }

  async function handleStart(e: FormEvent) {
    e.preventDefault();
    setStarting(true);
    setError(null);
    setJob(null);
    try {
      const started = await startLeadDiscovery({
        industry,
        location,
        country: country.trim() === '' ? undefined : country,
        limit,
      });
      setJob(started);
      pollJob(started.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to start search');
    } finally {
      setStarting(false);
    }
  }

  const searching = job !== null && (job.status === 'PENDING' || job.status === 'RUNNING');

  return (
    <div>
      <header className="content-header">
        <h2>Find new leads</h2>
      </header>

      <div className="card form-card">
        <p className="text-muted">
          Searches a business directory by industry and location and adds new, unique matches to
          your Businesses list with status <strong>NEW</strong> — ready for the same analyze → audit
          → draft → send pipeline as any other business. Scraping a live directory is inherently
          best-effort: results, coverage, and field completeness (especially websites) will vary.
        </p>

        <form onSubmit={(e) => void handleStart(e)}>
          <div className="form-grid">
            <label className="field">
              <span>Industry</span>
              <input
                className="input"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Saloons"
                required
              />
            </label>
            <label className="field">
              <span>Location</span>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Texas"
                required
              />
            </label>
            <label className="field">
              <span>Country (optional, stored on each match)</span>
              <input
                className="input"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. United States"
              />
            </label>
            <label className="field">
              <span>Max results</span>
              <input
                className="input"
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </label>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={starting || searching}>
              {starting ? 'Starting…' : searching ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>
      </div>

      {job && (
        <div className="card form-card">
          <div className="meta-row">
            <LeadDiscoveryStatusBadge status={job.status} />
            <span className="text-muted">
              {job.industry} in {job.location}
              {job.country ? ` (${job.country})` : ''}
            </span>
          </div>

          {searching && (
            <p className="text-muted">Searching the directory — this can take a moment…</p>
          )}

          {job.status === 'FAILED' && (
            <div className="alert alert-error">{job.error ?? 'Search failed'}</div>
          )}

          {job.status === 'COMPLETED' && (
            <>
              <div className="stat-row">
                <div className="stat">
                  <span className="stat-value">{job.foundCount ?? 0}</span>
                  <span className="stat-label">found</span>
                </div>
                <div className="stat stat-ok">
                  <span className="stat-value">{job.createdCount ?? 0}</span>
                  <span className="stat-label">added as new</span>
                </div>
                <div className="stat stat-warn">
                  <span className="stat-value">{job.duplicateCount ?? 0}</span>
                  <span className="stat-label">already existed</span>
                </div>
              </div>
              <Link className="btn btn-secondary" to="/businesses">
                View businesses →
              </Link>
            </>
          )}
        </div>
      )}

      {history && history.length > 0 && (
        <div className="card form-card">
          <h3>Recent searches</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Industry</th>
                <th>Location</th>
                <th>Status</th>
                <th>Found</th>
                <th>Added</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{item.industry}</td>
                  <td>{item.location}</td>
                  <td>
                    <LeadDiscoveryStatusBadge status={item.status} />
                  </td>
                  <td>{item.foundCount ?? '—'}</td>
                  <td>{item.createdCount ?? '—'}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {historyPagination && historyPagination.totalPages > 1 && (
            <Pagination
              pagination={{
                page: historyPagination.page,
                total: historyPagination.total,
                totalPages: historyPagination.totalPages,
                limit: 10,
              }}
              onPageChange={setHistoryPage}
            />
          )}
        </div>
      )}
    </div>
  );
}
