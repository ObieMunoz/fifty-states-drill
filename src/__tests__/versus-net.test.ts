import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect } from '../versus/net';
import type { TransportEvents } from '../versus/net';
import type { Msg } from '../versus/types';

type PeerHandler = ((id: string) => void) | null;
type Deliver = (data: unknown, ctx: { peerId: string }) => void;

interface FakePeer {
  getStats: () => Promise<Map<string, Record<string, unknown>>>;
}

interface FakeRoom {
  onPeerJoin: PeerHandler;
  onPeerLeave: PeerHandler;
  makeAction: (ns: string, cfg?: { onMessage?: Deliver }) => { send: (d: unknown) => Promise<void> };
  leave: () => Promise<void>;
  getPeers: () => Record<string, FakePeer>;
  sent: unknown[];
  left: boolean;
  peers: Record<string, FakePeer>;
  receive: Deliver;
}

interface Join {
  config: Record<string, unknown>;
  roomId: string;
  callbacks: { onJoinError?: (e: { error: string }) => void } | undefined;
  room: FakeRoom;
}

const fakes = vi.hoisted(() => {
  const joins: Join[] = [];
  let failNext = false;
  const sockets: Record<string, Record<string, { readyState: number }>> = { nostr: {}, torrent: {} };
  const fakeRoom = (): FakeRoom => {
    let deliver: Deliver | undefined;
    const room: FakeRoom = {
      onPeerJoin: null,
      onPeerLeave: null,
      sent: [],
      left: false,
      makeAction: (_ns, cfg) => {
        deliver = cfg?.onMessage;
        return { send: async (d) => { room.sent.push(d); } };
      },
      leave: async () => { room.left = true; },
      peers: {},
      getPeers: () => room.peers,
      receive: (d, ctx) => deliver?.(d, ctx),
    };
    return room;
  };
  const joinRoom = (config: Record<string, unknown>, roomId: string, callbacks?: Join['callbacks']) => {
    if (failNext) {
      failNext = false;
      throw new Error('relay refused');
    }
    const room = fakeRoom();
    joins.push({ config, roomId, callbacks, room });
    return room;
  };
  return { joins, joinRoom, sockets, failNextJoin: () => { failNext = true; } };
});

vi.mock('@trystero-p2p/nostr', () => ({
  joinRoom: fakes.joinRoom, selfId: 'self', getRelaySockets: () => fakes.sockets.nostr,
}));
vi.mock('@trystero-p2p/torrent', () => ({
  joinRoom: fakes.joinRoom, selfId: 'self', getRelaySockets: () => fakes.sockets.torrent,
}));

const statsOf = (local: string, remote: string) => new Map<string, Record<string, unknown>>([
  ['p', { id: 'p', type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'l', remoteCandidateId: 'r' }],
  ['l', { id: 'l', type: 'local-candidate', candidateType: local }],
  ['r', { id: 'r', type: 'remote-candidate', candidateType: remote }],
]);

function events() {
  const ev = {
    onPeer: vi.fn<TransportEvents['onPeer']>(),
    onPeerLeave: vi.fn<TransportEvents['onPeerLeave']>(),
    onMessage: vi.fn<TransportEvents['onMessage']>(),
    onStatus: vi.fn<TransportEvents['onStatus']>(),
  };
  const lastStatus = () => ev.onStatus.mock.calls.at(-1)?.[0];
  return { ev, lastStatus };
}

const hello: Msg = { t: 'rdy', ready: true };

