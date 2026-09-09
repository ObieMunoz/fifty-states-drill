import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTurnServers } from '../versus/turn';

const server = { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'c' };

function respond(body: unknown, ok = true) {
  const mock = vi.fn(async () => ({ ok, json: async () => body }));
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('turn credentials', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
  });

  it('reads a plain list of ICE servers', async () => {
    respond([server]);
    expect(await fetchTurnServers('https://turn.example/creds')).toEqual([server]);
  });

  it('reads a list wrapped in iceServers, and a single object there', async () => {
    respond({ iceServers: [server] });
    expect(await fetchTurnServers('https://turn.example/creds')).toEqual([server]);
    const single = { urls: ['turn:a', 'turns:b'], username: 'u', credential: 'c' };
    respond({ iceServers: single });
    expect(await fetchTurnServers('https://turn.example/creds')).toEqual([single]);
  });

  it('keeps only entries that name a server', async () => {
    respond([
      server, { username: 'u' }, null, 'turn:x', { urls: 'stun:stun.example.com' }, { urls: 7 },
    ]);
    expect(await fetchTurnServers('https://turn.example/creds'))
      .toEqual([server, { urls: 'stun:stun.example.com' }]);
  });

  it('asks the endpoint without credentials or caching, and with an abort signal', async () => {
    const fetch = respond([server]);
    await fetchTurnServers('https://turn.example/creds');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://turn.example/creds');
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('comes back empty with no endpoint configured', async () => {
    const fetch = respond([server]);
    expect(await fetchTurnServers(undefined)).toEqual([]);
    expect(await fetchTurnServers('')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('comes back empty when the endpoint fails, refuses, or talks nonsense', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    expect(await fetchTurnServers('https://turn.example/creds')).toEqual([]);
    respond({ error: 'no' }, false);
    expect(await fetchTurnServers('https://turn.example/creds')).toEqual([]);
    respond('what');
    expect(await fetchTurnServers('https://turn.example/creds')).toEqual([]);
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError('x'); } })) as unknown as typeof fetch;
    expect(await fetchTurnServers('https://turn.example/creds')).toEqual([]);
  });

  it('gives up on a slow endpoint rather than holding the search', async () => {
    let aborted = false;
    globalThis.fetch = vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')); });
    })) as unknown as typeof fetch;
    const result = fetchTurnServers('https://turn.example/creds', 4000);
    await vi.advanceTimersByTimeAsync(3999);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(aborted).toBe(true);
    expect(await result).toEqual([]);
  });
});
