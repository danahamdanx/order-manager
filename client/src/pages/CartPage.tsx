import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth/useAuth';
import { SHIPPING } from '../cart/context';
import { useCart } from '../cart/useCart';
import { CardForm } from '../components/CardForm';
import { ProductImage } from '../components/ProductImage';
import { emptyCard, validateCard } from '../lib/card';
import type { CardErrors, CardFields } from '../lib/card';
import { money } from '../lib/format';
import { STEP_LABELS, outcomeNotice } from '../lib/payments';
import { usePayment } from '../lib/usePayment';
import { useQuote } from '../lib/useQuote';
import type { Order } from '../types';

export default function CartPage() {
  const { lines, subtotal, setQuantity, remove, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state: payState, pay } = usePayment();

  const [address, setAddress] = useState('');
  const [card, setCard] = useState<CardFields>(emptyCard);
  const [cardErrors, setCardErrors] = useState<CardErrors>({});
  const [codeInput, setCodeInput] = useState('');
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const isCustomer = user?.role === 'customer';
  const { quote, error: quoteError, loading: quoting } = useQuote(lines, appliedCode, isCustomer && lines.length > 0);

  // لو السيرفر رد، بنعرض أرقامه. وإلا (زائر) بنعرض حساب تقريبي
  const shownSubtotal = quote?.subtotal ?? subtotal;
  const discount = quote?.discount ?? 0;
  const shipping = quote?.shipping ?? SHIPPING;
  const total = quote?.total ?? Math.round((subtotal + SHIPPING) * 100) / 100;
  const unitPrice = (productId: number, fallback: number) =>
    quote?.items.find((i) => i.productId === productId)?.unitPrice ?? fallback;

  if (lines.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h1 className="page-title">Your cart is empty</h1>
        <p className="muted">Add something from the shop to get started.</p>
        <Link to="/shop" className="btn btn-primary">Go to the shop</Link>
      </div>
    );
  }

  function applyCode() {
    const value = codeInput.trim();
    if (value) setAppliedCode(value);
  }

  function removeCode() {
    setAppliedCode(null);
    setCodeInput('');
  }

  async function placeOrder() {
    const cardProblems = validateCard(card);
    setCardErrors(cardProblems);
    const addressOk = address.trim().length >= 5;
    if (!addressOk || Object.keys(cardProblems).length > 0) {
      setError(!addressOk ? 'Enter your delivery address (at least 5 characters)' : 'Check your card details');
      return;
    }
    if (!quote) {
      setError(quoteError ?? 'We are still calculating your total. Try again in a moment.');
      return;
    }
    setError(null);
    setPlacing(true);

    let order: Order;
    try {
      order = await api.post<Order>('/orders', {
        address: address.trim(),
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        code: quote.code ?? undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? [err.message, ...err.details].join(': ') : 'Something went wrong');
      setPlacing(false);
      return;
    }

    // الطلب انعمل. السلة بتضل ظاهرة لحد ما نعرف نتيجة الدفع
    const outcome = await pay(order.id, card);
    clear();

    if (outcome?.kind === 'succeeded') {
      navigate('/my-orders', { state: { highlight: order.id, notice: 'Payment received. Thank you for your order!' } });
    } else {
      navigate('/my-orders', {
        state: {
          highlight: order.id,
          openPay: true,
          noticeKind: 'error',
          notice: `Your order #${order.id} is saved, but the payment did not go through. ${outcomeNotice(outcome)}`,
        },
      });
    }
  }

  return (
    <div className="cart">
      <section className="card">
        <h1 className="page-title">Your cart</h1>
        {lines.map(({ product, quantity }) => {
          const price = unitPrice(product.id, product.price);
          return (
            <div className="line" key={product.id}>
              <ProductImage product={product} size="sm" />
              <div className="line-info">
                <strong>{product.name}</strong>
                <p className="muted" style={{ margin: 0 }}>{money(price)} each</p>
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
              <strong className="line-total">{money(price * quantity)}</strong>
            </div>
          );
        })}
      </section>

      <aside className="card">
        <h2 className="page-title" style={{ fontSize: 18 }}>Order summary</h2>
        <div className="sum-row"><span>Subtotal</span><span>{money(shownSubtotal)}</span></div>
        {discount > 0 && (
          <div className="sum-row sum-discount">
            <span>Discount{quote?.code ? ` (${quote.code})` : ''}</span>
            <span>-{money(discount)}</span>
          </div>
        )}
        <div className="sum-row"><span>Shipping</span><span>{money(shipping)}</span></div>
        <div className="sum-row sum-total">
          <span>Total</span>
          <span>{money(total)}{quoting ? '…' : ''}</span>
        </div>

        {isCustomer ? (
          <>
            {quoteError && <p className="alert-error" role="alert" style={{ marginTop: 12 }}>{quoteError}</p>}

            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="code">Discount code</label>
              <div className="code-row">
                <input
                  id="code"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!appliedCode) applyCode();
                    }
                  }}
                  disabled={placing || appliedCode !== null}
                  autoComplete="off"
                />
                {appliedCode ? (
                  <button type="button" className="btn btn-secondary" onClick={removeCode} disabled={placing}>
                    Remove
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary" onClick={applyCode} disabled={!codeInput.trim() || placing}>
                    Apply
                  </button>
                )}
              </div>
              {appliedCode && quote?.codeError && <span className="field-error">{quote.codeError}</span>}
              {appliedCode && quote?.code && <span className="field-ok">Code {quote.code} applied.</span>}
            </div>

            <div className="field">
              <label htmlFor="address">Delivery address</label>
              <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
            </div>

            <CardForm value={card} errors={cardErrors} onChange={setCard} disabled={placing} />

            {error && <p className="alert-error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-block" onClick={placeOrder} disabled={placing}>
              {placing
                ? payState.phase === 'working'
                  ? STEP_LABELS[payState.step]
                  : 'Creating your order…'
                : `Pay ${money(total)} and place order`}
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