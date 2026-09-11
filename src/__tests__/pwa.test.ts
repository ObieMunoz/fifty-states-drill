import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPendingUpdate, installUpdates, onOpenRoom } from '../pwa';
import { PENDING_TTL_MS, pendingCode, rememberRoom } from '../versus/pending';

const sw = vi.hoisted(() => {
  const state: { onNeedRefresh?: () => void; update: ReturnType<typeof vi.fn> } = { update: vi.fn() };
  return state;
});

vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: { onNeedRefresh?: () => void }) => {
    sw.onNeedRefresh = opts.onNeedRefresh;
    return sw.update;
  },
}));

describe('app updates', () => {
  beforeEach(() => {
    sw.update.mockClear();
    sw.onNeedRefresh = undefined;
  });

  it('takes a new build at once when nothing is in progress', () => {
    installUpdates(() => false);
    sw.onNeedRefresh?.();
    expect(sw.update).toHaveBeenCalledTimes(1);
    expect(sw.update).toHaveBeenCalledWith(true);
  });

  it('holds a new build back while a match is on, and applies it afterwards', () => {
    let busy = true;
    installUpdates(() => busy);
    sw.onNeedRefresh?.();
    expect(sw.update).not.toHaveBeenCalled();
    busy = false;
    applyPendingUpdate();
    expect(sw.update).toHaveBeenCalledTimes(1);
    applyPendingUpdate();
    expect(sw.update).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no build is waiting', () => {
    installUpdates(() => false);
    applyPendingUpdate();
    expect(sw.update).not.toHaveBeenCalled();
  });
});

/**
 * The page as the listener sees it: a service worker to hear, a document
 * that can come to the front, a window that can take focus, and the store
 * the worker leaves its note in.
 */
function page() {
  const sw = Object.assign(new EventTarget(), { startMessages: vi.fn() });
  const document = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
  const store = new Map<string, string>();
  const cache = {
    match: async (key: string) => {
      const body = store.get(key);
      return body === undefined ? undefined : new Response(body);
    },
    put: async (key: string, res: Response) => { store.set(key, await res.text()); },
    delete: async (key: string) => store.delete(key),
  };
  vi.stubGlobal('navigator', { serviceWorker: sw });
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('caches', { open: async () => cache });
  const front = () => {
    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  };
  return { sw, document, store, front };
}

/** Let every await in the store's read-then-delete run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('a tapped notification', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('hands the room code to the app, and releases messages sent before it listened', async () => {
    const { sw, store } = page();
    await rememberRoom('ACDE');
    const opened = vi.fn();
    const stop = onOpenRoom(opened);
    expect(sw.startMessages).toHaveBeenCalledOnce();
    sw.dispatchEvent(new MessageEvent('message', { data: { type: 'OPEN_ROOM', code: 'ACDE' } }));
    sw.dispatchEvent(new MessageEvent('message', { data: { type: 'SKIP_WAITING' } }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledWith('ACDE');
    // Heard by message; the note the worker also left is the same tap, and goes unacted on.
    await settle();
    expect(store.size).toBe(0);
    expect(opened).toHaveBeenCalledTimes(1);
    stop();
    sw.dispatchEvent(new MessageEvent('message', { data: { type: 'OPEN_ROOM', code: 'FGHJ' } }));
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('reads the room the worker wrote down when it starts, and takes the note', async () => {
    const { store } = page();
    await rememberRoom('ACDE');
    const opened = vi.fn();
    onOpenRoom(opened);
    await settle();
    expect(opened).toHaveBeenCalledWith('ACDE');
    expect(store.size).toBe(0);
  });

  it('reads it when the page comes to the front, and not before', async () => {
    const { document, front, store } = page();
    const opened = vi.fn();
    const stop = onOpenRoom(opened);
    await settle();
    await rememberRoom('FGHJ');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(opened).not.toHaveBeenCalled();
    front();
    await settle();
    expect(opened).toHaveBeenCalledWith('FGHJ');
    expect(store.size).toBe(0);
    stop();
    await rememberRoom('KMNP');
    front();
    await settle();
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('lets a stale note lie, and still clears it', async () => {
    const { store } = page();
    await rememberRoom('ACDE', Date.now() - PENDING_TTL_MS - 1);
    const opened = vi.fn();
    onOpenRoom(opened);
    await settle();
    expect(opened).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it('is inert where there is no service worker', () => {
    vi.stubGlobal('navigator', {});
    expect(() => onOpenRoom(() => {})()).not.toThrow();
  });
});

describe('the note a tap leaves', () => {
  it('names a room only while it is fresh and well formed', () => {
    const now = 1_000_000;
    expect(pendingCode({ code: 'acde', at: now - 1000 }, now)).toBe('ACDE');
    expect(pendingCode({ code: 'ACDE', at: now - PENDING_TTL_MS - 1 }, now)).toBeNull();
    // Folded like a typed code: the worker wrote it from a payload already checked.
    expect(pendingCode({ code: 'a-c d-e', at: now }, now)).toBe('ACDE');
    expect(pendingCode({ code: 'AC', at: now }, now)).toBeNull();
    expect(pendingCode({ code: '', at: now }, now)).toBeNull();
    expect(pendingCode({ code: 'ACDE' }, now)).toBeNull();
    expect(pendingCode({ at: now }, now)).toBeNull();
    expect(pendingCode('ACDE', now)).toBeNull();
    expect(pendingCode(null, now)).toBeNull();
  });
});
