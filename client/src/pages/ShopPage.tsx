import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../cart/useCart';
import { ProductImage } from '../components/ProductImage';
import { money } from '../lib/format';
import { useDebounce } from '../lib/useDebounce';
import { useSlowLoading } from '../lib/useSlowLoading';
import { SORT_OPTIONS } from '../types';
import type { Category, Product } from '../types';

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
        <ProductImage product={product} />
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const slow = useSlowLoading(loading);

  // التصنيفات بتيجي من السيرفر (الفلاتر ما بتتأثر بالمنتجات المعروضة)
  useEffect(() => {
    api
      .get<Category[]>('/categories')
      .then(setCategories)
      .catch(() => {
        // الفلاتر اختيارية، فإذا فشلت الصفحة بتضل شغالة بدونها
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({ sort });
    if (category) query.set('category', category);
    if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim());

    api
      .get<Product[]>(`/products?${query}`, controller.signal)
      .then(setProducts)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [category, sort, debouncedSearch]);

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
        <div className="controls-row">
          <input
            className="search"
            type="search"
            placeholder="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search products"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort products">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="filters" role="group" aria-label="Filter by category">
          {[{ name: '', count: 0 }, ...categories].map((c) => (
            <button
              key={c.name || 'all'}
              className={`chip ${category === c.name ? 'active' : ''}`}
              aria-pressed={category === c.name}
              onClick={() => setCategory(c.name)}
            >
              {c.name || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="muted">
          {slow ? 'Waking up the server. The first visit can take up to a minute…' : 'Loading products…'}
        </p>
      )}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {!loading && !error && products.length === 0 && <p className="muted">No products found.</p>}

      <div className="grid">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </>
  );
}