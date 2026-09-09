import { classifyPath } from './path';
import type { Path } from './path';
import { roomIdFor } from './room';
import { fetchTurnServers } from './turn';
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
 * and any single one can be down, so both are joined from the start and both
 * stay up: a message goes out on every link that has the peer, and the
 * receiver drops the duplicates by sequence number. That removes any need for
 * the two sides to agree on which link is "the" one, which is a race they
 * could otherwise lose in opposite directions.
 *
 * Finding each other is only half of it. The data channel still needs a route
 * between the two phones, and two phones on cellular usually have none: each
 * sits behind its carrier's NAT, which will not let the other in. For that
 * case a TURN server relays the packets. It carries only the encrypted
 * channel, so it can no more read a question than the relays can.
 */

/** Namespaces the relay traffic so it cannot collide with another app. */
const APP_ID = 'fifty-states-drill-versus';

/**
 * The nostr relays used for the handshake, named rather than left to default.
 *
 * Left alone, trystero picks five of its defaults by shuffling them with a
 * seed derived from `APP_ID` — so this app draws the same five on every load,
 * forever, and a relay that dies is never rotated out. That is what went
 * wrong: of the five it drew, `relay.agorist.space` refuses the socket
 * outright — the error in the console — and `relay.artio.inf.unibe.ch` hangs
 * until it times out, which says nothing at all. That left two dependable
 * relays and one flaky one to introduce every pair of players.
 *
 * These were each checked from the deployed origin, and for whether they
 * actually carry an ephemeral event between two sockets — a relay can accept
 * the connection and the publish and still relay nothing, which fails
 * silently. Two of the old five that still work are kept, so a player on a
 * cached bundle and one on a fresh bundle still share relays. Expect to prune
 * this list from time to time: these are volunteer-run, and they come and go.
 */
const NOSTR_RELAYS = [
  'wss://nos.lol',
  'wss://relay.mostr.pub',
  'wss://purplerelay.com',
  'wss://nostr.data.haus',
  'wss://relay.sigit.io',
  'wss://nostr-01.yakihonne.com',
  'wss://nostr.sathoarder.com',
  'wss://relay-can.zombi.cloudrodion.com',
];

/**
 * Where the data channel goes when the two phones cannot reach each other.
 *
 * WebRTC tries a direct path first — over the LAN when both phones share one,
 * else through whatever hole STUN can find in each side's NAT — and only falls
 * back to a TURN relay when that fails. Both on cellular is the common
 * failure: the carriers' NATs are the closed kind, and without a relay the
 * handshake completes and then nothing connects: the room just waits, then
 * times out. The credentials are minted per search by the endpoint named
 * here; see `turn.ts` for why they cannot simply be written down.
 */
const TURN_URL: string | undefined = import.meta.env.VITE_TURN_URL;

/** Nothing has connected by now; say so rather than spin forever. */
const GIVE_UP_MS = 30000;

/** How often the relay count is re-read while the search is on. */
const POLL_MS = 1000;

/**
 * Two tabs on one machine are the one case WebRTC cannot handle unaided: their
 * only host candidate is an mDNS `.local` name neither tab can resolve, and
 * the reflexive pair would have to hairpin back through the same NAT. Trystero
 * can fall those candidates back to loopback, which is what makes a two-window
 * match work while developing. Scoped to localhost, so it is never on for a
 * real pair of phones — where genuine LAN candidates make it unnecessary.
 */
const isLocalhost = (): boolean =>
  typeof location !== 'undefined'
  && /^(localhost|127\.0\.0\.1|\[::1\]|.*\.local)$/.test(location.hostname);

/**
 * What the search looks like from outside, for the waiting screen.
 *
 * `blocked` is the case the relays cannot help with: a peer was found and the
 * handshake exchanged, but no route opened between the two phones. It is worth
 * telling apart from nobody having turned up, since the fix is different —
 * the same Wi-Fi, or another go — and "no host answered" would send the
 * player off chasing a fresh code that will do no better. Cleared the moment a
 * peer does connect.
 */
export interface TransportStatus {
  searching: boolean;
  networks: number;
  /** Relay sockets actually open, across every network: zero means no way in. */
  relays: number;
  /** Whether a TURN relay is on hand for phones that cannot reach each other. */
  turn: boolean;
  gaveUp: boolean;
  blocked: boolean;
}

export interface TransportEvents {
  /** A peer is reachable. Fires once per peer, whichever network found it. */
  onPeer: (id: string) => void;
  /** The peer is gone from every network. */
  onPeerLeave: (id: string) => void;
  onMessage: (msg: Msg, peerId: string) => void;
  /** Progress worth showing: which networks are up, and whether we gave up. */
  onStatus: (status: TransportStatus) => void;
}

