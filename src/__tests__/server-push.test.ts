import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';

/**
 * The pusher reads its keys from the environment once, so each case loads
 * the module afresh with the environment it wants.
 */
const load = async () => (await import('../../server/push')).webPusher();

const keys = webpush.generateVAPIDKeys();
const saved = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VITE_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe('the push configuration', () => {
  it('is off with no keys set', async () => {
    expect(await load()).toBeNull();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('reads the public key under either name', async () => {
    process.env.VITE_VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = 'mailto:you@example.com';
    expect(await load()).not.toBeNull();
    vi.resetModules();
    delete process.env.VITE_VAPID_PUBLIC_KEY;
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    expect(await load()).not.toBeNull();
  });

  it('forgives a pasted space, quotes, and a subject typed as a bare address', async () => {
    process.env.VITE_VAPID_PUBLIC_KEY = ` "${keys.publicKey}"\n`;
    process.env.VAPID_PRIVATE_KEY = `'${keys.privateKey}' `;
    process.env.VAPID_SUBJECT = 'you@example.com';
    expect(await load()).not.toBeNull();
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('keeps notifications on with a subject it cannot use, and says so', async () => {
    process.env.VITE_VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = 'VAPID_SUBJECT=https://fifty-states-drill.vercel.app/';
    expect(await load()).not.toBeNull();
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('reads the subject the way the push services want it', async () => {
    const { subjectOf } = await import('../../server/push');
    expect(subjectOf('https://fifty-states-drill.vercel.app/')).toBe('https://fifty-states-drill.vercel.app/');
    expect(subjectOf('mailto:you@example.com')).toBe('mailto:you@example.com');
    expect(subjectOf('you@example.com')).toBe('mailto:you@example.com');
    expect(subjectOf('')).toBe('https://fifty-states-drill.vercel.app/');
    for (const bad of ['fifty-states-drill.vercel.app', 'VAPID_SUBJECT=https://x.y/', '"https://x.y/"', 'mailto:']) {
      expect(subjectOf(bad)).toBe('https://fifty-states-drill.vercel.app/');
    }
    expect(console.warn).toHaveBeenCalledTimes(4);
  });

  it('treats a key the library rejects as unconfigured rather than throwing', async () => {
    process.env.VITE_VAPID_PUBLIC_KEY = 'not-a-key';
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    expect(await load()).toBeNull();
    expect(console.error).toHaveBeenCalledOnce();
    // And it is remembered, not retried on every request.
    expect(await load()).toBeNull();
    expect(console.error).toHaveBeenCalledOnce();
  });
});
