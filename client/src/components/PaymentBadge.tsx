import type { PaymentStatus } from '../types';

const LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`badge badge-pay-${status}`}>{LABELS[status]}</span>;
}