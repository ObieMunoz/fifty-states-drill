import { useEffect } from 'react';

/**
 * Keep the screen on while `active`.
 *
 * A phone left face-up on the table while the other player types the code is
 * the ordinary way to host, and a phone that dims and locks freezes the page:
 * the relay sockets drop, the announcements stop, and the guest searches for a
 * host who is there but asleep. The browser releases the lock itself when the
 * page is hidden, so it is asked for again on coming back. Where the API is
 * missing, or the request is refused, nothing changes.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const next = await navigator.wakeLock.request('screen');
        // The effect may have been cleaned up while the request was in flight.
        if (cancelled) await next.release();
        else lock = next;
      } catch {
        // Refused: low battery, or a setting. The screen dims as it would have.
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', acquire);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
      lock = null;
    };
  }, [active]);
}
