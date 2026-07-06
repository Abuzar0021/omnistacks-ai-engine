import type { EmailDraftStatus } from '../types/emailDraft';

const LABELS: Record<EmailDraftStatus, string> = {
  PENDING: 'Pending',
  RUNNING: 'Drafting',
  COMPLETED: 'Ready to send',
  FAILED: 'Failed',
};

export function EmailDraftStatusBadge({ status }: { status: EmailDraftStatus }) {
  return (
    <span className={`badge badge-analysis-${status.toLowerCase()}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
