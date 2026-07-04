import type { BusinessAuditStatus } from '../types/businessAudit';

const LABELS: Record<BusinessAuditStatus, string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

export function AuditStatusBadge({ status }: { status: BusinessAuditStatus }) {
  return (
    <span className={`badge badge-analysis-${status.toLowerCase()}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
