import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { emptyCard, validateCard } from '../lib/card';
import type { CardErrors, CardFields } from '../lib/card';
import { money } from '../lib/format';
import { STEP_LABELS } from '../lib/payments';
import { usePayment } from '../lib/usePayment';
import type { Order } from '../types';
import { CardForm } from './CardForm';

interface Props {
  order: Order;
  onClose: () => void;
  onPaid: (order: Order) => void;
}

export function PayDialog({ order, onClose, onPaid }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [card, setCard] = useState<CardFields>(emptyCard);
  const [errors, setErrors] = useState<CardErrors>({});
  const { state, pay } = usePayment();
  const working = state.phase === 'working';

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    const found = validateCard(card);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const outcome = await pay(order.id, card);
    if (outcome?.kind === 'succeeded') {
      let updated: Order;
      try {
        updated = await api.get<Order>(`/orders/${order.id}`);
      } catch {
        updated = { ...order, paymentStatus: 'paid' };
      }
      onPaid(updated);
    }
  }

  const label = working
    ? 'Processing…'
    : state.phase === 'failed' || state.phase === 'error'
      ? 'Try again'
      : state.phase === 'pending'
        ? 'Check again'
        : `Pay ${money(order.total)}`;

  return (
    <dialog ref={ref} onClose={onClose} className="modal modal-wide">
      <form onSubmit={handleSubmit} noValidate>
        <h2 className="page-title">Pay for order #{order.id}</h2>
        <p className="muted">
          Total: <strong>{money(order.total)}</strong>
        </p>

        <CardForm value={card} errors={errors} onChange={setCard} disabled={working} />

        {state.phase === 'working' && (
          <p className="info" role="status">
            {STEP_LABELS[state.step]}
          </p>
        )}
        {(state.phase === 'failed' || state.phase === 'error') && (
          <p className="alert-error" role="alert">
            {state.message}
          </p>
        )}
        {state.phase === 'pending' && (
          <p className="info" role="status">
            {state.message}
          </p>
        )}

        <div className="modal-actions">
          <span />
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={working}>
              Close
            </button>
            <button type="submit" className="btn btn-primary" disabled={working}>
              {label}
            </button>
          </span>
        </div>
      </form>
    </dialog>
  );
}