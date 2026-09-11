import { useInstallOffer } from '../hooks/useInstallOffer';

/**
 * The strip above the rail that offers to put the app on the Home Screen.
 * Always mounted, so the browser's install event is caught however early it
 * fires; drawn only once `ready` says the player has had a look around, and
 * only on a phone that could install and has not said "Not now" lately
 * (src/install.ts).
 */
export function InstallBanner({ ready }: { ready: boolean }) {
  const { offer, busy, install, dismiss } = useInstallOffer();
  if (!ready || !offer) return null;

  return (
    <aside className="install" aria-label="Install the app">
      <img src="/icon-192.png" alt="" width="40" height="40" />
      <div className="install-text">
        {offer.kind === 'prompt' ? (
          <>
            <b>Get the app</b>
            <span>Full-screen, and it works offline.</span>
          </>
        ) : (
          <>
            <b>Add to your Home Screen</b>
            <span>Tap <b>Share</b>, then <b>Add to Home Screen</b>.</span>
          </>
        )}
      </div>
      {offer.kind === 'prompt' && (
        <button type="button" className="btn sm" disabled={busy} onClick={install}>Install</button>
      )}
      <button type="button" className="install-x" aria-label="Not now" onClick={dismiss}>
        <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" fill="none" /></svg>
      </button>
    </aside>
  );
}
