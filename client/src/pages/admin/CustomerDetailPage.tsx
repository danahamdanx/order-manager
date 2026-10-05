import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { Avatar } from '../../components/Avatar';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate, itemsSummary, money } from '../../lib/format';
import type { CustomerDetail } from '../../types';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<CustomerDetail>(`/customers/${id}`, controller.signal)
      .then(setCustomer)
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
        <Link to="/admin/customers">Back to customers</Link>
      </div>
    );
  }
  if (!customer) return <p className="muted">Loading…</p>;

  const spent = customer.orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0);

  return (
    <>
      <p>
        <Link to="/admin/customers">
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back to customers
        </Link>
      </p>

      <div className="card cust-head">
        <Avatar id={customer.id} name={customer.name} size={56} />
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>{customer.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            <i className="ti ti-mail" aria-hidden="true" /> {customer.email}
            {customer.phone && <> · <i className="ti ti-phone" aria-hidden="true" /> {customer.phone}</>}
          </p>
          <p className="muted" style={{ margin: 0 }}>Customer since {formatDate(customer.createdAt)}</p>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: '1fr 1fr', margin: '16px 0' }}>
        <div className="stat stat-amber"><p>Orders</p><strong>{customer.orders.length}</strong></div>
        <div className="stat stat-green" style={{ animationDelay: '0.1s' }}><p>Total spent</p><strong>{money(spent)}</strong></div>
      </div>

      <div className="card table-wrap">
        {customer.orders.length === 0 ? (
          <p className="muted">This customer has no orders yet.</p>
        ) : (
          <table>
            <thead>
              <tr><th>ID</th><th>Items</th><th>Total</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {customer.orders.map((o) => (
                <tr key={o.id}>
                  <td>#{o.id}</td>
                  <td>{itemsSummary(o.items)}</td>
                  <td>{money(o.total)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}