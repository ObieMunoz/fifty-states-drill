import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

const EASE = (p: number) => 1 - Math.pow(1 - p, 3);

/**
 * A number that rolls up to `target` rather than jumping, for a score that
 * has just changed. A fall is a reset — a rematch starting from nothing —
 * and jumps, as does everything under reduced motion. `from` is what shows
 * before the first roll, for a total that should climb into view.
 */
export function useCountUp(
  target: number,
  { duration = 650, delay = 0, from }: { duration?: number; delay?: number; from?: number } = {},
): number {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(from ?? target);
  const at = useRef(from ?? target);

  useEffect(() => {
    const start = at.current;
    let raf = 0;
    let timer = 0;
    if (reduced || target < start || target === start) {
      at.current = target;
      if (target !== start) raf = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(raf);
    }
    timer = window.setTimeout(() => {
      let t0 = 0;
      const step = (t: number) => {
        if (!t0) t0 = t;
        const p = Math.min(1, (t - t0) / duration);
        const v = Math.round(start + (target - start) * EASE(p));
        at.current = v;
        setShown(v);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, duration, delay, reduced]);

  return shown;
}
