import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

/**
 * Versus without a Supabase project: `npm run dev:local`.
 *
 * The Vite dev server answers `POST /api/versus` itself, running the very
 * same room rules (`server/rooms.ts`) over the in-memory database the tests
 * use. In place of Realtime, each phone opens a server-sent-events stream
 * at `/api/local-live`, down which every row change, presence change and
 * broadcast in its room is sent — `dev/fake-supabase.ts` stands in for the
 * Supabase client on the browser side and turns those into the callbacks
 * `versus/live.ts` expects. Two tabs on two origins, say `localhost:5173`
 * and `127.0.0.1:5173`, make a match: each holds its own player id.
 *
 * Nothing here ships: the plugin is only added to the config when
 * `VERSUS_LOCAL` is set, and the client-side stand-in is only resolved by it.
 */

interface RowChange {
  table: string;
  eventType: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

interface Rules {
  versus(db: unknown, input: unknown, now: Date, pusher: null): Promise<unknown>;
  phone(db: unknown, input: unknown): Promise<unknown>;
  isPhoneAction(input: unknown): boolean;
  RoomError: new (status: number, message: string) => Error & { status: number };
}

interface Memory {
  memoryDb(): { onChange(cb: (c: RowChange) => void): () => void };
}

interface Client {
  res: ServerResponse;
  player: string;
}

/** Keeps a proxy from closing an idle stream. */
const HEARTBEAT_MS = 15_000;

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

export function localVersus(): Plugin {
  /** The phones listening, by room code. */
  const rooms = new Map<string, Set<Client>>();
  let loaded: Promise<{ rules: Rules; db: unknown }> | null = null;

  const send = (code: string, msg: unknown, except?: string) => {
    for (const c of rooms.get(code) ?? []) {
      if (c.player !== except) c.res.write(`data: ${JSON.stringify(msg)}\n\n`);
    }
  };

  const presence = (code: string) => {
    const ids = [...new Set([...(rooms.get(code) ?? [])].map((c) => c.player))];
    send(code, { kind: 'presence', ids });
  };

  const load = (server: ViteDevServer) => {
    loaded ??= (async () => {
      const rules = await server.ssrLoadModule('/server/rooms.ts') as unknown as Rules;
      const memory = await server.ssrLoadModule('/server/memory.ts') as unknown as Memory;
      const db = memory.memoryDb();
      db.onChange((c) => {
        const code = c.new.code ?? c.old.code ?? c.new.room_code ?? c.old.room_code;
        if (typeof code === 'string') send(code, { kind: 'change', ...c });
      });
      return { rules, db };
    })();
    return loaded;
  };

  return {
    name: 'local-versus',
    apply: 'serve',
    // Ahead of Vite's own resolver, which would otherwise settle the relative
    // import below before this plugin ever saw it.
    enforce: 'pre',

    // The one place the browser reaches for Supabase is swapped for the stand-in.
    resolveId(id, importer) {
      if (id === './supabase' && importer && importer.replace(/\\/g, '/').endsWith('/src/versus/live.ts')) {
        return path.resolve(process.cwd(), 'dev/fake-supabase.ts');
      }
      return null;
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://local');
        if (url.pathname === '/api/versus' && req.method === 'POST') {
          void (async () => {
            const { rules, db } = await load(server);
            try {
              const body: unknown = JSON.parse(await readBody(req));
              const out = rules.isPhoneAction(body)
                ? await rules.phone(db, body)
                : await rules.versus(db, body, new Date(), null);
              json(res, 200, out);
            } catch (err) {
              if (err instanceof rules.RoomError) {
                json(res, err.status, { error: err.message });
              } else {
                console.error(err);
                json(res, 500, { error: 'Something went wrong on the server.' });
              }
            }
          })();
          return;
        }

        if (url.pathname === '/api/local-live' && req.method === 'GET') {
          const code = url.searchParams.get('room') ?? '';
          const player = url.searchParams.get('player') ?? '';
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          });
          res.write(':ok\n\n');
          const client: Client = { res, player };
          if (!rooms.has(code)) rooms.set(code, new Set());
          rooms.get(code)!.add(client);
          presence(code);
          const beat = setInterval(() => res.write(':beat\n\n'), HEARTBEAT_MS);
          req.on('close', () => {
            clearInterval(beat);
            rooms.get(code)?.delete(client);
            presence(code);
          });
          return;
        }

        if (url.pathname === '/api/local-live' && req.method === 'POST') {
          void (async () => {
            try {
              const b = JSON.parse(await readBody(req)) as { room?: string; from?: string; event?: string; payload?: unknown };
              if (typeof b.room === 'string' && typeof b.event === 'string') {
                send(b.room, { kind: 'broadcast', event: b.event, payload: b.payload }, typeof b.from === 'string' ? b.from : undefined);
              }
              json(res, 200, { ok: true });
            } catch {
              json(res, 400, { error: 'A JSON body is required.' });
            }
          })();
          return;
        }

        next();
      });
    },
  };
}
