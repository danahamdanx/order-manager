import { useMemo, useState } from 'react';
import { ExportCard, LowStockCard, TopCustomersCard, TopProductsCard } from '../../components/InsightsPanels';
import { MetricChart } from '../../components/MetricChart';
import {
  PRESETS,
  formatMoneyShort,
  formatPeriod,
  localISO,
  parseThresholdInput,
  resolveRange,
  validateRange,
} from '../../lib/analytics';
import { formatDate, money } from '../../lib/format';
import { useDebounce } from '../../lib/useDebounce';
import { useInsights } from '../../lib/useInsights';
import { useSalesReport } from '../../lib/useSalesReport';
import { useUrlParams } from '../../lib/useUrlParams';
import type { SalesReport } from '../../types';

const DEFAULTS = { range: '30', from: '', to: '', g: '' };

function Kpi({ label, value, change, previous }: { label: string; value: string; change: number | null; previous: string }) {
  const direction = change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down';
  const icon = direction === 'up' ? 'ti-trending-up' : direction === 'down' ? 'ti-trending-down' : 'ti-minus';
  return (
    <div className="kpi">
      <p className="muted">{label}</p>
      <strong>{value}</strong>
      <span className={`delta ${direction}`}>
        <i className={`ti ${icon}`} aria-hidden="true" />{' '}
        {change === null ? 'No comparison' : `${change > 0 ? '+' : ''}${change}%`}
      </span>
      <p className="muted small">vs {previous}</p>
    </div>
  );
}

function DataTable({ report }: { report: SalesReport }) {
  return (
    <details className="data-table">
      <summary>Show the data as a table</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{report.range.granularity === 'week' ? 'Week of' : 'Date'}</th>
              <th>Orders</th>
              <th>Paid orders</th>
              <th>Revenue</th>
              <th>Average order</th>
              <th>New customers</th>
            </tr>
          </thead>
          <tbody>
            {report.series.map((p) => (
              <tr key={p.date}>
                <td>{formatDate(`${p.date}T12:00:00Z`)}</td>
                <td>{p.orders}</td>
                <td>{p.paidOrders}</td>
                <td>{money(p.revenue)}</td>
                <td>{p.aov === null ? '—' : money(p.aov)}</td>
                <td>{p.newCustomers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function AnalyticsPage() {
  const { values, update } = useUrlParams(DEFAULTS);
  const today = useMemo(() => localISO(new Date()), []);
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

  const { from, to, granularity } = resolveRange(values, today);
  const problem = validateRange(from, to, today, granularity);

  // حد المخزون: تفضيل محلي (مش بالرابط)، بنستنى المستخدم يخلص كتابة
  const [stockText, setStockText] = useState('5');
  const debouncedStock = useDebounce(stockText, 300);
  const threshold = parseThresholdInput(debouncedStock);

  const sales = useSalesReport({ from, to, granularity, tz, enabled: problem === null });
  const insights = useInsights({ from, to, tz, threshold: threshold ?? 5, enabled: problem === null });

  const data = sales.data;
  const empty = data && data.totals.orders === 0 && data.totals.revenue === 0 && data.totals.newCustomers === 0;
  const previous = data ? formatPeriod(data.previous.from, data.previous.to) : '';

  return (
    <>
      <div className="admin-head">
        <h1 className="page-title">Analytics</h1>
      </div>

      <div className="range-bar">
        <div className="filters" role="group" aria-label="Date range">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={`chip ${values.range === p.key ? 'active' : ''}`}
              aria-pressed={values.range === p.key}
              onClick={() => update({ range: p.key, from: '', to: '' })}
            >
              {p.label}
            </button>
          ))}
          <button
            className={`chip ${values.range === 'custom' ? 'active' : ''}`}
            aria-pressed={values.range === 'custom'}
            onClick={() => update({ range: 'custom', from, to })}
          >
            Custom
          </button>
        </div>

        <div className="range-dates">
          <label>
            <span className="sr-only">From</span>
            <input type="date" value={from} max={today} onChange={(e) => update({ range: 'custom', from: e.target.value, to })} />
          </label>
          <span aria-hidden="true">–</span>
          <label>
            <span className="sr-only">To</span>
            <input type="date" value={to} max={today} onChange={(e) => update({ range: 'custom', from, to: e.target.value })} />
          </label>
        </div>

        <div className="seg" role="group" aria-label="Group by">
          <button aria-pressed={values.g === ''} onClick={() => update({ g: '' })}>Auto</button>
          <button aria-pressed={values.g === 'day'} onClick={() => update({ g: 'day' })}>Daily</button>
          <button aria-pressed={values.g === 'week'} onClick={() => update({ g: 'week' })}>Weekly</button>
        </div>
      </div>

      {problem && <p className="alert-error" role="alert">{problem}</p>}
      {sales.error && <p className="alert-error" role="alert">{sales.error}</p>}
      {!problem && !data && sales.loading && <p className="muted">Loading analytics…</p>}

      {!problem && data && (
        <div className={sales.loading ? 'is-loading' : ''} aria-busy={sales.loading}>
          <p className="muted">
            {formatPeriod(data.range.from, data.range.to)} · {data.range.granularity === 'week' ? 'weekly' : 'daily'} · time zone {data.range.tz}
          </p>

          <div className="kpis">
            <Kpi label="Revenue" value={money(data.totals.revenue)} change={data.changes.revenue} previous={previous} />
            <Kpi label="Orders" value={String(data.totals.orders)} change={data.changes.orders} previous={previous} />
            <Kpi label="Average order value" value={data.totals.aov === null ? '—' : money(data.totals.aov)} change={data.changes.aov} previous={previous} />
            <Kpi label="New customers" value={String(data.totals.newCustomers)} change={data.changes.newCustomers} previous={previous} />
          </div>

          {empty ? (
            <div className="card" style={{ textAlign: 'center' }}>
              <h2 className="page-title">No activity in this period</h2>
              <p className="muted">There are no orders or new customers between these dates. Try a wider range.</p>
            </div>
          ) : (
            <>
              <div className="charts">
                <MetricChart title="Revenue" data={data.series} dataKey="revenue" kind="line" color="#0f6e56" granularity={data.range.granularity} format={money} axisFormat={formatMoneyShort} decimals />
                <MetricChart title="Orders" data={data.series} dataKey="orders" kind="bar" color="#378add" granularity={data.range.granularity} format={(n) => String(n)} />
                <MetricChart title="Average order value" data={data.series} dataKey="aov" kind="line" color="#ba7517" granularity={data.range.granularity} format={money} axisFormat={formatMoneyShort} decimals />
                <MetricChart title="New customers" data={data.series} dataKey="newCustomers" kind="bar" color="#7f77dd" granularity={data.range.granularity} format={(n) => String(n)} />
              </div>
              <DataTable report={data} />
            </>
          )}
        </div>
      )}

      {!problem && insights.error && <p className="alert-error" role="alert">{insights.error}</p>}
      {!problem && !insights.data && insights.loading && <p className="muted">Loading insights…</p>}

      {!problem && insights.data && (
        <div className={`insights ${insights.loading ? 'is-loading' : ''}`} aria-busy={insights.loading}>
          <TopProductsCard report={insights.data} />
          <TopCustomersCard report={insights.data} />
          <LowStockCard
            report={insights.data}
            thresholdText={stockText}
            thresholdValid={threshold !== null}
            onThreshold={setStockText}
          />
          <ExportCard from={from} to={to} tz={tz} />
        </div>
      )}
    </>
  );
}