import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth/useAuth';
import { CountUp } from '../../components/CountUp';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDate, money } from '../../lib/format';
import { STATUSES } from '../../types';
import type { Order, Stats } from '../../types';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api.get<Stats>('/stats', controller.signal), api.get<Order[]>('/orders', controller.signal)])
      .then(([s, orders]) => {
        setStats(s);
        setRecent(orders.slice(0, 5));
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      });
    return () => controller.abort();
  }, []);

  if (error) return <p className="alert-error" role="alert">{error}</p>;
  if (!stats) return <p className="muted">Loading dashboard…</p>;

  const max = Math.max(1, ...Object.values(stats.byStatus));

  return (
    <>
      <div className="admin-head">
        <h1 className="page-title">{greeting()}, {user?.name.split(' ')[0]}</h1>
      </div>

      <div className="stats">
        <div className="stat stat-amber"><p>Total orders</p><strong><CountUp value={stats.totalOrders} /></strong></div>
        <div className="stat stat-blue" style={{ animationDelay: '0.1s' }}><p>Revenue</p><strong><CountUp value={stats.revenue} decimals={2} prefix="$" /></strong></div>
        <div className="stat stat-purple" style={{ animationDelay: '0.2s' }}><p>Customers</p><strong><CountUp value={stats.customers} /></strong></div>
        <div className="stat stat-coral" style={{ animationDelay: '0.3s' }}><p>Pending</p><strong><CountUp value={stats.byStatus.pending} /></strong></div>
      </div>

      <div className="two-col">
        <section className="card">
          <h2 className="section-title">Orders by status</h2>
          {STATUSES.map((s) => (
            <div className="bar-row" key={s}>
              <span>{s}</span>
              <div className="bar-track"><i style={{ width: `${(stats.byStatus[s] / max) * 100}%` }} /></div>
              <span>{stats.byStatus[s]}</span>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="admin-head" style={{ marginBottom: 4 }}>
            <h2 className="section-title">Recent orders</h2>
            <Link to="/admin/orders">View all</Link>
          </div>
          {recent.map((o) => (
            <div className="recent-row" key={o.id}>
              <span>
                <strong>#{o.id}</strong> {o.customerName}
                <br />
                <span className="muted">{money(o.total)} · {formatDate(o.createdAt)}</span>
              </span>
              <StatusBadge status={o.status} />
            </div>
          ))}
        </section>
      </div>
    </>
  );
}