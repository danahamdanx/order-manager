import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useCart } from '../cart/useCart';
import { Pagination } from '../components/Pagination';
import { ProductImage } from '../components/ProductImage';
import { money } from '../lib/format';
import { useDebounce } from '../lib/useDebounce';
import { usePagedFetch } from '../lib/usePagedFetch';
import { useSlowLoading } from '../lib/useSlowLoading';
import { useUrlParams } from '../lib/useUrlParams';
import { SORT_OPTIONS } from '../types';
import type { Category, Product } from '../types';

const DEFAULTS = { q: '', category: '', sort: 'newest', page: '1' };
const PAGE_SIZE = 12;

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
  const { values, update } = useUrlParams(DEFAULTS);
  const search = useDebounce(values.q, 300);
  const [categories, setCategories] = useState<Category[]>([]);

  const { data, loading, error } = usePagedFetch<Product>('/products', {
    category: values.category,
    sort: values.sort,
    search: search.trim(),
    page: values.page,
    limit: String(PAGE_SIZE),
  });
  const slow = useSlowLoading(loading && !data);

  // التصنيفات بتيجي من السيرفر، فالفلاتر ما بتتأثر بالمنتجات المعروضة
  useEffect(() => {
    api
      .get<Category[]>('/categories')
      .then(setCategories)
      .catch(() => {
        // الفلاتر اختيارية، فإذا فشلت الصفحة بتضل شغالة بدونها
      });
  }, []);

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
            value={values.q}
            onChange={(e) => update({ q: e.target.value }, { replace: true })}
            aria-label="Search products"
          />
          <select value={values.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort products">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="filters" role="group" aria-label="Filter by category">
          {[{ name: '', count: 0 }, ...categories].map((c) => (
            <button
              key={c.name || 'all'}
              className={`chip ${values.category === c.name ? 'active' : ''}`}
              aria-pressed={values.category === c.name}
              onClick={() => update({ category: c.name })}
            >
              {c.name || 'All'}
            </button>
          ))}
        </div>
      </div>

      {!data && loading && (
        <p className="muted">
          {slow ? 'Waking up the server. The first visit can take up to a minute…' : 'Loading products…'}
        </p>
      )}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {data && data.items.length === 0 && <p className="muted">No products found.</p>}

      {data && (
        <div className={`grid ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
          {data.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {data && (
        <Pagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          pageSize={PAGE_SIZE}
          onChange={(page) => {
            update({ page: String(page) });
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </>
  );
}