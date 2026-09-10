-- Versus rooms. One row per room, one per player in it, one per answer.
--
-- Phones never write these tables directly: every change goes through the
-- API, which holds the secret key and checks the rules. Phones only read,
-- through Realtime subscriptions, which is what the policies below allow.

create table public.rooms (
  code text primary key,
  host_id text not null,
  status text not null check (status in ('waiting', 'lobby', 'playing', 'final', 'closed')),
  mode text not null,
  rounds int not null,
  scope text not null,
  match_no int not null default 0,
  -- Set at kick-off; both phones derive the identical question sequence from it.
  seed text,
  -- Each player's level, locked at kick-off so a mid-match change cannot skew scoring.
  difs jsonb,
  round int not null default 0,
  -- When the question on screen is meant to have appeared, on the server's clock.
  -- Set to kick-off plus the countdown at the start, then to now on each advance.
  round_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  room_code text not null references public.rooms (code) on delete cascade,
  id text not null,
  name text not null,
  dif text not null,
  ready boolean not null default false,
  wants_again boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_code, id)
);

create table public.answers (
  room_code text not null references public.rooms (code) on delete cascade,
  match_no int not null,
  round int not null,
  player_id text not null,
  correct boolean not null,
  ms int not null,
  points int not null,
  pick text,
  timeout boolean not null,
  primary key (room_code, match_no, round, player_id)
);

create index rooms_updated_at on public.rooms (updated_at);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.answers enable row level security;

-- Anyone holding the anon key may read: a room code is the only secret a
-- living-room game needs, and the API is the only writer.
create policy "rooms are readable" on public.rooms for select using (true);
create policy "players are readable" on public.players for select using (true);
create policy "answers are readable" on public.answers for select using (true);

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.answers;
