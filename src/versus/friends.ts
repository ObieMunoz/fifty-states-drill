import { cleanName } from './identity';

/**
 * Friends: opponents this device has chosen to keep.
 *
 * A finished match offers to add the other player. What is kept is their
 * player id and the name they used, which is enough to send them a rematch
 * request later. It lives on this device only, like the standings, and each
 * entry is one tap from gone.
 */
const KEY = 'fiftyStatesDrill.versus.friends.v1';

/** Enough for a household and the cousins; nobody scrolls a longer list. */
export const MAX_FRIENDS = 20;

export interface Friend {
  id: string;
  name: string;
  /** Epoch ms of the most recent match with them. */
  last: number;
}

function isFriend(v: unknown): v is Friend {
  const f = v as Friend | null;
  return !!f && typeof f.id === 'string' && !!f.id && typeof f.name === 'string' && typeof f.last === 'number';
}

/** Most recently played first. */
const order = (rows: Friend[]): Friend[] => [...rows].sort((a, b) => b.last - a.last);

export function loadFriends(): Friend[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? order(parsed.filter(isFriend)) : [];
  } catch {
    return [];
  }
}

function persist(rows: Friend[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_FRIENDS)));
  } catch {
    // Storage unavailable: the list holds for this session only.
  }
}

/** Add, or bring up to date: the latest name they used, and when. */
export function addFriend(who: { id: string; name: string }, now = Date.now()): Friend[] {
  const name = cleanName(who.name);
  if (!who.id || !name) return loadFriends();
  const rest = loadFriends().filter((f) => f.id !== who.id);
  const next = order([{ id: who.id, name, last: now }, ...rest]).slice(0, MAX_FRIENDS);
  persist(next);
  return next;
}

/**
 * Note a match against someone already on the list, so their line reads
 * "today" and carries the name they now go by. A stranger stays a stranger.
 */
export function touchFriend(who: { id: string; name: string }, now = Date.now()): Friend[] {
  const rows = loadFriends();
  return rows.some((f) => f.id === who.id) ? addFriend(who, now) : rows;
}

export function removeFriend(id: string): Friend[] {
  const next = loadFriends().filter((f) => f.id !== id);
  persist(next);
  return next;
}

/** "today", "3 days ago": rough on purpose, for a list not a log. */
export function agoLabel(then: number, now = Date.now()): string {
  const days = Math.floor(Math.max(0, now - then) / (24 * 60 * 60 * 1000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}
