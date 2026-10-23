import { useEffect, useState } from 'react';
import { api } from '../api';
import type { CartLine } from '../cart/context';
import type { Quote } from '../types';
import { useDebounce } from './useDebounce';

// المجموع الحقيقي بيجي من السيرفر (أسعار حالية + خصم). الواجهة بس بتعرضه
export function useQuote(lines: CartLine[], code: string | null, enabled: boolean) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const items = useDebounce(JSON.stringify(lines.map((l) => ({ productId: l.product.id, quantity: l.quantity }))), 300);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);

    api
      .post<Quote>('/orders/quote', { items: JSON.parse(items), code: code ?? undefined })
      .then((result) => {
        if (!active) return;
        setQuote(result);
        setError(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setQuote(null);
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [items, code, enabled]);

  return { quote, error, loading };
}