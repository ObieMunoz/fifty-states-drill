import { cleanName } from './identity';

/**
 * The house leaderboard, kept in localStorage on this device.
 *
 * Two people passing phones around in the same room build up a running record
 * of who beats whom. There is no account: this is one device's memory of the
 * matches it took part in, and clearing it is a button away.
 */
const LB_KEY = 'fiftyStatesDrill.versus.leaderboard.v1';

/**
 * The matches already folded in, by seed.
 *
 * The room code stays in the URL and a reload re-joins it, so a phone left on
 * a result screen comes back to the same finished match and offers it to the
 * standings again. A guard held in memory does not survive that, and the one
 * number this app keeps about a household would gain a win and a match every
 * time somebody reloaded.
 */
const SEEN_KEY = 'fiftyStatesDrill.versus.recorded.v1';

/** Keep the table honest without letting it grow without bound. */
const MAX_ROWS = 40;

/** Enough to outlast any one evening's rematches. */
const MAX_SEEN = 60;

function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function noteSeen(seed: string): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([seed, ...loadSeen().filter((s) => s !== seed)].slice(0, MAX_SEEN)));
  } catch {
    // Storage unavailable: the guard holds for this page load only.
  }
}

export interface LeaderRow {
  name: string;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  /** Points scored across every match. */
  points: number;
  /** Best single-match score. */
  best: number;
  correct: number;
  asked: number;
  /** Epoch ms of the most recent match. */
  last: number;
}

/** One player's line in a finished match, as handed to `recordMatch`. */
export interface MatchResult {
  name: string;
  points: number;
  correct: number;
  asked: number;
  outcome: 'win' | 'loss' | 'draw';
}

const blank = (name: string): LeaderRow => ({
  name, wins: 0, losses: 0, draws: 0, matches: 0,
  points: 0, best: 0, correct: 0, asked: 0, last: 0,
});

/** Names are matched case-insensitively so "obie" and "Obie" are one player. */
const key = (name: string): string => cleanName(name).toLowerCase();

function isRow(v: unknown): v is LeaderRow {
  const r = v as LeaderRow | null;
  return !!r && typeof r.name === 'string' && typeof r.wins === 'number'
    && typeof r.points === 'number';
}

export function loadBoard(): LeaderRow[] {
  try {
    const raw = localStorage.getItem(LB_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRow) : [];
  } catch {
    return [];
  }
}

function persist(rows: LeaderRow[]): void {
  try {
    localStorage.setItem(LB_KEY, JSON.stringify(rows.slice(0, MAX_ROWS)));
  } catch {
    // Storage unavailable: the standings still show for this session.
  }
}

/**
 * Wins first, then win rate, then points — so a player with one lucky win does
 * not sit above someone who has won nine of fifteen.
 */
export function rankBoard(rows: LeaderRow[]): LeaderRow[] {
  return [...rows].sort((a, b) =>
    b.wins - a.wins
    || (b.matches ? b.wins / b.matches : 0) - (a.matches ? a.wins / a.matches : 0)
    || b.points - a.points
    || b.last - a.last);
}

/**
 * Fold one finished match into the standings. Both players are recorded: this
 * device saw the whole match, so it knows both scores.
 *
 * The match's seed is its identity, and one already folded in is left alone,
 * so offering the same match twice — a reload, a second snapshot, a phone
 * brought back to a result still on screen — cannot count it twice.
 */
export function recordMatch(seed: string, results: MatchResult[], now = Date.now()): LeaderRow[] {
  if (seed && loadSeen().includes(seed)) return rankBoard(loadBoard());
  if (seed) noteSeen(seed);
  const rows = loadBoard();
  const byKey = new Map(rows.map((r) => [key(r.name), r]));

  for (const res of results) {
    const name = cleanName(res.name);
    if (!name) continue;
    const row = { ...(byKey.get(key(name)) ?? blank(name)) };
    // Follow the latest capitalisation the player used.
    row.name = name;
    row.matches += 1;
    row.points += res.points;
    row.best = Math.max(row.best, res.points);
    row.correct += res.correct;
    row.asked += res.asked;
    row.last = now;
    if (res.outcome === 'win') row.wins += 1;
    else if (res.outcome === 'loss') row.losses += 1;
    else row.draws += 1;
    byKey.set(key(name), row);
  }

  const next = rankBoard([...byKey.values()]);
  persist(next);
  return next;
}

export function resetBoard(): void {
  try {
    localStorage.removeItem(LB_KEY);
    // The guard goes with the table: clearing the standings and playing the
    // evening's matches back should fill them in again.
    localStorage.removeItem(SEEN_KEY);
  } catch {
    // Ignored, as above.
  }
}

/** Accuracy as a percentage, or null before the player has answered anything. */
export const accuracy = (r: LeaderRow): number | null =>
  r.asked ? Math.round((r.correct / r.asked) * 100) : null;
