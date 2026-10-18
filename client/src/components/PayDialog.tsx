import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../api';
import { detectBrand, digitsOnly, emptyCard, validateCard } from '../lib/card';
import type { CardErrors, CardFields } from '../lib/card';
import { money } from '../lib/format';
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
  const [serverError, setServerError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    const found = validateCard(card);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;

    setPaying(true);
    try {
      const digits = digitsOnly(card.number);
      // رقم البطاقة ما بيطلع من المتصفح: بنبعت بس النوع وآخر 4 أرقام
      const updated = await api.post<Order>(`/orders/${order.id}/pay`, {
        cardBrand: detectBrand(digits),
        cardLast4: digits.slice(-4),
      });
      onPaid(updated);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong');
      setPaying(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} className="modal modal-wide">
      <form onSubmit={handleSubmit} noValidate>
        <h2 className="page-title">Pay for order #{order.id}</h2>
        <p className="muted">Total: <strong>{money(order.total)}</strong></p>

        <CardForm value={card} errors={errors} onChange={setCard} disabled={paying} />

        {serverError && <p className="alert-error" role="alert">{serverError}</p>}

        <div className="modal-actions">
          <span />
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={paying}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={paying}>
              {paying ? 'Paying…' : `Pay ${money(order.total)}`}
            </button>
          </span>
        </div>
      </form>
    </dialog>
  );
}