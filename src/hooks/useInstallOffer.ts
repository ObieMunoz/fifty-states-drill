import { useCallback, useEffect, useState } from 'react';
import { snooze, watchInstall } from '../install';
import type { InstallOffer } from '../install';

/** The install banner, as a screen sees it. */
export interface InstallApi {
  offer: InstallOffer;
  /** True while the browser's dialog is up, so Install cannot be pressed twice. */
  busy: boolean;
  /** Show the browser's install dialog; only meaningful for a `prompt` offer. */
  install: () => void;
  /** "Not now": hide the banner and snooze the offer. */
  dismiss: () => void;
}

export function useInstallOffer(): InstallApi {
  const [offer, setOffer] = useState<InstallOffer>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => watchInstall(setOffer), []);

  const dismiss = useCallback(() => {
    snooze();
    setOffer(null);
  }, []);

  const install = useCallback(() => {
    if (offer?.kind !== 'prompt' || busy) return;
    setBusy(true);
    offer.install()
      // A refusal in the browser's own dialog counts as "Not now" here too.
      .then((outcome) => { if (outcome === 'dismissed') snooze(); })
      .catch(() => { /* the dialog could not be shown; nothing to retry */ })
      .finally(() => { setBusy(false); setOffer(null); });
  }, [offer, busy]);

  return { offer, busy, install, dismiss };
}
