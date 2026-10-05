import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { formatDate, money } from '../lib/format';
import { STATUSES } from '../types';
import type { Order, Status } from '../types';

interface Props {
  order: Order;
  canDelete: boolean;
  onClose: () => void;
  onUpdated: (order: Order) => void;
  onDeleted: (id: number) => void;
}

export function OrderDialog({ order, canDelete, onClose, onUpdated, onDeleted }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<Status>(order.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // السيرفر بيمنع تعديل الطلبات المسلّمة أو الملغية، فبنعطل الحقل هون كمان
  const locked = order.status === 'delivered' || order.status === 'cancelled';

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch<Order>(`/orders/${order.id}/status`, { status });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the order');
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete order #${order.id}? This cannot be undone.`)) return;
    try {
      await api.delete(`/orders/${order.id}`);
      onDeleted(order.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the order');
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} className="modal">
      <h2 className="page-title">Order #{order.id}</h2>

      <div className="sum-row"><span className="muted">Customer</span><span>{order.customerName}</span></div>
      <div className="sum-row"><span className="muted">Email</span><span>{order.customerEmail}</span></div>
      <div className="sum-row"><span className="muted">Placed on</span><span>{formatDate(order.createdAt)}</span></div>
      <div className="sum-row"><span className="muted">Address</span><span>{order.address}</span></div>

      <div className="order-detail">
        {order.items.map((i) => (
          <div className="sum-row" key={i.productId}>
            <span>{i.productName} × {i.quantity}</span>
            <span>{money(i.unitPrice * i.quantity)}</span>
          </div>
        ))}
        <div className="sum-row"><span className="muted">Shipping</span><span>{money(order.shipping)}</span></div>
        <div className="sum-row sum-total"><span>Total</span><span>{money(order.total)}</span></div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="order-status">Status</label>
        <select id="order-status" value={status} onChange={(e) => setStatus(e.target.value as Status)} disabled={locked || saving}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {locked && <span className="muted">This order is {order.status} and can't be changed.</span>}
      </div>

      {error && <p className="alert-error" role="alert">{error}</p>}

      <div className="modal-actions">
        <span>
          {canDelete && (
            <button className="btn btn-danger" onClick={remove}>Delete</button>
          )}
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => ref.current?.close()}>Close</button>
          <button className="btn btn-primary" onClick={save} disabled={locked || saving || status === order.status}>
            {saving ? 'Saving…' : 'Save status'}
          </button>
        </span>
      </div>
    </dialog>
  );
}