import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listWebsiteAnalyses, startWebsiteAnalysis } from '../api/websiteAnalyses';
import type { WebsiteAnalysis } from '../types/websiteAnalysis';
import { AnalysisStatusBadge } from './AnalysisStatusBadge';

const POLL_INTERVAL_MS = 2000;

interface Props {
  businessId: string;
  hasWebsite: boolean;
}

/** Analyze-website trigger + status + history, embedded in the business detail page. */
export function WebsiteAnalysisPanel({ businessId, hasWebsite }: Props) {
  const [history, setHistory] = useState<WebsiteAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await listWebsiteAnalyses(businessId, 1, 10);
      setHistory(res.data);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load analysis history');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while the most recent analysis is still in flight.
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

  async function handleAnalyze() {
    setStarting(true);
    setError(null);
    try {
      await startWebsiteAnalysis(businessId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to start analysis');
    } finally {
      setStarting(false);
    }
  }

  const latest = history[0];
  const latestInFlight = latest && (latest.status === 'PENDING' || latest.status === 'RUNNING');

  return (
    <div className="card form-card">
      <div className="content-header">
        <h3>Website analysis</h3>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!hasWebsite || starting || Boolean(latestInFlight)}
          title={hasWebsite ? undefined : 'Add a website before analyzing'}
          onClick={() => void handleAnalyze()}
        >
          {starting || latestInFlight ? 'Analyzing…' : 'Analyze website'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-muted">No analyses yet. Click "Analyze website" to run the first one.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Final URL</th>
              <th>Duration</th>
              <th>Started</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id}>
                <td>
                  <AnalysisStatusBadge status={item.status} />
                </td>
                <td className="text-muted">{item.finalUrl ?? '—'}</td>
                <td className="text-muted">
                  {item.durationMs !== null ? `${(item.durationMs / 1000).toFixed(1)}s` : '—'}
                </td>
                <td className="text-muted">
                  {item.startedAt ? new Date(item.startedAt).toLocaleString() : '—'}
                </td>
                <td>
                  <Link
                    className="row-link"
                    to={`/businesses/${businessId}/website-analyses/${item.id}`}
                  >
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
