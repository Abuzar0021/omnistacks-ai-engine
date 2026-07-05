import type { LeadDiscoveryJobStatus } from '../types/leadDiscovery';

const LABELS: Record<LeadDiscoveryJobStatus, string> = {
  PENDING: 'Pending',
  RUNNING: 'Searching',
  COMPLETED: 'Done',
  FAILED: 'Failed',
};

export function LeadDiscoveryStatusBadge({ status }: { status: LeadDiscoveryJobStatus }) {
  return (
    <span className={`badge badge-analysis-${status.toLowerCase()}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
