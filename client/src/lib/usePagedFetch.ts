import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Page } from '../types';

export function usePagedFetch<T>(path: string, params: Record<string, string>) {
  const [data, setData] = useState<Page<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // القيم الفاضية بنشيلها، ونفس الفلاتر بتعطي نفس النص فما بنعيد الطلب بدون سبب
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '')).toString();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api
      .get<Page<T>>(`${path}?${query}`, controller.signal)
      .then(setData)
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [path, query, version]);

  // بعد التعديل أو الحذف بنجيب الصفحة من جديد، لأنه محتواها ممكن يتغير
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { data, loading, error, reload };
}