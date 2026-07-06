import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getEmailDraft, sendEmailDraft } from '../api/emailDrafts';
import { EmailDraftStatusBadge } from '../components/EmailDraftStatusBadge';
import type { EmailDraft } from '../types/emailDraft';

const POLL_INTERVAL_MS = 2000;

export function EmailDraftDetailPage() {
  const { businessId, draftId } = useParams<{ businessId: string; draftId: string }>();
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;

    async function load() {
      try {
        const loaded = await getEmailDraft(draftId as string);
        if (cancelled) return;
        setDraft(loaded);
        setError(null);

        const inFlight = loaded.status === 'PENDING' || loaded.status === 'RUNNING';
        if (!inFlight && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to load draft');
        }
      }
    }

    void load();
    pollRef.current = setInterval(() => void load(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [draftId]);

  async function handleSend() {
    if (!draftId) return;
    setSending(true);
    setError(null);
    try {
      const { data, triggered } = await sendEmailDraft(draftId);
      setDraft(data);
      if (!triggered) {
        setError('Could not reach n8n to send this email — try again shortly.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to send draft');
    } finally {
      setSending(false);
    }
  }

  if (error && !draft) {
    return (
      <div>
        <div className="alert alert-error">{error}</div>
        <Link className="btn btn-secondary" to={`/businesses/${businessId}`}>
          ← Back to business
        </Link>
      </div>
    );
  }

  if (!draft) {
    return <p className="text-muted">Loading…</p>;
  }

  return (
    <div>
      <header className="content-header">
        <div>
          <Link className="breadcrumb" to={`/businesses/${businessId}`}>
            ← Back to business
          </Link>
          <h2>Outreach email</h2>
        </div>
        <EmailDraftStatusBadge status={draft.status} />
      </header>

      <div className="card form-card">
        <div className="meta-row">
          {draft.model && <span className="text-muted">Model: {draft.model}</span>}
          {draft.totalTokens !== null && (
            <span className="text-muted">Tokens: {draft.totalTokens}</span>
          )}
          {draft.durationMs !== null && (
            <span className="text-muted">Duration: {(draft.durationMs / 1000).toFixed(1)}s</span>
          )}
          <span className="text-muted">
            Sent: {draft.sentAt ? new Date(draft.sentAt).toLocaleString() : 'Not yet'}
          </span>
        </div>
        {draft.error && <div className="alert alert-error">{draft.error}</div>}
        {error && <div className="alert alert-error">{error}</div>}
        {(draft.status === 'PENDING' || draft.status === 'RUNNING') && (
          <p className="text-muted">This draft is still generating — updating automatically…</p>
        )}
      </div>

      {draft.status === 'COMPLETED' && (
        <div className="card form-card">
          <h3>{draft.subject}</h3>
          <pre className="code-block">{draft.body}</pre>
          {draft.factUsed && (
            <p className="text-muted">
              Fact used: <em>{draft.factUsed}</em>
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={Boolean(draft.sentAt) || sending}
              onClick={() => void handleSend()}
            >
              {draft.sentAt ? 'Sent' : sending ? 'Sending…' : 'Send email'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
