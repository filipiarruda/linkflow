import { STATUS_LABELS, type ContactStatus } from '../types';

export function StatusBadge({ status }: { status: ContactStatus }) {
  return <span className={`status-badge status-badge--${status}`}>{STATUS_LABELS[status]}</span>;
}
