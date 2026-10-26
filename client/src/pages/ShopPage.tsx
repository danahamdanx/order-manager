import { useEffect, useState } from 'react';
import { api } from '../api';
import { Pagination } from '../components/Pagination';
import { ProductCard } from '../components/ProductCard';
import { Recommendations } from '../components/Recommendations';
import { useDebounce } from '../lib/useDebounce';
import { usePagedFetch } from '../lib/usePagedFetch';
import { useSlowLoading } from '../lib/useSlowLoading';
import { useUrlParams } from '../lib/useUrlParams';
import { SORT_OPTIONS } from '../types';
import type { Category, Product } from '../types';

const DEFAULTS = { q: '', category: '', sort: 'newest', page: '1' };
const PAGE_SIZE = 12;

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

  // التوصيات بس لما الزبون ما يكون عامل بحث أو فلتر، وبالصفحة الأولى
  const showRecommendations = !values.q && !values.category && values.page === '1';

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

      {showRecommendations && (
        <Recommendations title="Recommended for you" genericTitle="Popular right now" limit={4} />
      )}

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