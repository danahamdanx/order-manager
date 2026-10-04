import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/useAuth';
import { SHIPPING } from '../cart/context';
import { useCart } from '../cart/useCart';
import { ProductTile } from '../components/ProductTile';
import { money } from '../lib/format';
import type { Order } from '../types';

export default function CartPage() {
  const { lines, subtotal, setQuantity, remove, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const total = Math.round((subtotal + SHIPPING) * 100) / 100;

  if (lines.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h1 className="page-title">Your cart is empty</h1>
        <p className="muted">Add something from the shop to get started.</p>
        <Link to="/shop" className="btn btn-primary">Go to the shop</Link>
      </div>
    );
  }

  async function placeOrder() {
    if (address.trim().length < 5) {
      setError('Enter your delivery address (at least 5 characters)');
      return;
    }
    setError(null);
    setPlacing(true);
    try {
      const order = await api.post<Order>('/orders', {
        address: address.trim(),
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      });
      clear();
      navigate('/my-orders', { state: { highlight: order.id } });
    } catch (err) {
      setError(err instanceof ApiError ? [err.message, ...err.details].join(': ') : 'Something went wrong');
      setPlacing(false);
    }
  }

  return (
    <div className="cart">
      <section className="card">
        <h1 className="page-title">Your cart</h1>
        {lines.map(({ product, quantity }) => (
          <div className="line" key={product.id}>
            <ProductTile product={product} size="sm" />
            <div className="line-info">
              <strong>{product.name}</strong>
              <p className="muted" style={{ margin: 0 }}>{money(product.price)} each</p>
              <button className="link-btn" onClick={() => remove(product.id)}>Remove</button>
            </div>
            <div className="stepper">
              <button onClick={() => setQuantity(product.id, quantity - 1)} disabled={quantity <= 1} aria-label={`Decrease ${product.name}`}>
                <i className="ti ti-minus" />
              </button>
              <strong>{quantity}</strong>
              <button
                onClick={() => setQuantity(product.id, quantity + 1)}
                disabled={quantity >= Math.min(product.stock, 20)}
                aria-label={`Increase ${product.name}`}
              >
                <i className="ti ti-plus" />
              </button>
            </div>
            <strong className="line-total">{money(product.price * quantity)}</strong>
          </div>
        ))}
      </section>

      <aside className="card">
        <h2 className="page-title" style={{ fontSize: 18 }}>Order summary</h2>
        <div className="sum-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
        <div className="sum-row"><span>Shipping</span><span>{money(SHIPPING)}</span></div>
        <div className="sum-row sum-total"><span>Total</span><span>{money(total)}</span></div>

        {user?.role === 'customer' ? (
          <>
            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="address">Delivery address</label>
              <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
            </div>
            {error && <p className="alert-error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-block" onClick={placeOrder} disabled={placing}>
              {placing ? 'Placing order…' : 'Place order'}
            </button>
          </>
        ) : user ? (
          <p className="alert-error" style={{ marginTop: 14 }}>
            Staff accounts can't place orders. Sign in with a customer account.
          </p>
        ) : (
          <div style={{ marginTop: 14 }}>
            <p className="muted">Sign in to place your order.</p>
            <Link to="/login" state={{ from: '/cart' }} className="btn btn-primary btn-block">Sign in</Link>
            <p className="muted" style={{ textAlign: 'center' }}>
              New here? <Link to="/register" state={{ from: '/cart' }}>Create an account</Link>
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}