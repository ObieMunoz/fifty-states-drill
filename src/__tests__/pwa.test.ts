import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPendingUpdate, installUpdates } from '../pwa';

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
