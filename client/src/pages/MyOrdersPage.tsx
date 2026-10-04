import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { OrderTracker } from '../components/OrderTracker';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, money } from '../lib/format';
import type { Order } from '../types';

export default function MyOrdersPage() {
  const location = useLocation();
  const highlight = (location.state as { highlight?: number } | null)?.highlight;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(highlight ?? null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // بنجيب الطلبات، وبنحدثها كل 15 ثانية عشان التتبع يتغير لما الإدارة تغير الحالة
  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get<Order[]>('/orders/mine')
        .then((data) => {
          if (!active) return;
          setOrders(data);
          setError(null);
        })
        .catch((err: Error) => {
          if (active) setError(err.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });

    load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const selected = orders.find((o) => o.id === selectedId) ?? orders[0];

  async function cancel(id: number) {
    if (!window.confirm('Cancel this order?')) return;
    setCancelling(true);
    setActionError(null);
    try {
      const updated = await api.post<Order>(`/orders/${id}/cancel`);
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not cancel the order');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) return <p className="muted">Loading your orders…</p>;
  if (error && orders.length === 0) return <p className="alert-error" role="alert">{error}</p>;

  if (orders.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h1 className="page-title">No orders yet</h1>
        <p className="muted">When you place an order, you can track it here.</p>
        <Link to="/shop" className="btn btn-primary">Start shopping</Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="page-title">My orders</h1>
      <div className="orders">
        <div className="order-list">
          {orders.map((o) => (
            <button
              key={o.id}
              className={`card order-card ${o.id === selected.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(o.id)}
              aria-pressed={o.id === selected.id}
            >
              <span className="sum-row" style={{ padding: 0 }}>
                <strong>Order #{o.id}</strong>
                <StatusBadge status={o.status} />
              </span>
              <span className="muted">
                {o.items.map((i) => i.productName).join(', ')} · {money(o.total)}
              </span>
            </button>
          ))}
        </div>

        <section className="card">
          <h2 className="page-title" style={{ fontSize: 18 }}>Tracking order #{selected.id}</h2>
          <OrderTracker status={selected.status} />

          <div className="order-detail">
            {selected.items.map((i) => (
              <div className="sum-row" key={i.productId}>
                <span>{i.productName} × {i.quantity}</span>
                <span>{money(i.unitPrice * i.quantity)}</span>
              </div>
            ))}
            <div className="sum-row"><span className="muted">Shipping</span><span>{money(selected.shipping)}</span></div>
            <div className="sum-row sum-total"><span>Total</span><span>{money(selected.total)}</span></div>
            <div className="sum-row"><span className="muted">Placed on</span><span>{formatDate(selected.createdAt)}</span></div>
            <div className="sum-row"><span className="muted">Delivery address</span><span>{selected.address}</span></div>
          </div>

          {actionError && <p className="alert-error" role="alert">{actionError}</p>}
          {selected.status === 'pending' && (
            <button className="btn btn-ghost-dark" onClick={() => cancel(selected.id)} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel order'}
            </button>
          )}
        </section>
      </div>
    </>
  );
}