export interface Transport {
  send: (msg: Msg) => void;
  leave: () => void;
  /** How the link to a connected peer runs, or null if it cannot be read. */
  pathTo: (id: string) => Promise<Path | null>;
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

/** What trystero reports when a peer was reached but never connected. */
interface JoinCallbacks {
  onJoinError: (details: { error: string }) => void;
}

type JoinRoom = (c: Record<string, unknown>, r: string, cb: JoinCallbacks) => TrysteroRoom;

interface Envelope {
  /** Per-sender sequence number, so a message sent twice is handled once. */
  n: number;
  m: Msg;
}

/** A relay socket, as far as counting the open ones goes. */
type RelaySockets = () => Record<string, { readyState: number }>;

interface Network {
  name: string;
  /* Only these two are reached for; the rest of each module is its own business. */
  load: () => Promise<{ joinRoom: unknown; getRelaySockets?: unknown }>;
  config: Record<string, unknown>;
}

/**
 * Loaders kept separate so Vite splits each network into its own chunk.
 *
 * The config is per network, not shared: `relayConfig.urls` means relays to
 * nostr and trackers to torrent, so one object across both would hand the
 * fallback a list of nostr relays to announce on. Torrent takes its own
 * defaults in list order rather than shuffling them, and the three it uses
 * are healthy, so it is left to them.
 */
const NETWORKS: Network[] = [
  {
    name: 'nostr',
    load: () => import('@trystero-p2p/nostr'),
    config: { relayConfig: { urls: NOSTR_RELAYS } },
  },
  { name: 'torrent', load: () => import('@trystero-p2p/torrent'), config: {} },
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
  let gaveUp = false;
  let blocked = false;
  /** Each loaded network's view of its sockets, for the relay count. */
  const sockets: RelaySockets[] = [];
  /* Held in an object so the handler defined below can clear a timer that is
     only scheduled further down, without tripping over the temporal dead zone. */
  const timers: { giveUp?: ReturnType<typeof setTimeout>; poll?: ReturnType<typeof setInterval> } = {};

  const relaysOpen = (): number => sockets.reduce(
    (n, get) => n + Object.values(get()).filter((s) => s.readyState === WebSocket.OPEN).length, 0,
  );

  /* Fetched before any network is joined: the peer connections are made at
     join time, and a relay learned of later would not reach them. */
  const turnServers = await fetchTurnServers(TURN_URL);

  const status = () => {
    if (closed) return;
    ev.onStatus({
      searching: known.size === 0,
      networks: links.length,
      relays: relaysOpen(),
      turn: turnServers.length > 0,
      gaveUp,
      blocked,
    });
  };

  async function addNetwork(index: number): Promise<void> {
    if (closed || index >= NETWORKS.length) return;
    const net = NETWORKS[index];
    try {
      const mod = await net.load();
      if (closed) return;
      if (typeof mod.getRelaySockets === 'function') sockets.push(mod.getRelaySockets as RelaySockets);

      const room = (mod.joinRoom as unknown as JoinRoom)(
        {
          appId: APP_ID,
          ...net.config,
          turnConfig: turnServers,
          _test_only_mdnsHostFallbackToLoopback: isLocalhost(),
        },
        roomId,
        {
          onJoinError: () => {
            // Reported once per peer per network, and only before they
            // connect; the search itself carries on underneath.
            if (closed || known.size) return;
            blocked = true;
            status();
          },
        },
      );

      const action = room.makeAction('v', {
        onMessage: (data: unknown, ctx: { peerId: string }) => {
          if (closed) return;
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
        if (closed) return;
        link.peers.add(id);
        if (known.has(id)) return;
        known.add(id);
        clearTimeout(timers.giveUp);
        gaveUp = false;
        blocked = false;
        status();
        ev.onPeer(id);
      };

      room.onPeerLeave = (id) => {
        // A peer's own leave can land just after this side closed the link —
        // the host's farewell is followed by exactly that — and must not
        // disturb whatever screen the session has moved on to.
        if (closed) return;
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

  await Promise.all(NETWORKS.map((_, i) => addNetwork(i)));

  timers.giveUp = setTimeout(() => { gaveUp = true; status(); }, GIVE_UP_MS);
  // Relays come and go during a search; once a peer is found they stop mattering.
  timers.poll = setInterval(() => { if (known.size === 0) status(); }, POLL_MS);

  return {
    send(msg: Msg) {
      if (closed) return;
      const env: Envelope = { n: seq++, m: msg };
      for (const link of links) {
        if (link.peers.size) link.send(env);
      }
    },
    leave() {
      // Anything sent just before this still goes: trystero's own leave
      // travels the same ordered channel and holds the peer open a beat.
      if (closed) return;
      closed = true;
      clearTimeout(timers.giveUp);
      clearInterval(timers.poll);
      for (const link of links) void link.room.leave().catch(() => { /* already gone */ });
      links.length = 0;
    },
    async pathTo(id: string) {
      for (const link of links) {
        const pc = link.room.getPeers()[id];
        if (!pc) continue;
        try {
          const path = classifyPath((await pc.getStats()).values());
          if (path) return path;
        } catch {
          // Closed under us; the next link may still have them.
        }
      }
      return null;
    },
  };
}
