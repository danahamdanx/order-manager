import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../cart/useCart';
import { ProductTile } from '../components/ProductTile';
import { money } from '../lib/format';
import type { Product } from '../types';

export default function ProductPage() {
  const { id } = useParams();
  const { add } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<Product>(`/products/${id}`, controller.signal)
      .then(setProduct)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      });
    return () => controller.abort();
  }, [id]);

  if (error) {
    return (
      <div className="card">
        <p className="alert-error">{error}</p>
        <Link to="/shop">Back to the shop</Link>
      </div>
    );
  }
  if (!product) return <p className="muted">Loading…</p>;

  const max = Math.min(product.stock, 20);

  return (
    <>
      <p>
        <Link to="/shop">
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back to the shop
        </Link>
      </p>
      <div className="card detail">
        <ProductTile product={product} size="lg" />
        <div>
          {product.stock > 0 ? (
            <span className="badge badge-delivered">In stock</span>
          ) : (
            <span className="badge badge-cancelled">Out of stock</span>
          )}
          <h1 className="page-title" style={{ marginTop: 8 }}>{product.name}</h1>
          <p className="price">{money(product.price)}</p>
          <p className="muted">{product.description}</p>

          {product.stock > 0 && (
            <div className="row-gap">
              <div className="stepper">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity">
                  <i className="ti ti-minus" />
                </button>
                <strong>{qty}</strong>
                <button onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={qty >= max} aria-label="Increase quantity">
                  <i className="ti ti-plus" />
                </button>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  add(product, qty);
                  setAdded(true);
                }}
              >
                <i className="ti ti-shopping-cart-plus" aria-hidden="true" /> Add to cart
              </button>
            </div>
          )}
          {added && (
            <p className="success-note">
              Added to your cart. <Link to="/cart">View cart</Link>
            </p>
          )}
        </div>
      </div>
    </>
  );
}