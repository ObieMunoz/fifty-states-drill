/**
 * The Supabase client, as `versus/live.ts` uses it, over the dev server's
 * own event stream instead. Only reached through `dev/local-versus.ts`; see
 * there for the whole picture. It mimics just the surface `live.ts` touches:
 * a channel with `on`, `subscribe`, `track`, `presenceState` and `send`, and
 * `removeChannel` to close it.
 */
type Handler = (payload: never) => void;

interface Message {
  kind: 'change' | 'presence' | 'broadcast';
  table?: string;
  eventType?: string;
  new?: unknown;
  old?: unknown;
  ids?: string[];
  event?: string;
  payload?: unknown;
}

class FakeChannel {
  private changes: { table: string; cb: Handler }[] = [];
  private presence: Handler[] = [];
  private broadcasts: { event: string; cb: Handler }[] = [];
  private ids: string[] = [];
  private source: EventSource | null = null;

  constructor(private readonly code: string, private readonly player: string) {}

  on(type: string, filter: { table?: string; event?: string }, cb: Handler): this {
    if (type === 'postgres_changes') this.changes.push({ table: filter.table ?? '', cb });
    else if (type === 'presence') this.presence.push(cb);
    else if (type === 'broadcast') this.broadcasts.push({ event: filter.event ?? '', cb });
    return this;
  }

  subscribe(cb: (status: string) => void): this {
    const q = `room=${encodeURIComponent(this.code)}&player=${encodeURIComponent(this.player)}`;
    const es = new EventSource(`/api/local-live?${q}`);
    this.source = es;
    es.onopen = () => cb('SUBSCRIBED');
    es.onerror = () => cb('CHANNEL_ERROR');
    es.onmessage = (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as Message;
      if (msg.kind === 'change') {
        for (const h of this.changes) {
          if (h.table === msg.table) h.cb({ eventType: msg.eventType, new: msg.new, old: msg.old } as never);
        }
      } else if (msg.kind === 'presence') {
        this.ids = msg.ids ?? [];
        for (const h of this.presence) h({} as never);
      } else if (msg.kind === 'broadcast') {
        for (const h of this.broadcasts) {
          if (h.event === msg.event) h.cb({ event: msg.event, payload: msg.payload } as never);
        }
      }
    };
    return this;
  }

  async track(): Promise<string> {
    return 'ok';
  }

  presenceState(): Record<string, { id: string }[]> {
    return Object.fromEntries(this.ids.map((id) => [id, [{ id }]]));
  }

  async send(msg: { type: string; event: string; payload: unknown }): Promise<string> {
    await fetch('/api/local-live', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room: this.code, from: this.player, event: msg.event, payload: msg.payload }),
    });
    return 'ok';
  }

  close(): void {
    this.source?.close();
    this.source = null;
  }
}

export function supabase() {
  return {
    channel(name: string, opts: { config: { presence: { key: string } } }): FakeChannel {
      return new FakeChannel(name.replace(/^room:/, ''), opts.config.presence.key);
    },
    async removeChannel(ch: FakeChannel): Promise<string> {
      ch.close();
      return 'ok';
    },
  };
}
