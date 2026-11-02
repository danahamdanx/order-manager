import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBucket } from '../lib/analytics';
import type { Granularity } from '../lib/analytics';
import type { SalesPoint } from '../types';

interface Props {
  title: string;
  data: SalesPoint[];
  dataKey: 'revenue' | 'orders' | 'aov' | 'newCustomers';
  kind: 'line' | 'bar';
  color: string;
  granularity: Granularity;
  format: (value: number) => string;
  axisFormat?: (value: number) => string;
  decimals?: boolean;
}

export function MetricChart({ title, data, dataKey, kind, color, granularity, format, axisFormat, decimals = false }: Props) {
  const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const margin = { top: 8, right: 12, bottom: 0, left: 0 };
  const grid = <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cfe3dd" />;
  const xAxis = (
    <XAxis
      dataKey="date"
      tickFormatter={(value) => formatBucket(String(value), granularity)}
      tick={{ fontSize: 12 }}
      minTickGap={28}
    />
  );
  const yAxis = <YAxis tickFormatter={axisFormat ?? format} width={52} tick={{ fontSize: 12 }} allowDecimals={decimals} />;
  const tooltip = (
    <Tooltip
      formatter={(value) => (typeof value === 'number' ? format(value) : '—')}
      labelFormatter={(label) => formatBucket(String(label), granularity, true)}
    />
  );

  return (
    <section className="card chart-card" aria-label={title}>
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={240}>
        {kind === 'line' ? (
          <LineChart data={data} margin={margin}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            <Line
              type="monotone"
              dataKey={dataKey}
              name={title}
              stroke={color}
              strokeWidth={2}
              dot={data.length <= 31}
              connectNulls={false}
              isAnimationActive={animate}
            />
          </LineChart>
        ) : (
          <BarChart data={data} margin={margin}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            <Bar dataKey={dataKey} name={title} fill={color} radius={[4, 4, 0, 0]} isAnimationActive={animate} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </section>
  );
}