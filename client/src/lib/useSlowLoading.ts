import { useEffect, useState } from 'react';

export function useSlowLoading(loading: boolean, delay = 4000) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), delay);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [loading, delay]);

  return loading && slow;
}