import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getScreenshotMeta, getWebsiteAnalysis } from '../api/websiteAnalyses';
import { AnalysisStatusBadge } from '../components/AnalysisStatusBadge';
import type { LinkRef, ScreenshotMeta, WebsiteAnalysis } from '../types/websiteAnalysis';

const POLL_INTERVAL_MS = 2000;

export function WebsiteAnalysisDetailPage() {
  const { businessId, analysisId } = useParams<{ businessId: string; analysisId: string }>();
  const [analysis, setAnalysis] = useState<WebsiteAnalysis | null>(null);
  const [screenshot, setScreenshot] = useState<ScreenshotMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;

    async function load() {
      try {
        const loaded = await getWebsiteAnalysis(analysisId as string);
        if (cancelled) return;
        setAnalysis(loaded);
        setError(null);

        const inFlight = loaded.status === 'PENDING' || loaded.status === 'RUNNING';
        if (!inFlight && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (loaded.status === 'COMPLETED' && loaded.screenshotWidth) {
          getScreenshotMeta(loaded.id)
            .then((meta) => !cancelled && setScreenshot(meta))
            .catch(() => undefined);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to load analysis');
        }
      }
    }

    void load();
    pollRef.current = setInterval(() => void load(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [analysisId]);

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

  if (!analysis) {
    return <p className="text-muted">Loading…</p>;
  }

  return (
    <div>
      <header className="content-header">
        <div>
          <Link className="breadcrumb" to={`/businesses/${businessId}`}>
            ← Back to business
          </Link>
          <h2>Website analysis</h2>
        </div>
        <AnalysisStatusBadge status={analysis.status} />
      </header>

      <div className="card form-card">
        <div className="meta-row">
          <span className="text-muted">
            Requested: <strong>{analysis.requestedUrl}</strong>
          </span>
          {analysis.finalUrl && (
            <span className="text-muted">
              Final URL: <strong>{analysis.finalUrl}</strong>
            </span>
          )}
          {analysis.statusCode !== null && (
            <span className="text-muted">Status code: {analysis.statusCode}</span>
          )}
          {analysis.redirectCount !== null && (
            <span className="text-muted">Redirects: {analysis.redirectCount}</span>
          )}
          {analysis.durationMs !== null && (
            <span className="text-muted">Duration: {(analysis.durationMs / 1000).toFixed(1)}s</span>
          )}
        </div>
        {analysis.error && <div className="alert alert-error">{analysis.error}</div>}
        {(analysis.status === 'PENDING' || analysis.status === 'RUNNING') && (
          <p className="text-muted">This analysis is still in progress — updating automatically…</p>
        )}
      </div>

      {analysis.status === 'COMPLETED' && (
        <>
          {screenshot && (
            <div className="card form-card">
              <h3>Screenshot</h3>
              <img
                className="screenshot-preview"
                src={screenshot.url}
                alt={`Full-page screenshot of ${analysis.finalUrl ?? analysis.requestedUrl}`}
              />
            </div>
          )}

          <div className="card form-card">
            <h3>SEO metadata</h3>
            <dl className="detail-list">
              <dt>Title</dt>
              <dd>{analysis.title ?? '—'}</dd>
              <dt>Meta description</dt>
              <dd>{analysis.metaDescription ?? '—'}</dd>
              <dt>Canonical URL</dt>
              <dd>{analysis.canonicalUrl ?? '—'}</dd>
              <dt>Language</dt>
              <dd>{analysis.language ?? '—'}</dd>
              <dt>Favicon</dt>
              <dd>{analysis.faviconUrl ?? '—'}</dd>
            </dl>
          </div>

          {analysis.headings && (
            <div className="card form-card">
              <h3>Headings</h3>
              {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).map((level) =>
                analysis.headings && analysis.headings[level].length > 0 ? (
                  <div key={level}>
                    <strong>{level.toUpperCase()}</strong>
                    <ul>
                      {analysis.headings[level].map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          )}

          {analysis.technologies && analysis.technologies.length > 0 && (
            <div className="card form-card">
              <h3>Technologies detected</h3>
              <div className="tech-badges">
                {analysis.technologies.map((tech) => (
                  <span key={tech} className="badge badge-tech">
                    {tech.replaceAll('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="card form-card">
            <h3>Contact information</h3>
            <dl className="detail-list">
              <dt>Emails found</dt>
              <dd>{analysis.emails?.length ? analysis.emails.join(', ') : '—'}</dd>
              <dt>Phone numbers found</dt>
              <dd>{analysis.phones?.length ? analysis.phones.join(', ') : '—'}</dd>
              <dt>Contact forms</dt>
              <dd>{analysis.contactForms?.length ?? 0}</dd>
              <dt>Social links</dt>
              <dd>
                {analysis.socialLinks?.length
                  ? analysis.socialLinks.map((s) => `${s.platform} (${s.url})`).join(', ')
                  : '—'}
              </dd>
            </dl>
          </div>

          <div className="card form-card">
            <h3>Links</h3>
            <div className="link-columns">
              <LinkColumn title="Navigation" links={analysis.navigationLinks} />
              <LinkColumn title="Footer" links={analysis.footerLinks} />
              <LinkColumn title="Internal" links={analysis.internalLinks} />
              <LinkColumn title="External" links={analysis.externalLinks} />
            </div>
          </div>

          <div className="card form-card">
            <h3>Media</h3>
            <p className="text-muted">
              {analysis.images?.length ?? 0} image(s), {analysis.videos?.length ?? 0}{' '}
              video(s)/embed(s)
            </p>
          </div>

          {analysis.openGraph && Object.keys(analysis.openGraph).length > 0 && (
            <div className="card form-card">
              <h3>Open Graph</h3>
              <pre className="code-block">{JSON.stringify(analysis.openGraph, null, 2)}</pre>
            </div>
          )}

          {analysis.twitterCard && Object.keys(analysis.twitterCard).length > 0 && (
            <div className="card form-card">
              <h3>Twitter Card</h3>
              <pre className="code-block">{JSON.stringify(analysis.twitterCard, null, 2)}</pre>
            </div>
          )}

          {analysis.jsonLd && analysis.jsonLd.length > 0 && (
            <div className="card form-card">
              <h3>JSON-LD structured data</h3>
              <pre className="code-block">{JSON.stringify(analysis.jsonLd, null, 2)}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LinkColumn({ title, links }: { title: string; links: LinkRef[] | null }) {
  return (
    <div className="link-column">
      <strong>
        {title} ({links?.length ?? 0})
      </strong>
      <ul>
        {(links ?? []).slice(0, 20).map((link, i) => (
          <li key={i}>
            <a href={link.href} target="_blank" rel="noreferrer">
              {link.text || link.href}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
