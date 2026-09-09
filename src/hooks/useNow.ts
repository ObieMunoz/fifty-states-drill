import { useEffect, useState } from 'react';

/**
 * A clock for elapsed-time readouts: `Date.now()` sampled once a second while
 * `active`, so a running timer repaints without anything else driving it.
 *
 * The sample can lag the moment a timer starts, since the first tick is a
 * second away — callers clamp elapsed times at zero rather than show a
 * negative. See `elapsed` in `game/recall.ts`.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
