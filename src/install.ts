/**
 * The offer to put the app on the Home Screen.
 *
 * Installed, the app opens full-screen, keeps working offline, and — on an
 * iPhone — is the only form that can receive rematch requests at all. The
 * browsers' own install offers sit a menu or two deep, so the app makes one
 * of its own. It is for phones: a desktop has an install icon in the
 * address bar, and a banner there would be noise over a two-line rail.
 *
 * How a phone installs depends on its browser. Chrome and its relatives on
 * Android fire `beforeinstallprompt` once they judge the app installable;
 * the event is held back and its own dialog shown from the banner's button.
 * iOS never fires it, so an iPhone is told the steps instead. Either way
 * the offer is snoozed for a month on "Not now", and withdrawn for good
 * once the app is installed — which the phone reports through
 * `appinstalled`, or by simply running as the installed app next time.
 */
export type InstallOffer =
  /** The browser will show its own install dialog when asked. */
  | { kind: 'prompt'; install: () => Promise<'accepted' | 'dismissed'> }
  /** iPhone or iPad: Share, then Add to Home Screen. */
  | { kind: 'steps' }
  | null;

/** localStorage key: when the offer was last declined, as epoch ms. */
export const INSTALL_KEY = 'fiftyStatesDrill.install';

/** How long "Not now" holds. */
export const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/** The event Chromium fires; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const media = (q: string): boolean => typeof matchMedia === 'function' && matchMedia(q).matches;

export const isApple = (): boolean =>
  /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Running from the Home Screen or as a desktop app, rather than in a tab. */
export const isInstalled = (): boolean =>
  media('(display-mode: standalone)') || (navigator as { standalone?: boolean }).standalone === true;

/** A touch-first device; the same test deviceWord uses for "phone". */
export const isPhone = (): boolean => media('(pointer: coarse)') && navigator.maxTouchPoints > 0;

/** Whether "Not now" is still in force. */
export function snoozed(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(INSTALL_KEY));
    return at > 0 && now - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snooze(now = Date.now()): void {
  try {
    localStorage.setItem(INSTALL_KEY, String(now));
  } catch {
    // Blocked storage: the offer comes back next visit, which is bearable.
  }
}

/**
 * Report what to offer this phone, now and as it changes. The first call
 * comes back synchronously; later ones follow the browser's events.
 * Returns the unsubscribe.
 */
export function watchInstall(cb: (offer: InstallOffer) => void): () => void {
  if (typeof window === 'undefined' || isInstalled() || !isPhone() || snoozed()) {
    cb(null);
    return () => {};
  }
  cb(isApple() ? { kind: 'steps' } : null);

  const onPrompt = (e: Event) => {
    // Held back: Chrome would otherwise show its own mini-bar at a moment
    // of its choosing, and once handled the event cannot be used twice.
    e.preventDefault();
    const evt = e as BeforeInstallPromptEvent;
    cb({
      kind: 'prompt',
      install: async () => {
        await evt.prompt();
        const { outcome } = await evt.userChoice;
        return outcome;
      },
    });
  };
  const onInstalled = () => cb(null);
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}
