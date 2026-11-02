import { useEffect, useState } from 'react';
import { api } from '../api';
import type { SalesReport } from '../types';
import type { Granularity } from './analytics';

interface Params {
  from: string;
  to: string;
  granularity?: Granularity;
  tz: string;
  enabled: boolean;
}

// بنحتفظ بالتقرير القديم وقت التحميل (بنعتّمه بس)، فالصفحة ما بتفلش عند تغيير الفترة
export function useSalesReport({ from, to, granularity, tz, enabled }: Params) {
  const [data, setData] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({ from, to, tz });
    if (granularity) query.set('granularity', granularity);

    api
      .get<SalesReport>(`/analytics/sales?${query}`, controller.signal)
      .then(setData)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [from, to, granularity, tz, enabled]);

  return { data, loading, error };
}