describe('versus transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakes.joins.length = 0;
    fakes.sockets.nostr = {};
    fakes.sockets.torrent = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('joins both relay networks at once, in the same room', async () => {
    const { ev } = events();
    await connect('ACDE', ev);
    expect(fakes.joins).toHaveLength(2);
    expect(fakes.joins.map((j) => j.roomId)).toEqual(['fsd-versus-ACDE', 'fsd-versus-ACDE']);
    expect(fakes.joins[0].config.relayConfig).toBeDefined();
    expect(fakes.joins[1].config.relayConfig).toBeUndefined();
  });

  it('hands every network a TURN server for phones that cannot reach each other', async () => {
    const { ev } = events();
    await connect('ACDE', ev);
    for (const { config } of fakes.joins) {
      const turn = config.turnConfig as { urls: string; username: string; credential: string }[];
      expect(turn.length).toBeGreaterThan(0);
      for (const server of turn) {
        expect(server.urls).toMatch(/^turns?:/);
        expect(server.username).toBeTruthy();
        expect(server.credential).toBeTruthy();
      }
    }
  });

  it('announces a peer once however many networks find them', async () => {
    const { ev, lastStatus } = events();
    await connect('ACDE', ev);
    expect(lastStatus()).toEqual({ searching: true, networks: 2, relays: 0, gaveUp: false, blocked: false });
    fakes.joins[0].room.onPeerJoin?.('p1');
    fakes.joins[1].room.onPeerJoin?.('p1');
    expect(ev.onPeer).toHaveBeenCalledTimes(1);
    expect(ev.onPeer).toHaveBeenCalledWith('p1');
    expect(lastStatus()?.searching).toBe(false);
  });

  it('reports a peer gone only once no network can reach them', async () => {
    const { ev, lastStatus } = events();
    await connect('ACDE', ev);
    fakes.joins[0].room.onPeerJoin?.('p1');
    fakes.joins[1].room.onPeerJoin?.('p1');
    fakes.joins[0].room.onPeerLeave?.('p1');
    expect(ev.onPeerLeave).not.toHaveBeenCalled();
    expect(lastStatus()?.searching).toBe(false);
    fakes.joins[1].room.onPeerLeave?.('p1');
    expect(ev.onPeerLeave).toHaveBeenCalledTimes(1);
    expect(lastStatus()?.searching).toBe(true);
  });

  it('reports a blocked link when a peer was found but no path opened', async () => {
    const { ev, lastStatus } = events();
    await connect('ACDE', ev);
    fakes.joins[0].callbacks?.onJoinError?.({ error: 'could not connect to peer p1 after exchanging SDP' });
    expect(lastStatus()).toEqual({ searching: true, networks: 2, relays: 0, gaveUp: false, blocked: true });
    expect(ev.onPeer).not.toHaveBeenCalled();
    fakes.joins[1].room.onPeerJoin?.('p1');
    expect(lastStatus()).toEqual({ searching: false, networks: 2, relays: 0, gaveUp: false, blocked: false });
  });

  it('gives up after thirty seconds without a peer, without forgetting a block', async () => {
    const { ev, lastStatus } = events();
    await connect('ACDE', ev);
    vi.advanceTimersByTime(29_999);
    expect(lastStatus()?.gaveUp).toBe(false);
    vi.advanceTimersByTime(1);
    expect(lastStatus()).toEqual({ searching: true, networks: 2, relays: 0, gaveUp: true, blocked: false });

    fakes.joins.length = 0;
    const second = events();
    await connect('FGHJ', second.ev);
    fakes.joins[1].callbacks?.onJoinError?.({ error: 'could not connect to peer p2 after exchanging SDP' });
    vi.advanceTimersByTime(30_000);
    expect(second.lastStatus()).toEqual({ searching: true, networks: 2, relays: 0, gaveUp: true, blocked: true });
  });

  it('does not give up once a peer has been found', async () => {
    const { ev, lastStatus } = events();
    await connect('ACDE', ev);
    fakes.joins[0].room.onPeerJoin?.('p1');
    vi.advanceTimersByTime(60_000);
    expect(lastStatus()?.gaveUp).toBe(false);
  });

  it('sends on every network that has the peer, and on none that does not', async () => {
    const { ev } = events();
    const link = await connect('ACDE', ev);
    link.send(hello);
    expect(fakes.joins[0].room.sent).toHaveLength(0);
    expect(fakes.joins[1].room.sent).toHaveLength(0);
    fakes.joins[0].room.onPeerJoin?.('p1');
    link.send(hello);
    expect(fakes.joins[0].room.sent).toEqual([{ n: 1, m: hello }]);
    expect(fakes.joins[1].room.sent).toHaveLength(0);
    fakes.joins[1].room.onPeerJoin?.('p1');
    link.send(hello);
    expect(fakes.joins[0].room.sent).toHaveLength(2);
    expect(fakes.joins[1].room.sent).toEqual([{ n: 2, m: hello }]);
  });

  it('delivers a message once however many networks carry it', async () => {
    const { ev } = events();
    await connect('ACDE', ev);
    fakes.joins[0].room.receive({ n: 0, m: hello }, { peerId: 'p1' });
    fakes.joins[1].room.receive({ n: 0, m: hello }, { peerId: 'p1' });
    fakes.joins[1].room.receive({ n: 1, m: hello }, { peerId: 'p1' });
    fakes.joins[0].room.receive({ n: 1, m: hello }, { peerId: 'p1' });
    fakes.joins[0].room.receive({ n: 0, m: hello }, { peerId: 'p1' });
    expect(ev.onMessage).toHaveBeenCalledTimes(2);
    expect(ev.onMessage).toHaveBeenNthCalledWith(1, hello, 'p1');
    expect(ev.onMessage).toHaveBeenNthCalledWith(2, hello, 'p1');
  });

  it('ignores anything that is not an envelope', async () => {
    const { ev } = events();
    await connect('ACDE', ev);
    fakes.joins[0].room.receive(null, { peerId: 'p1' });
    fakes.joins[0].room.receive('hello', { peerId: 'p1' });
    fakes.joins[0].room.receive({ n: 'x', m: hello }, { peerId: 'p1' });
    fakes.joins[0].room.receive({ n: 0 }, { peerId: 'p1' });
    expect(ev.onMessage).not.toHaveBeenCalled();
  });

  it('leaves every network and goes quiet afterwards', async () => {
    const { ev } = events();
    const link = await connect('ACDE', ev);
    fakes.joins[0].room.onPeerJoin?.('p1');
    const calls = ev.onStatus.mock.calls.length;
    link.leave();
    expect(fakes.joins.every((j) => j.room.left)).toBe(true);
    fakes.joins[0].room.onPeerLeave?.('p1');
    fakes.joins[1].room.onPeerJoin?.('p2');
    fakes.joins[0].room.receive({ n: 5, m: hello }, { peerId: 'p1' });
    fakes.joins[0].callbacks?.onJoinError?.({ error: 'late' });
    vi.advanceTimersByTime(60_000);
    link.send(hello);
    expect(ev.onPeerLeave).not.toHaveBeenCalled();
    expect(ev.onPeer).toHaveBeenCalledTimes(1);
    expect(ev.onMessage).not.toHaveBeenCalled();
    expect(ev.onStatus.mock.calls).toHaveLength(calls);
    expect(fakes.joins[0].room.sent).toHaveLength(0);
  });

  it('counts the relays actually open, across both networks, while searching', async () => {
    const { ev, lastStatus } = events();
    fakes.sockets.nostr = { 'wss://a': { readyState: 1 }, 'wss://b': { readyState: 0 } };
    fakes.sockets.torrent = { 'wss://t': { readyState: 1 } };
    await connect('ACDE', ev);
    expect(lastStatus()?.relays).toBe(2);
    fakes.sockets.nostr['wss://b'].readyState = 1;
    vi.advanceTimersByTime(1000);
    expect(lastStatus()?.relays).toBe(3);
    fakes.joins[0].room.onPeerJoin?.('p1');
    const calls = ev.onStatus.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(ev.onStatus.mock.calls).toHaveLength(calls);
  });

  it('tells which way the link to a peer runs, from whichever network has them', async () => {
    const { ev } = events();
    const link = await connect('ACDE', ev);
    expect(await link.pathTo('p1')).toBeNull();
    fakes.joins[1].room.peers.p1 = { getStats: async () => statsOf('relay', 'host') };
    fakes.joins[1].room.onPeerJoin?.('p1');
    expect(await link.pathTo('p1')).toBe('relay');
    fakes.joins[0].room.peers.p1 = { getStats: async () => statsOf('host', 'host') };
    fakes.joins[0].room.onPeerJoin?.('p1');
    expect(await link.pathTo('p1')).toBe('lan');
  });

  it('shrugs off a peer whose stats cannot be read', async () => {
    const { ev } = events();
    const link = await connect('ACDE', ev);
    fakes.joins[0].room.peers.p1 = { getStats: async () => { throw new Error('closed'); } };
    fakes.joins[0].room.onPeerJoin?.('p1');
    expect(await link.pathTo('p1')).toBeNull();
  });

  it('carries on with one network when the other will not load', async () => {
    const { ev, lastStatus } = events();
    fakes.failNextJoin();
    await connect('ACDE', ev);
    expect(fakes.joins).toHaveLength(1);
    expect(lastStatus()).toEqual({ searching: true, networks: 1, relays: 0, gaveUp: false, blocked: false });
    fakes.joins[0].room.onPeerJoin?.('p1');
    expect(ev.onPeer).toHaveBeenCalledWith('p1');
  });
});
