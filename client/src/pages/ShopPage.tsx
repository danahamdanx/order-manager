import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../cart/useCart';
import { ProductTile } from '../components/ProductTile';
import { money } from '../lib/format';
import type { Product } from '../types';

function ProductCard({ product }: { product: Product }) {
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
        <ProductTile product={product} />
        <h3>{product.name}</h3>
      </Link>
      <p className="muted">{product.category}</p>
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

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<Product[]>('/products', controller.signal)
      .then(setProducts)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const categories = useMemo(() => ['', ...new Set(products.map((p) => p.category))], [products]);

  // الكتالوج صغير، فبنفلتر بالمتصفح. السيرفر كمان بيدعم الفلترة لو كبر
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!category || p.category === category) &&
        (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
    );
  }, [products, category, search]);

  return (
    <>
      <section className="hero">
        <div>
          <h1>New desk setup deals</h1>
          <p>Keyboards, hubs and monitors.</p>
        </div>
        <i className="ti ti-device-desktop float" aria-hidden="true" />
      </section>

      <div className="controls">
        <input
          className="search"
          type="search"
          placeholder="Search products"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search products"
        />
        <div className="filters" role="group" aria-label="Filter by category">
          {categories.map((c) => (
            <button
              key={c || 'all'}
              className={`chip ${category === c ? 'active' : ''}`}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="muted">Loading products…</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {!loading && !error && visible.length === 0 && <p className="muted">No products found.</p>}

      <div className="grid">
        {visible.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </>
  );
}