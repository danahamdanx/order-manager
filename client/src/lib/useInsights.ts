import { useEffect, useState } from 'react';
import { api } from '../api';
import type { InsightsReport } from '../types';

interface Params {
  from: string;
  to: string;
  tz: string;
  threshold: number;
  enabled: boolean;
}

export function useInsights({ from, to, tz, threshold, enabled }: Params) {
  const [data, setData] = useState<InsightsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({ from, to, tz, threshold: String(threshold) });
    api
      .get<InsightsReport>(`/analytics/insights?${query}`, controller.signal)
      .then(setData)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [from, to, tz, threshold, enabled]);

  return { data, loading, error };
}