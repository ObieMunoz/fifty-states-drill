import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { VB0, boxAttr } from '../lib/geo';
import type { Box } from '../types';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

const DURATION = 430;

/**
 * Animate the map's viewBox towards `target`.
 *
 * The attribute is written straight to the DOM rather than rendered as a prop:
 * at sixty frames a second, re-rendering fifty paths per frame is wasted work,
 * and React would fight the animation by resetting the attribute.
 *
 * Returns the width the map settled at, which is what the labels size
 * themselves against.
 */
export function useViewBox(ref: RefObject<SVGSVGElement | null>, target: Box): number {
  const live = useRef<Box>({ ...VB0 });
  const [settledWidth, setSettledWidth] = useState(VB0.w);
  const reduced = usePrefersReducedMotion();

  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    const from = { ...live.current };
    const apply = (b: Box) => {
      live.current = b;
      svg.setAttribute('viewBox', boxAttr(b));
    };

    // Write the current frame synchronously so the very first paint — and any
    // reduced-motion jump — lands with a viewBox already set.
    apply(from);

    if (reduced) {
      apply({ ...target });
      return;
    }

    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION);
      // easeInOutCubic
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      apply({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      });
      if (p < 1) raf = requestAnimationFrame(step);
      else setSettledWidth(target.w);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ref, target, reduced]);

  // With motion off there is no animation to wait on: the target is the frame.
  return reduced ? target.w : settledWidth;
}
