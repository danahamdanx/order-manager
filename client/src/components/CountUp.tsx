import { useEffect, useState } from 'react';

interface Props {
  value: number;
  decimals?: number;
  prefix?: string;
}

export function CountUp({ value, decimals = 0, prefix = '' }: Props) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return (
    <>
      {prefix}
      {(reduced ? value : shown).toFixed(decimals)}
    </>
  );
}