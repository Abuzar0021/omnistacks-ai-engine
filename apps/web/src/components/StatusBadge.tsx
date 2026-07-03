import type { BusinessStatus } from '../types/business';

const LABELS: Record<BusinessStatus, string> = {
  NEW: 'New',
  ANALYZED: 'Analyzed',
  AUDITED: 'Audited',
  EMAIL_DRAFTED: 'Email drafted',
  EMAIL_SENT: 'Email sent',
  RESPONDED: 'Responded',
  MEETING_BOOKED: 'Meeting booked',
  CLIENT: 'Client',
  ARCHIVED: 'Archived',
};

export function StatusBadge({ status }: { status: BusinessStatus }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{LABELS[status] ?? status}</span>;
}
