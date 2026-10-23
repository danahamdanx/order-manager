import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/useAuth';
import { Logo } from '../components/Logo';
import { BRAND_LABELS } from '../lib/card';
import type { CardBrand } from '../lib/card';
import { formatDateTime, money } from '../lib/format';
import type { Order } from '../types';

export default function ReceiptPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<Order>(`/orders/${id}`, controller.signal)
      .then(setOrder)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      });
    return () => controller.abort();
  }, [id]);

  const backTo = user?.role === 'customer' ? '/my-orders' : '/admin/orders';

  if (error) {
    return (
      <div className="receipt-page">
        <p className="alert-error" role="alert">{error}</p>
        <Link to={backTo}>Back</Link>
      </div>
    );
  }
  if (!order) return <div className="receipt-page"><p className="muted">Loading receipt…</p></div>;

  const issued = order.paymentStatus === 'paid' || order.paymentStatus === 'refunded';
  const refunded = order.paymentStatus === 'refunded';
  const number = `OD-${String(order.id).padStart(6, '0')}`;
  const cardLabel = order.cardLast4
    ? `${BRAND_LABELS[(order.cardBrand as CardBrand) ?? 'other'] ?? 'Card'} •••• ${order.cardLast4}`
    : 'Card';

  return (
    <div className="receipt-page">
      <div className="receipt-bar no-print">
        <Link to={backTo}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </Link>
        {issued && (
          <button className="btn btn-primary" onClick={() => window.print()}>
            <i className="ti ti-printer" aria-hidden="true" /> Print or save as PDF
          </button>
        )}
      </div>

      {!issued ? (
        <div className="card">
          <h1 className="page-title">No receipt yet</h1>
          <p className="muted">A receipt is available once the order is paid.</p>
        </div>
      ) : (
        <article className="receipt" aria-label={`Receipt ${number}`}>
          <header className="receipt-head">
            <div>
              <Logo size={34} />
              <p className="muted small">OrderDesk demo store</p>
            </div>
            <div className="receipt-meta">
              <span className={`stamp ${refunded ? 'stamp-refunded' : 'stamp-paid'}`}>{refunded ? 'REFUNDED' : 'PAID'}</span>
              <h1>Receipt {number}</h1>
              {order.paidAt && <p className="muted">Paid on {formatDateTime(order.paidAt)}</p>}
            </div>
          </header>

          <section className="receipt-parties">
            <div>
              <h2>Billed to</h2>
              <p>{order.customerName}<br />{order.customerEmail}</p>
            </div>
            <div>
              <h2>Delivery address</h2>
              <p>{order.address}</p>
            </div>
          </section>

          <table>
            <thead>
              <tr><th>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Amount</th></tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.productId}>
                  <td>{i.productName}</td>
                  <td className="num">{i.quantity}</td>
                  <td className="num">{money(i.unitPrice)}</td>
                  <td className="num">{money(i.unitPrice * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="receipt-totals">
            <div className="sum-row"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
            {order.discount > 0 && (
              <div className="sum-row">
                <span>Discount{order.discountCode ? ` (${order.discountCode})` : ''}</span>
                <span>-{money(order.discount)}</span>
              </div>
            )}
            <div className="sum-row"><span>Shipping</span><span>{money(order.shipping)}</span></div>
            <div className="sum-row sum-total"><span>Total</span><span>{money(order.total)}</span></div>
            {refunded && (
              <div className="sum-row">
                <span>Refunded{order.refundedAt ? ` on ${formatDateTime(order.refundedAt)}` : ''}</span>
                <span>-{money(order.total)}</span>
              </div>
            )}
          </div>

          <footer className="receipt-foot">
            <p>Payment method: {cardLabel}</p>
            <p className="muted small">This is a demo store. No real payment was made and this is not a tax invoice.</p>
          </footer>
        </article>
      )}
    </div>
  );
}