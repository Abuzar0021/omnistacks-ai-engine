import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBusinessAudits, startBusinessAudit } from '../api/businessAudits';
import type { BusinessAudit } from '../types/businessAudit';
import { AuditStatusBadge } from './AuditStatusBadge';

const POLL_INTERVAL_MS = 2000;

interface Props {
  businessId: string;
  hasCompletedAnalysis: boolean;
}

/** Audit trigger + status + history, embedded in the business detail page. */
export function BusinessAuditPanel({ businessId, hasCompletedAnalysis }: Props) {
  const [history, setHistory] = useState<BusinessAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await listBusinessAudits(businessId, 1, 10);
      setHistory(res.data);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load audit history');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const latest = history[0];
    const inFlight = latest && (latest.status === 'PENDING' || latest.status === 'RUNNING');

    if (inFlight && !pollRef.current) {
      pollRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    } else if (!inFlight && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [history, refresh]);

  async function handleAudit() {
    setStarting(true);
    setError(null);
    try {
      await startBusinessAudit(businessId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to start audit');
    } finally {
      setStarting(false);
    }
  }

  const latest = history[0];
  const latestInFlight = latest && (latest.status === 'PENDING' || latest.status === 'RUNNING');

  return (
    <div className="card form-card">
      <div className="content-header">
        <h3>AI audit &amp; score</h3>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!hasCompletedAnalysis || starting || Boolean(latestInFlight)}
          title={hasCompletedAnalysis ? undefined : 'Run a website analysis first'}
          onClick={() => void handleAudit()}
        >
          {starting || latestInFlight ? 'Auditing…' : 'Run audit'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-muted">
          {hasCompletedAnalysis
            ? 'No audits yet. Click "Run audit" to score this business.'
            : 'Run a website analysis first, then audit it here.'}
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Score</th>
              <th>Confidence</th>
              <th>Duration</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id}>
                <td>
                  <AuditStatusBadge status={item.status} />
                </td>
                <td className="text-muted">{item.score ?? '—'}</td>
                <td className="text-muted">{item.confidence ?? '—'}</td>
                <td className="text-muted">
                  {item.durationMs !== null ? `${(item.durationMs / 1000).toFixed(1)}s` : '—'}
                </td>
                <td>
                  <Link className="row-link" to={`/businesses/${businessId}/audits/${item.id}`}>
                    View details →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
