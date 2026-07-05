import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listEmailDrafts, sendEmailDraft, startEmailDraft } from '../api/emailDrafts';
import type { EmailDraft } from '../types/emailDraft';
import { EmailDraftStatusBadge } from './EmailDraftStatusBadge';

const POLL_INTERVAL_MS = 2000;

interface Props {
  businessId: string;
  hasCompletedAudit: boolean;
}

/** Email draft trigger + status + history, embedded in the business detail page. */
export function EmailDraftPanel({ businessId, hasCompletedAudit }: Props) {
  const [history, setHistory] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await listEmailDrafts(businessId, 1, 10);
      setHistory(res.data);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load draft history');
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

  async function handleDraft() {
    setStarting(true);
    setError(null);
    try {
      await startEmailDraft(businessId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to start draft');
    } finally {
      setStarting(false);
    }
  }

  async function handleSend(draftId: string) {
    setSendingId(draftId);
    setError(null);
    try {
      const { triggered } = await sendEmailDraft(draftId);
      if (!triggered) {
        setError('Could not reach n8n to send this email — try again shortly.');
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to send draft');
    } finally {
      setSendingId(null);
    }
  }

  const latest = history[0];
  const latestInFlight = latest && (latest.status === 'PENDING' || latest.status === 'RUNNING');

  return (
    <div className="card form-card">
      <div className="content-header">
        <h3>Outreach email</h3>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!hasCompletedAudit || starting || Boolean(latestInFlight)}
          title={hasCompletedAudit ? undefined : 'Run an AI audit first'}
          onClick={() => void handleDraft()}
        >
          {starting || latestInFlight ? 'Drafting…' : 'Draft email'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-muted">
          {hasCompletedAudit
            ? 'No drafts yet. Click "Draft email" to generate a personalized outreach email.'
            : 'Run an AI audit first, then draft an outreach email here.'}
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Subject</th>
              <th>Sent</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id}>
                <td>
                  <EmailDraftStatusBadge status={item.status} />
                </td>
                <td className="text-muted">{item.subject ?? '—'}</td>
                <td className="text-muted">
                  {item.sentAt ? new Date(item.sentAt).toLocaleString() : '—'}
                </td>
                <td>
                  {item.status === 'COMPLETED' && !item.sentAt && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={sendingId === item.id}
                      onClick={() => void handleSend(item.id)}
                    >
                      {sendingId === item.id ? 'Sending…' : 'Send'}
                    </button>
                  )}
                </td>
                <td>
                  <Link
                    className="row-link"
                    to={`/businesses/${businessId}/email-drafts/${item.id}`}
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
