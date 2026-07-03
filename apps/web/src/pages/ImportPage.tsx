import { useRef, useState } from 'react';
import { importBusinessesCsv } from '../api/businesses';
import type { ImportSummary } from '../types/business';

const EXPECTED_HEADER = 'name,website,email,phone,industry,country,city,status,notes';
const SAMPLE_CSV = [
  EXPECTED_HEADER,
  'Acme Corp,https://acme.com,info@acme.com,+1 555 0100,SaaS,USA,New York,new,Referred by Jane',
  'Beta GmbH,beta.io,,,Manufacturing,Germany,Berlin,,',
].join('\n');

export function ImportPage() {
  const [csvText, setCsvText] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setCsvText(await file.text());
    setSummary(null);
    setError(null);
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    setSummary(null);
    try {
      setSummary(await importBusinessesCsv(csvText));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <header className="content-header">
        <h2>Import businesses from CSV</h2>
      </header>

      <div className="card form-card">
        <p className="text-muted">
          Expected columns (any order, only <code>name</code> is required):
        </p>
        <pre className="code-block">{EXPECTED_HEADER}</pre>
        <p className="text-muted">
          Rows with an invalid email or website are rejected. Duplicate domains — within the file or
          already in the database — are skipped.{' '}
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setCsvText(SAMPLE_CSV);
              setSummary(null);
            }}
          >
            Load a sample CSV
          </button>
        </p>

        <div className="form-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="file-input"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>

        <textarea
          className="input code-area"
          rows={10}
          placeholder="…or paste CSV content here"
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setSummary(null);
          }}
        />

        {error && <div className="alert alert-error">{error}</div>}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={importing || csvText.trim() === ''}
            onClick={() => void handleImport()}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>

      {summary && <ImportSummaryView summary={summary} />}
    </div>
  );
}

function ImportSummaryView({ summary }: { summary: ImportSummary }) {
  return (
    <div className="card form-card">
      <h3>Import summary</h3>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-value">{summary.totalRows}</span>
          <span className="stat-label">rows</span>
        </div>
        <div className="stat stat-ok">
          <span className="stat-value">{summary.imported}</span>
          <span className="stat-label">imported</span>
        </div>
        <div className="stat stat-warn">
          <span className="stat-value">{summary.skipped}</span>
          <span className="stat-label">skipped</span>
        </div>
      </div>

      {summary.errors.length > 0 && (
        <>
          <h4>Invalid rows</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Field</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {summary.errors.map((err, index) => (
                <tr key={index}>
                  <td>{err.row}</td>
                  <td>{err.field ?? '—'}</td>
                  <td>{err.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {summary.duplicates.length > 0 && (
        <>
          <h4>Skipped duplicates</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Domain</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {summary.duplicates.map((dup, index) => (
                <tr key={index}>
                  <td>{dup.row}</td>
                  <td>{dup.domain}</td>
                  <td>
                    {dup.reason === 'duplicate_in_file'
                      ? 'Appears earlier in the file'
                      : 'Already in the database'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
