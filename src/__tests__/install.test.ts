import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INSTALL_KEY, SNOOZE_MS, snooze, snoozed, watchInstall } from '../install';
import type { InstallOffer } from '../install';

const store = new Map<string, string>();

/** The bits of a browser the offer reads: its device, its window, its storage. */
function device(opts: {
  ua?: string;
  touch?: boolean;
  standalone?: boolean;
  iosStandalone?: boolean;
  storage?: Storage;
} = {}) {
  const { ua = 'Mozilla/5.0 (Linux; Android 14) Chrome/120', touch = true, standalone = false } = opts;
  const win = new EventTarget();
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', {
    userAgent: ua,
    platform: ua.includes('Android') ? 'Linux armv8l' : 'iPhone',
    maxTouchPoints: touch ? 5 : 0,
    standalone: opts.iosStandalone,
  });
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q === '(pointer: coarse)' ? touch : q === '(display-mode: standalone)' ? standalone : false,
  }));
  vi.stubGlobal('localStorage', opts.storage ?? {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
  });
  return win;
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1';

/** A `beforeinstallprompt` as Chromium sends it, with the outcome scripted. */
function promptEvent(outcome: 'accepted' | 'dismissed') {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(e, { prompt, userChoice: Promise.resolve({ outcome }) });
  return { e, prompt };
}

describe('the install offer', () => {
  beforeEach(() => store.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('tells an iPhone in a tab the steps, at once', () => {
    device({ ua: IPHONE });
    const seen: InstallOffer[] = [];
    watchInstall((o) => seen.push(o));
    expect(seen).toEqual([{ kind: 'steps' }]);
  });

  it('offers an Android phone the browser dialog once the browser says it may', async () => {
    const win = device();
    const seen: InstallOffer[] = [];
    watchInstall((o) => seen.push(o));
    expect(seen).toEqual([null]);

    const { e, prompt } = promptEvent('accepted');
    win.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    const offer = seen[1];
    expect(offer?.kind).toBe('prompt');
    if (offer?.kind !== 'prompt') throw new Error('expected a prompt offer');
    expect(prompt).not.toHaveBeenCalled();
    await expect(offer.install()).resolves.toBe('accepted');
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('withdraws the offer when the phone reports the app installed', () => {
    const win = device();
    const seen: InstallOffer[] = [];
    watchInstall((o) => seen.push(o));
    win.dispatchEvent(promptEvent('accepted').e);
    win.dispatchEvent(new Event('appinstalled'));
    expect(seen.map((o) => o?.kind ?? null)).toEqual([null, 'prompt', null]);
  });

  it('stops listening once unsubscribed', () => {
    const win = device();
    const seen: InstallOffer[] = [];
    watchInstall((o) => seen.push(o))();
    win.dispatchEvent(promptEvent('accepted').e);
    expect(seen).toEqual([null]);
  });

  it('makes no offer to the installed app', () => {
    const win = device({ standalone: true });
    const seen: InstallOffer[] = [];
    watchInstall((o) => seen.push(o));
    win.dispatchEvent(promptEvent('accepted').e);
    expect(seen).toEqual([null]);

    device({ ua: IPHONE, iosStandalone: true });
    seen.length = 0;
    watchInstall((o) => seen.push(o));
    expect(seen).toEqual([null]);
  });

  it('makes no offer to a desktop, even one the browser would install on', () => {
    const win = device({ touch: false });
    const seen: InstallOffer[] = [];
    watchInstall((o) => seen.push(o));
    win.dispatchEvent(promptEvent('accepted').e);
    expect(seen).toEqual([null]);
  });

  it('holds off for a month after "Not now", then asks again', () => {
    device({ ua: IPHONE });
    const t0 = 1_700_000_000_000;
    snooze(t0);
    expect(store.get(INSTALL_KEY)).toBe(String(t0));
    expect(snoozed(t0 + SNOOZE_MS - 1)).toBe(true);
    expect(snoozed(t0 + SNOOZE_MS)).toBe(false);

    vi.spyOn(Date, 'now').mockReturnValue(t0 + 1000);
    const seen: InstallOffer[] = [];
    watchInstall((o) => seen.push(o));
    expect(seen).toEqual([null]);
    vi.restoreAllMocks();
  });

  it('treats blocked storage as never snoozed', () => {
    device({
      ua: IPHONE,
      storage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage,
    });
    expect(() => snooze()).not.toThrow();
    expect(snoozed()).toBe(false);
    const seen: InstallOffer[] = [];
    watchInstall((o) => seen.push(o));
    expect(seen).toEqual([{ kind: 'steps' }]);
  });
});
