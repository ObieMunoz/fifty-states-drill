-- Rematch requests: where each phone's notifications go, and who may send
-- one to whom.
--
-- Neither table is readable by the publishable key. A subscription addresses
-- a phone and a pairing says who has played whom; the API, with the secret
-- key, is the only reader and the only writer. Neither is in the Realtime
-- publication.

create table public.push_subscriptions (
  endpoint text primary key,
  player_id text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_player on public.push_subscriptions (player_id);

-- One row per pair of players who have finished a match, ids in sorted
-- order so the pair is found whichever side asks.
create table public.pairings (
  a_id text not null,
  b_id text not null,
  played_at timestamptz not null,
  invited_by text,
  invited_at timestamptz,
  primary key (a_id, b_id),
  check (a_id < b_id)
);

create index pairings_played_at on public.pairings (played_at);

alter table public.push_subscriptions enable row level security;
alter table public.pairings enable row level security;
-- No policies: with row security on and none granted, the anon key sees nothing.
