import type { WebsiteAnalysisStatus } from '../types/websiteAnalysis';

const LABELS: Record<WebsiteAnalysisStatus, string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

export function AnalysisStatusBadge({ status }: { status: WebsiteAnalysisStatus }) {
  return (
    <span className={`badge badge-analysis-${status.toLowerCase()}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
