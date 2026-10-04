import { Fragment } from 'react';
import type { Status } from '../types';

const STEPS: { key: Status; label: string; icon: string }[] = [
  { key: 'pending', label: 'Placed', icon: 'clock' },
  { key: 'processing', label: 'Processing', icon: 'loader' },
  { key: 'shipped', label: 'Shipped', icon: 'truck' },
  { key: 'delivered', label: 'Delivered', icon: 'package' },
];

export function OrderTracker({ status }: { status: Status }) {
  if (status === 'cancelled') return <p className="alert-error">This order was cancelled.</p>;

  const current = STEPS.findIndex((s) => s.key === status);
  return (
    <div>
      <div className="tracker" role="img" aria-label={`Order status: ${STEPS[current].label}`}>
        {STEPS.map((s, i) => {
          const done = i < current || (i === current && status === 'delivered');
          return (
            <Fragment key={s.key}>
              {i > 0 && (
                <span className="track-bar">
                  <i style={{ width: i <= current ? '100%' : '0' }} />
                </span>
              )}
              <span className={`dot ${i > current ? 'off' : ''}`}>
                <i className={`ti ti-${done ? 'check' : s.icon}`} aria-hidden="true" />
              </span>
            </Fragment>
          );
        })}
      </div>
      <div className="tracker-labels">
        {STEPS.map((s) => (
          <span key={s.key}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}