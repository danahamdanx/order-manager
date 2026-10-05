import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Avatar } from '../../components/Avatar';
import { money } from '../../lib/format';
import { useDebounce } from '../../lib/useDebounce';
import type { Customer } from '../../types';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim());

    api
      .get<Customer[]>(`/customers?${query}`, controller.signal)
      .then(setCustomers)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedSearch]);

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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search customers"
        />
      </div>

      {loading && <p className="muted">Loading customers…</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {!loading && !error && customers.length === 0 && <p className="muted">No customers found.</p>}

      <div className="grid">
        {customers.map((c, i) => (
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
    </>
  );
}