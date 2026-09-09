import { roomIdFor } from './room';
import type { Msg } from './types';

/**
 * The peer-to-peer link between two players.
 *
 * There is no game server. Two browsers find each other through a public
 * relay — which carries only the WebRTC handshake, never a question or an
 * answer — and then talk directly over a data channel. That is what lets the
 * whole thing ship as static files on GitHub Pages.
 *
 * Two relay networks are used, not one. Public relays are run by volunteers
 * and any single one can be down, so if the first has not produced a peer
 * within a few seconds the second is added alongside it. Both stay up: a
 * message goes out on every link that has the peer, and the receiver drops the
 * duplicates by sequence number. That removes any need for the two sides to
 * agree on which link is "the" one, which is a race they could otherwise lose
 * in opposite directions.
 */

/** Namespaces the relay traffic so it cannot collide with another app. */
const APP_ID = 'fifty-states-drill-versus';

/** How long the first network gets on its own before the second is added. */
const ESCALATE_MS = 5000;

/** Nothing has connected by now; say so rather than spin forever. */
const GIVE_UP_MS = 30000;

/**
 * Two tabs on one machine are the one case WebRTC cannot handle unaided: their
 * only host candidate is an mDNS `.local` name neither tab can resolve, and
 * the reflexive pair would have to hairpin back through the same NAT. Trystero
 * can fall those candidates back to loopback, which is what makes a two-window
 * match work while developing. Scoped to localhost, so it is never on for a
 * real pair of phones — where genuine LAN candidates make it unnecessary.
 */
const isLocalhost = (): boolean =>
  /^(localhost|127\.0\.0\.1|\[::1\]|.*\.local)$/.test(location.hostname);

export interface TransportEvents {
  /** A peer is reachable. Fires once per peer, whichever network found it. */
  onPeer: (id: string) => void;
  /** The peer is gone from every network. */
  onPeerLeave: (id: string) => void;
  onMessage: (msg: Msg, peerId: string) => void;
  /** Progress worth showing: which networks are up, and whether we gave up. */
  onStatus: (status: { searching: boolean; networks: number; gaveUp: boolean }) => void;
}

export interface Transport {
  send: (msg: Msg) => void;
  leave: () => void;
}

/**
 * This browser's peer id, resolvable before any room is joined.
 *
 * The same on every network: each strategy re-exports it from one shared core
 * module, so the same browser is the same id throughout. Offered on its own
 * because a session needs its own id — half of what settles which side hosts
 * — in hand before a peer can turn up, and `connect` waits on this very
 * module load before it joins anything.
 */
export const peerId = async (): Promise<string> =>
  (await import('@trystero-p2p/nostr')).selfId;

/** One joined relay network. */
interface Link {
  name: string;
  room: TrysteroRoom;
  send: (data: unknown, opts?: { target?: string }) => void;
  peers: Set<string>;
}

/* Trystero's own types are structural and generic; these are the parts used
   here, named so the file reads without chasing them through the package. */
interface TrysteroRoom {
  makeAction: (ns: string, cfg?: { onMessage?: (d: unknown, c: { peerId: string }) => void }) => {
    send: (data: unknown, opts?: { target?: string }) => Promise<void>;
  };
  onPeerJoin: ((id: string) => void) | null;
  onPeerLeave: ((id: string) => void) | null;
  leave: () => Promise<void>;
  getPeers: () => Record<string, RTCPeerConnection>;
}

interface Envelope {
  /** Per-sender sequence number, so a message sent twice is handled once. */
  n: number;
  m: Msg;
}

/** Loaders kept separate so Vite splits each network into its own chunk. */
const NETWORKS = [
  { name: 'nostr', load: () => import('@trystero-p2p/nostr') },
  { name: 'torrent', load: () => import('@trystero-p2p/torrent') },
];

export async function connect(code: string, ev: TransportEvents): Promise<Transport> {
  const roomId = roomIdFor(code);
  const links: Link[] = [];
  /** Peers already announced, so a second network does not re-announce them. */
  const known = new Set<string>();
  /** Highest sequence number handled per peer. */
  const seen = new Map<string, number>();
  let seq = 0;
  let closed = false;
  /* Held in one object so the handlers defined below can clear timers that are
     only scheduled further down, without tripping over the temporal dead zone. */
  const timers: { escalate?: ReturnType<typeof setTimeout>; giveUp?: ReturnType<typeof setTimeout> } = {};

  const status = (gaveUp = false) => {
    if (closed) return;
    ev.onStatus({ searching: known.size === 0, networks: links.length, gaveUp });
  };

  async function addNetwork(index: number): Promise<void> {
    if (closed || index >= NETWORKS.length) return;
    const net = NETWORKS[index];
    try {
      const mod = await net.load();
      if (closed) return;

      const room = (mod.joinRoom as unknown as (
        c: Record<string, unknown>, r: string,
      ) => TrysteroRoom)(
        { appId: APP_ID, _test_only_mdnsHostFallbackToLoopback: isLocalhost() },
        roomId,
      );

      const action = room.makeAction('v', {
        onMessage: (data: unknown, ctx: { peerId: string }) => {
          const env = data as Envelope | null;
          if (!env || typeof env.n !== 'number' || !env.m) return;
          // The same message arrives once per network the peer is on.
          if ((seen.get(ctx.peerId) ?? -1) >= env.n) return;
          seen.set(ctx.peerId, env.n);
          ev.onMessage(env.m, ctx.peerId);
        },
      });

      const link: Link = {
        name: net.name,
        room,
        send: (d, o) => { void action.send(d, o).catch(() => { /* peer went away */ }); },
        peers: new Set(),
      };

      room.onPeerJoin = (id) => {
        link.peers.add(id);
        if (known.has(id)) return;
        known.add(id);
        clearTimeout(timers.escalate);
        clearTimeout(timers.giveUp);
        status();
        ev.onPeer(id);
      };

      room.onPeerLeave = (id) => {
        link.peers.delete(id);
        // Only really gone once no network can still reach them.
        if (links.some((l) => l.peers.has(id))) return;
        known.delete(id);
        seen.delete(id);
        status();
        ev.onPeerLeave(id);
      };

      links.push(link);
      status();
    } catch {
      // A network that will not load is not fatal; the other may still work.
      status();
    }
  }

  await addNetwork(0);

  // Give the first network a head start, then widen the search.
  timers.escalate = setTimeout(() => { void addNetwork(1); }, ESCALATE_MS);
  timers.giveUp = setTimeout(() => { status(true); }, GIVE_UP_MS);

  return {
    send(msg: Msg) {
      if (closed) return;
      const env: Envelope = { n: seq++, m: msg };
      for (const link of links) {
        if (link.peers.size) link.send(env);
      }
    },
    leave() {
      if (closed) return;
      closed = true;
      clearTimeout(timers.escalate);
      clearTimeout(timers.giveUp);
      for (const link of links) void link.room.leave().catch(() => { /* already gone */ });
      links.length = 0;
    },
  };
}
