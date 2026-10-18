import { useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { OrderDialog } from '../../components/OrderDialog';
import { Pagination } from '../../components/Pagination';
import { StatusBadge } from '../../components/StatusBadge';
import { StatusFilter } from '../../components/StatusFilter';
import { formatDate, itemsSummary, money } from '../../lib/format';
import { useDebounce } from '../../lib/useDebounce';
import { usePagedFetch } from '../../lib/usePagedFetch';
import { useUrlParams } from '../../lib/useUrlParams';
import { PaymentBadge } from '../../components/PaymentBadge';
import type { Order } from '../../types';

const DEFAULTS = { q: '', status: '', page: '1' };
const PAGE_SIZE = 10;

export default function OrdersPage() {
  const { user } = useAuth();
  const { values, update } = useUrlParams(DEFAULTS);
  const search = useDebounce(values.q, 300);
  const [selected, setSelected] = useState<Order | null>(null);

  const { data, loading, error, reload } = usePagedFetch<Order>('/orders', {
    status: values.status,
    search: search.trim(),
    page: values.page,
    limit: String(PAGE_SIZE),
  });

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
          value={values.q}
          onChange={(e) => update({ q: e.target.value }, { replace: true })}
          aria-label="Search orders"
        />
        <StatusFilter value={values.status} onChange={(status) => update({ status })} />
      </div>

      {!data && loading && <p className="muted">Loading orders…</p>}
      {error && <p className="alert-error" role="alert">{error}</p>}
      {data && data.items.length === 0 && <p className="muted">No orders found.</p>}

      {data && data.items.length > 0 && (
        <div className={`card table-wrap ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
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
                  <td><PaymentBadge status={o.paymentStatus} /></td>
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

      {data && (
        <Pagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          pageSize={PAGE_SIZE}
          onChange={(page) => update({ page: String(page) })}
        />
      )}

      {selected && (
        <OrderDialog
          key={selected.id}
          order={selected}
          canDelete={user?.role === 'admin'}
          onClose={() => setSelected(null)}
          onUpdated={() => {
            setSelected(null);
            reload();
          }}
          onDeleted={() => {
            setSelected(null);
            reload();
          }}
        />
      )}
    </>
  );
}