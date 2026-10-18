import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { OrderTracker } from '../components/OrderTracker';
import { PayDialog } from '../components/PayDialog';
import { PaymentBadge } from '../components/PaymentBadge';
import { ProductImage } from '../components/ProductImage';
import { StatusBadge } from '../components/StatusBadge';
import { BRAND_LABELS } from '../lib/card';
import type { CardBrand } from '../lib/card';
import { formatDate, money } from '../lib/format';
import type { Order } from '../types';

interface LocationState {
  highlight?: number;
  notice?: string;
  noticeKind?: 'success' | 'error';
}

export default function MyOrdersPage() {
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(state?.highlight ?? null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'success' | 'error' } | null>(
    state?.notice ? { text: state.notice, kind: state.noticeKind ?? 'success' } : null,
  );
  const [payOrder, setPayOrder] = useState<Order | null>(null);

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

  function handlePaid(updated: Order) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setPayOrder(null);
    setNotice({ text: 'Payment received. Thank you!', kind: 'success' });
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

  const canPay = selected.paymentStatus !== 'paid' && selected.status !== 'cancelled' && selected.paymentStatus !== 'refunded';
  const cardLabel = selected.cardLast4
    ? `${BRAND_LABELS[(selected.cardBrand as CardBrand) ?? 'other'] ?? 'Card'} •••• ${selected.cardLast4}`
    : null;

  return (
    <>
      <h1 className="page-title">My orders</h1>
      {notice && (
        <p className={notice.kind === 'error' ? 'alert-error' : 'success'} role="status">
          {notice.text}
        </p>
      )}

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
                <span className="badge-group">
                  <StatusBadge status={o.status} />
                  <PaymentBadge status={o.paymentStatus} />
                </span>
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
                <span className="item-line">
                  <ProductImage
                    product={{ id: i.productId, name: i.productName, icon: i.icon, color: i.color, imageVersion: i.imageVersion }}
                    size="xs"
                  />
                  {i.productName} × {i.quantity}
                </span>
                <span>{money(i.unitPrice * i.quantity)}</span>
              </div>
            ))}
            <div className="sum-row"><span className="muted">Shipping</span><span>{money(selected.shipping)}</span></div>
            <div className="sum-row sum-total"><span>Total</span><span>{money(selected.total)}</span></div>
            <div className="sum-row">
              <span className="muted">Payment</span>
              <span><PaymentBadge status={selected.paymentStatus} />{cardLabel && <> {cardLabel}</>}</span>
            </div>
            <div className="sum-row"><span className="muted">Placed on</span><span>{formatDate(selected.createdAt)}</span></div>
            <div className="sum-row"><span className="muted">Delivery address</span><span>{selected.address}</span></div>
          </div>

          {actionError && <p className="alert-error" role="alert">{actionError}</p>}
          <div className="row-gap">
            {canPay && (
              <button className="btn btn-primary" onClick={() => setPayOrder(selected)}>
                Pay now
              </button>
            )}
            {selected.status === 'pending' && (
              <button className="btn btn-ghost-dark" onClick={() => cancel(selected.id)} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : 'Cancel order'}
              </button>
            )}
          </div>
        </section>
      </div>

      {payOrder && <PayDialog key={payOrder.id} order={payOrder} onClose={() => setPayOrder(null)} onPaid={handlePaid} />}
    </>
  );
}