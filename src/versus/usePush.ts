import { useCallback, useEffect, useState } from 'react';
import { disablePush, enablePush, pushStatus, pushSupport, syncPush } from './push';
import type { PushStatus, PushSupport } from './push';

/** The notifications switch, as a screen sees it. */
export interface PushApi {
  support: PushSupport;
  status: PushStatus;
  /** True while a change is in flight, so the switch cannot be pressed twice. */
  busy: boolean;
  error: string | null;
  enable: () => void;
  disable: () => void;
}

export function usePush(): PushApi {
  const [support] = useState<PushSupport>(() => pushSupport());
  const [status, setStatus] = useState<PushStatus>('off');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the browser's record once, and while there, refresh the server's.
  useEffect(() => {
    if (support !== 'ready') return;
    let live = true;
    void pushStatus().then((s) => { if (live) setStatus(s); });
    void syncPush().catch(() => { /* next time */ });
    return () => { live = false; };
  }, [support]);

  const run = useCallback((change: () => Promise<PushStatus>) => {
    setBusy(true);
    setError(null);
    change()
      .then(setStatus)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'That did not work. Try again.'))
      .finally(() => setBusy(false));
  }, []);

  return {
    support, status, busy, error,
    enable: useCallback(() => run(enablePush), [run]),
    disable: useCallback(() => run(disablePush), [run]),
  };
}
