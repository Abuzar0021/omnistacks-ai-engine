import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getBusinessAudit } from '../api/businessAudits';
import { AuditStatusBadge } from '../components/AuditStatusBadge';
import type { BusinessAudit } from '../types/businessAudit';

const POLL_INTERVAL_MS = 2000;

export function BusinessAuditDetailPage() {
  const { businessId, auditId } = useParams<{ businessId: string; auditId: string }>();
  const [audit, setAudit] = useState<BusinessAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!auditId) return;
    let cancelled = false;

    async function load() {
      try {
        const loaded = await getBusinessAudit(auditId as string);
        if (cancelled) return;
        setAudit(loaded);
        setError(null);

        const inFlight = loaded.status === 'PENDING' || loaded.status === 'RUNNING';
        if (!inFlight && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to load audit');
        }
      }
    }

    void load();
    pollRef.current = setInterval(() => void load(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [auditId]);

  if (error) {
    return (
      <div>
        <div className="alert alert-error">{error}</div>
        <Link className="btn btn-secondary" to={`/businesses/${businessId}`}>
          ← Back to business
        </Link>
      </div>
    );
  }

  if (!audit) {
    return <p className="text-muted">Loading…</p>;
  }

  return (
    <div>
      <header className="content-header">
        <div>
          <Link className="breadcrumb" to={`/businesses/${businessId}`}>
            ← Back to business
          </Link>
          <h2>Business audit</h2>
        </div>
        <AuditStatusBadge status={audit.status} />
      </header>

      <div className="card form-card">
        <div className="meta-row">
          {audit.score !== null && (
            <span className="text-muted">
              Score: <strong>{audit.score}/100</strong>
            </span>
          )}
          {audit.confidence && <span className="text-muted">Confidence: {audit.confidence}</span>}
          {audit.model && <span className="text-muted">Model: {audit.model}</span>}
          {audit.durationMs !== null && (
            <span className="text-muted">Duration: {(audit.durationMs / 1000).toFixed(1)}s</span>
          )}
          {audit.totalTokens !== null && (
            <span className="text-muted">Tokens: {audit.totalTokens}</span>
          )}
        </div>
        {audit.error && <div className="alert alert-error">{audit.error}</div>}
        {(audit.status === 'PENDING' || audit.status === 'RUNNING') && (
          <p className="text-muted">This audit is still in progress — updating automatically…</p>
        )}
      </div>

      {audit.status === 'COMPLETED' && (
        <>
          {audit.summary && (
            <div className="card form-card">
              <h3>Summary</h3>
              <p>{audit.summary}</p>
            </div>
          )}

          {audit.reasons && audit.reasons.length > 0 && (
            <div className="card form-card">
              <h3>Why this score</h3>
              <ul>
                {audit.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {audit.disqualifiers && audit.disqualifiers.length > 0 && (
            <div className="card form-card">
              <h3>Disqualifiers</h3>
              <ul>
                {audit.disqualifiers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {audit.findings && audit.findings.length > 0 && (
            <div className="card form-card">
              <h3>Findings</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Severity</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.findings.map((finding, i) => (
                    <tr key={i}>
                      <td className="text-muted">{finding.category}</td>
                      <td>
                        <span className={`badge badge-severity-${finding.severity}`}>
                          {finding.severity}
                        </span>
                      </td>
                      <td>{finding.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
