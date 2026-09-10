import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, OFFLINE, callVersus } from '../versus/client';

const realFetch = globalThis.fetch;

function answer(status: number, body: unknown, jsonOk = true) {
  const mock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => { if (!jsonOk) throw new SyntaxError('nope'); return body; },
  }));
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('calling the room API', () => {
  afterEach(() => { globalThis.fetch = realFetch; });

  it('posts the request as JSON to the one endpoint and hands the room back', async () => {
    const snap = { room: { code: 'ACDE' }, players: [], answers: [], now: 'x' };
    const fetch = answer(200, snap);
    expect(await callVersus({ action: 'sync', code: 'ACDE', playerId: 'me' })).toEqual(snap);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/versus');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(JSON.parse(init.body as string)).toEqual({ action: 'sync', code: 'ACDE', playerId: 'me' });
  });

  it('turns a refusal into an error with the server’s status and words', async () => {
    answer(409, { error: 'That room is full.' });
    const err = await callVersus({ action: 'join' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).message).toBe('That room is full.');
  });

  it('still names the status when the server said nothing useful', async () => {
    answer(502, 'gateway', false);
    const err = await callVersus({ action: 'sync' }).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(502);
    expect((err as ApiError).message).toMatch(/502/);
  });

  it('reports a request that never arrived as offline', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    const err = await callVersus({ action: 'sync' }).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toBe(OFFLINE);
  });
});
