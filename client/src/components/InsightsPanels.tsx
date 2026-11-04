import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { exportFilename } from '../lib/analytics';
import { downloadCsv } from '../lib/download';
import { formatDate, money } from '../lib/format';
import type { InsightsReport } from '../types';

export function TopProductsCard({ report }: { report: InsightsReport }) {
  const [by, setBy] = useState<'units' | 'revenue'>('units');
  const list = by === 'units' ? report.topProducts.byUnits : report.topProducts.byRevenue;
  const value = (p: (typeof list)[number]) => (by === 'units' ? p.units : p.revenue);
  const max = Math.max(1, ...list.map(value));

  return (
    <section className="card insight-card" aria-label="Top products">
      <div className="admin-head" style={{ marginBottom: 8 }}>
        <h2>Top products</h2>
        <div className="seg" role="group" aria-label="Rank by">
          <button aria-pressed={by === 'units'} onClick={() => setBy('units')}>Units</button>
          <button aria-pressed={by === 'revenue'} onClick={() => setBy('revenue')}>Revenue</button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="muted">No paid orders in this period.</p>
      ) : (
        <ol className="rank-list">
          {list.map((p, i) => (
            <li key={p.id}>
              <span className="rank-n">{i + 1}</span>
              <div className="rank-body">
                <div className="rank-line">
                  <strong>{p.name}</strong>
                  <span>{by === 'units' ? `${p.units} sold` : money(p.revenue)}</span>
                </div>
                <div className="bar-track"><i style={{ width: `${(value(p) / max) * 100}%` }} /></div>
                <span className="muted small">
                  {p.category} · {by === 'units' ? money(p.revenue) : `${p.units} sold`}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="muted small">Paid orders only. Revenue is the item price times quantity, before order discounts and shipping.</p>
    </section>
  );
}

export function TopCustomersCard({ report }: { report: InsightsReport }) {
  return (
    <section className="card insight-card" aria-label="Top customers">
      <h2 style={{ marginBottom: 8 }}>Top customers</h2>
      {report.topCustomers.length === 0 ? (
        <p className="muted">No paid orders in this period.</p>
      ) : (
        <ol className="rank-list">
          {report.topCustomers.map((c, i) => (
            <li key={c.id}>
              <span className="rank-n">{i + 1}</span>
              <div className="rank-body">
                <div className="rank-line">
                  <Link to={`/admin/customers/${c.id}`}><strong>{c.name}</strong></Link>
                  <span>{money(c.spent)}</span>
                </div>
                <span className="muted small">
                  {c.email} · {c.orders} {c.orders === 1 ? 'order' : 'orders'} · last on {formatDate(c.lastOrderAt)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

interface LowStockProps {
  report: InsightsReport;
  thresholdText: string;
  thresholdValid: boolean;
  onThreshold: (text: string) => void;
}

export function LowStockCard({ report, thresholdText, thresholdValid, onThreshold }: LowStockProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const items = report.lowStock.items;

  return (
    <section className="card insight-card" aria-label="Low stock">
      <div className="admin-head" style={{ marginBottom: 8 }}>
        <h2>Low stock</h2>
        <label className="threshold">
          Alert at or below
          <input
            type="number"
            min={0}
            max={1000}
            value={thresholdText}
            onChange={(e) => onThreshold(e.target.value)}
            aria-invalid={!thresholdValid || undefined}
          />
        </label>
      </div>
      {!thresholdValid && <p className="field-error">Enter a whole number from 0 to 1000.</p>}

      {items.length === 0 ? (
        <p className="muted">Nothing is running low at {report.lowStock.threshold} or below.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>In stock</th>
              <th>Sold in 30 days</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <br />
                  <span className="muted small">{p.category}</span>
                </td>
                <td>
                  {p.stock} <span className={`badge ${p.stock === 0 ? 'badge-cancelled' : 'badge-low'}`}>{p.stock === 0 ? 'Out' : 'Low'}</span>
                </td>
                <td>{p.sold30}</td>
                <td>
                  <Link
                    className="link-btn link-brand"
                    to={isAdmin ? `/admin/products?edit=${p.id}` : `/admin/products?q=${encodeURIComponent(p.name)}`}
                  >
                    {isAdmin ? 'Restock' : 'View'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function ExportCard({ from, to, tz }: { from: string; to: string; tz: string }) {
  const [busy, setBusy] = useState<'orders' | 'customers' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function run(kind: 'orders' | 'customers') {
    setBusy(kind);
    setMessage(null);
    const zone = encodeURIComponent(tz);
    const path = kind === 'orders' ? `/export/orders.csv?from=${from}&to=${to}&tz=${zone}` : `/export/customers.csv?tz=${zone}`;
    try {
      const { truncated } = await downloadCsv(path, exportFilename(kind, from, to));
      setMessage({
        kind: 'ok',
        text: truncated ? 'Downloaded, but the file was cut at 50,000 rows. Narrow the date range.' : 'Download started.',
      });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Export failed' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card insight-card" aria-label="Export">
      <h2 style={{ marginBottom: 8 }}>Export</h2>
      <p className="muted small">CSV files open in Excel and Google Sheets. They contain customer details, so handle them with care.</p>
      <div className="row-gap">
        <button className="btn btn-secondary" onClick={() => run('orders')} disabled={busy !== null} aria-busy={busy === 'orders'}>
          <i className="ti ti-download" aria-hidden="true" /> {busy === 'orders' ? 'Preparing…' : 'Orders in this range'}
        </button>
        <button className="btn btn-secondary" onClick={() => run('customers')} disabled={busy !== null} aria-busy={busy === 'customers'}>
          <i className="ti ti-download" aria-hidden="true" /> {busy === 'customers' ? 'Preparing…' : 'All customers'}
        </button>
      </div>
      {message && (
        <p className={message.kind === 'ok' ? 'success' : 'alert-error'} role="status" style={{ marginTop: 12 }}>
          {message.text}
        </p>
      )}
    </section>
  );
}