import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
const media = typeof matchMedia === 'function' ? matchMedia(QUERY) : null;

const subscribe = (onChange: () => void) => {
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
};

/** Tracks the OS setting live, so turning it on takes effect without a reload. */
export const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, () => media?.matches ?? false, () => false);
