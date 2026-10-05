import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth/useAuth';
import { OrderDialog } from '../../components/OrderDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { formatDate, itemsSummary, money } from '../../lib/format';
import { useDebounce } from '../../lib/useDebounce';
import type { Order } from '../../types';

export default function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selected, setSelected] = useState<Order | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim());

    api
      .get<Order[]>(`/orders?${query}`, controller.signal)
      .then(setOrders)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [status, debouncedSearch]);

  function handleUpdated(updated: Order) {
    setOrders((prev) =>
      prev.map((o) => (o.id === updated.id ? updated : o)).filter((o) => !status || o.status === status),
    );
    setSelected(null);
  }

  function handleDeleted(id: number) {
    setOrders((prev) => prev.filter((o) => o.id !== id));
    setSelected(null);
  }

  return (
    <>
      <div className="admin-head">
        <h1 className="page-title">Orders</h1>
      </div>

      <div className="controls">
        <input
          className="search"
          type="search"
          placeholder="Search by customer, email or order ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search orders"
        />
        <StatusFilter value={status} onChange={setStatus} />
      </div>

      {loading && <p className="muted">Loading orders…</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {!loading && !error && orders.length === 0 && <p className="muted">No orders found.</p>}

      {!loading && !error && orders.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>#{o.id}</td>
                  <td>
                    <strong>{o.customerName}</strong>
                    <br />
                    <span className="muted">{o.customerEmail}</span>
                  </td>
                  <td>{itemsSummary(o.items)}</td>
                  <td>{money(o.total)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{formatDate(o.createdAt)}</td>
                  <td>
                    <button className="link-btn link-brand" onClick={() => setSelected(o)} aria-label={`View order ${o.id}`}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <OrderDialog
          key={selected.id}
          order={selected}
          canDelete={user?.role === 'admin'}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}