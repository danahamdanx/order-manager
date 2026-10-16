import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Pagination } from '../../components/Pagination';
import { money } from '../../lib/format';
import { useDebounce } from '../../lib/useDebounce';
import { usePagedFetch } from '../../lib/usePagedFetch';
import { useUrlParams } from '../../lib/useUrlParams';
import type { Customer } from '../../types';

const DEFAULTS = { q: '', page: '1' };
const PAGE_SIZE = 12;

export default function CustomersPage() {
  const { values, update } = useUrlParams(DEFAULTS);
  const search = useDebounce(values.q, 300);

  const { data, loading, error } = usePagedFetch<Customer>('/customers', {
    search: search.trim(),
    page: values.page,
    limit: String(PAGE_SIZE),
  });

  return (
    <>
      <div className="admin-head">
        <h1 className="page-title">Customers</h1>
      </div>

      <div className="controls">
        <input
          className="search"
          type="search"
          placeholder="Search by name or email"
          value={values.q}
          onChange={(e) => update({ q: e.target.value }, { replace: true })}
          aria-label="Search customers"
        />
      </div>

      {!data && loading && <p className="muted">Loading customers…</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {data && data.items.length === 0 && <p className="muted">No customers found.</p>}

      {data && (
        <div className={`grid ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
          {data.items.map((c, i) => (
            <Link
              key={c.id}
              to={`/admin/customers/${c.id}`}
              className="card cust-card"
              style={{ animationDelay: `${Math.min(i, 8) * 0.05}s` }}
            >
              <Avatar id={c.id} name={c.name} />
              <div style={{ minWidth: 0 }}>
                <strong>{c.name}</strong>
                <p className="muted cust-line">{c.email}</p>
                <p className="muted cust-line">
                  {c.ordersCount} {c.ordersCount === 1 ? 'order' : 'orders'} · {money(c.totalSpent)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data && (
        <Pagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          pageSize={PAGE_SIZE}
          onChange={(page) => update({ page: String(page) })}
        />
      )}
    </>
  );
}