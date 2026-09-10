import { cleanName } from './identity';

/**
 * The house leaderboard, kept in localStorage on this device.
 *
 * Two people passing phones around in the same room build up a running record
 * of who beats whom. There is no account: this is one device's memory of the
 * matches it took part in, and clearing it is a button away.
 */
const LB_KEY = 'fiftyStatesDrill.versus.leaderboard.v1';

/** Keep the table honest without letting it grow without bound. */
const MAX_ROWS = 40;

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
 */
export function recordMatch(results: MatchResult[], now = Date.now()): LeaderRow[] {
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
  } catch {
    // Ignored, as above.
  }
}

/** Accuracy as a percentage, or null before the player has answered anything. */
export const accuracy = (r: LeaderRow): number | null =>
  r.asked ? Math.round((r.correct / r.asked) * 100) : null;
