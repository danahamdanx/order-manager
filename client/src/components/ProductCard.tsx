import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../cart/useCart';
import { money } from '../lib/format';
import type { Product } from '../types';
import { ProductImage } from './ProductImage';

interface Props {
  product: Product;
  reason?: string;
}

export function ProductCard({ product, reason }: Props) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1200);
    return () => clearTimeout(timer);
  }, [added]);

  const out = product.stock === 0;

  return (
    <article className="card product">
      <Link to={`/shop/${product.id}`} className="product-link">
        <ProductImage product={product} />
        <h3>{product.name}</h3>
      </Link>
      <p className="muted">{product.category}</p>
      {reason && (
        <p className="reason">
          <i className="ti ti-sparkles" aria-hidden="true" /> {reason}
        </p>
      )}
      <div className="product-foot">
        <strong>{money(product.price)}</strong>
        {out ? (
          <span className="badge badge-cancelled">Out of stock</span>
        ) : (
          <button
            className="btn btn-primary"
            onClick={() => {
              add(product);
              setAdded(true);
            }}
          >
            {added ? 'Added' : 'Add'}
          </button>
        )}
      </div>
      {!out && product.stock <= 5 && <p className="low-stock">Only {product.stock} left</p>}
    </article>
  );
}