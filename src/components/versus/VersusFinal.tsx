import { useMemo, useState } from 'react';
import { BY } from '../../data/states';
import { fmtTime } from '../../lib/text';
import { useCountUp } from '../../hooks/useCountUp';
import { correctOf, finishedAt, matchResults, roundTaker, seriesOf } from '../../versus/machine';
import { isFinalRound, roundLimitMs } from '../../versus/scoring';
import { awardsFor, raceAwards, raceStats, sideStats } from '../../versus/stats';
import type { Award, RaceStats, SideStats } from '../../versus/stats';
import { colorOf, isRace } from '../../versus/types';
import { namesIn, trialTarget } from '../../versus/trial';
import type { TrialName } from '../../versus/trial';
import type { PlayerColor, RoundAnswer } from '../../versus/types';
import { Confetti } from './Confetti';
import { Leaderboard } from './Leaderboard';
import { LinkNotice } from './LinkNotice';
import { ReactionBubbles, ReactionTray } from './Reactions';
import { SoundToggle } from './SoundToggle';
import type { VersusApi } from '../../versus/useVersus';

/** How many awards fit without crowding the phone. */
const MAX_AWARDS = 4;

const secs = (ms: number | null): string => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);

/**
 * The result: who won and by how much, the series so far, what the match
 * earned each side, the numbers behind it, the round-by-round story, and
 * the way back to another match.
 */
export function VersusFinal({ api }: { api: VersusApi }) {
  const { state, myTotal, theirTotal, board, reactions } = api;
  // Mounted fresh for each match — see the key in VersusScreen — so this needs
  // no resetting of its own.
  const [asked, setAsked] = useState(false);
  const { outcome } = matchResults(state);
  const them = state.them?.name || state.lastOpponent || 'Opponent';
  // Who was played, whether or not they are still here.
  const opponentId = state.them?.id || state.lastOpponentId;
  const friend = api.friends.find((f) => f.id === opponentId) ?? null;
  const gone = !state.them;
  const myColor = state.me.color;
  const theirColor = state.them?.color ?? colorOf(!state.isHost);
  const margin = Math.abs(myTotal - theirTotal);
  const series = seriesOf(state);

  const shownMine = useCountUp(myTotal, { from: 0, duration: 900, delay: 250 });
  const shownTheirs = useCountUp(theirTotal, { from: 0, duration: 900, delay: 250 });

  // A trial is counted in states named, not points, and a clean sweep is
  // worth saying out loud: naming all fifty is the thing the mode is for.
  const racing = !!state.cfg && isRace(state.cfg.mode);
  const target = racing ? trialTarget(state.cfg?.scope ?? 'all') : 0;
  const swept = racing && myTotal >= target;
  const outOf = racing ? target : state.plan.length;

  // A race has no rounds, so none of the round numbers mean anything over
  // it: the plan it would read them off is fifty states the seed drew and
  // neither player was ever asked.
  const rows = useMemo(() => (racing
    ? raceRows(raceStats(state.myAnswers, target), raceStats(state.theirAnswers, target))
    : matchRows(sideStats(state.myAnswers, state.theirAnswers), sideStats(state.theirAnswers, state.myAnswers))
  ), [racing, target, state.myAnswers, state.theirAnswers]);

  const awards = useMemo(() => {
    if (racing) return raceAwards(state.myAnswers, state.theirAnswers, target).slice(0, MAX_AWARDS);
    const difs = Object.values(state.difs);
    const limits = state.plan.map((r) => roundLimitMs(r.qm, difs.length ? difs : ['standard']));
    return awardsFor(state.plan, state.myAnswers, state.theirAnswers, limits).slice(0, MAX_AWARDS);
  }, [racing, target, state.plan, state.myAnswers, state.theirAnswers, state.difs]);

  const headline = outcome === 'win' ? 'You win' : outcome === 'loss' ? `${them} wins` : 'Dead heat';
  const byLine = racing
    ? (outcome === 'draw'
      ? <>Level on <b>{myTotal}</b> states.</>
      : swept
        ? <>All <b>{target}</b> in <b>{fmtTime(finishedAt(state.myAnswers))}</b>.</>
        : <>By <b>{margin}</b> {margin === 1 ? 'state' : 'states'}.</>)
    : outcome === 'draw'
      ? 'Level on points.'
      : <>By <b>{margin}</b> {margin === 1 ? 'point' : 'points'}.</>;
  const seriesLine = series.played < 2 ? null
    : series.wins > series.losses ? `You lead the series ${series.wins}–${series.losses}`
      : series.losses > series.wins ? `${them} leads the series ${series.losses}–${series.wins}`
        : `Series level at ${series.wins}–${series.losses}`;

  return (
    <div className="vs-sheet vs-final">
      <LinkNotice state={state} />
      <Confetti on={outcome === 'win'} />
      <header className="vs-top">
        <button type="button" className="vs-back" onClick={api.leave}>← Leave</button>
        <span className="vs-top-right">
          <span className="eyebrow mono">Room {state.code}</span>
          <SoundToggle />
        </span>
      </header>

      <div className={`vs-verdict ${outcome}`}>
        <h1>{headline}</h1>
        <p className="vs-margin">{byLine}</p>
        <div className="vs-final-scores">
          <div className="me" data-pc={myColor}>
            <span>{state.me.name}</span>
            <b className="mono">{shownMine}</b>
            <i className="mono">{tally(racing, state.myAnswers, outOf)}</i>
          </div>
          <span className="vs-dash" aria-hidden="true">—</span>
          <div className="them" data-pc={theirColor}>
            <span>{them}</span>
            <b className="mono">{shownTheirs}</b>
            <i className="mono">{tally(racing, state.theirAnswers, outOf)}</i>
          </div>
          <ReactionBubbles reactions={reactions} them={them} />
        </div>
        {seriesLine && <p className="vs-series">{seriesLine}</p>}
        {!gone && <ReactionTray onReact={api.react} small />}
      </div>

      {awards.length > 0 && (
        <ul className="vs-awards" aria-label="Awards">
          {awards.map((a) => (
            <AwardCard key={a.key} award={a} me={state.me.name} them={them} colors={{ me: myColor, them: theirColor }} />
          ))}
        </ul>
      )}

      <Stats rows={rows} names={{ me: state.me.name, them }} colors={{ me: myColor, them: theirColor }} />

      <section className="vs-strip">
        <div className="vs-strip-head">
          <span className="eyebrow">{racing ? 'Names in' : 'Round by round'}</span>
          {/* Which column is whose; the dots alone cannot say it. */}
          <span className="vs-strip-key">
            <i className="me" data-pc={myColor} aria-hidden="true" />{state.me.name}
            <i className="them" data-pc={theirColor} aria-hidden="true" />{them}
          </span>
        </div>
        {racing ? (
          <NamesIn
            mine={namesIn(state.myAnswers)}
            theirs={namesIn(state.theirAnswers)}
            names={{ me: state.me.name, them }}
            colors={{ me: myColor, them: theirColor }}
          />
        ) : (
          <ol>
            {state.plan.map((r, i) => {
              const a = state.myAnswers[i];
              const b = state.theirAnswers[i];
              const taker = roundTaker(a, b);
              return (
                <li key={i}>
                  <b className="mono">{i + 1}</b>
                  <span className="vs-strip-state">
                    {BY[r.abbr].n}
                    {isFinalRound(i, state.plan.length) && <i className="vs-x2">2×</i>}
                  </span>
                  <span className={`vs-dot me ${verdict(a)}`} data-pc={myColor} aria-label={`You: ${verdict(a)}`} />
                  <i className={`vs-pts mono${taker === 'me' ? ' on' : ''}`}>{pts(a)}</i>
                  <span className={`vs-dot them ${verdict(b)}`} data-pc={theirColor} aria-label={`${them}: ${verdict(b)}`} />
                  <i className={`vs-pts mono${taker === 'them' ? ' on' : ''}`}>{pts(b)}</i>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="vs-foot">
        {gone && friend ? (
          // They have gone, but they are a friend: the request reaches them anyway.
          <button type="button" className="vs-big primary" onClick={() => api.requestRematch(friend)}>
            Send {them} a rematch request
            <small>Opens a new room and notifies them</small>
          </button>
        ) : (
          <button
            type="button"
            className={`vs-big ${asked ? 'on' : 'primary'}`}
            disabled={gone}
            onClick={() => { setAsked(true); api.rematch(); }}
          >
            {asked ? 'Asked for a rematch' : outcome === 'loss' ? 'Run it back' : 'Play again'}
            {!asked && !gone && <small>{series.played >= 1 ? `Match ${series.played + 1} of the series` : 'Same room, fresh questions'}</small>}
          </button>
        )}
        {opponentId && !friend && (
          <button type="button" className="vs-big ghost" onClick={api.addFriend}>
            Add {them} as a friend
            <small>Send them a rematch request any time</small>
          </button>
        )}
        <p className="vs-foot-note" role="status">
          {gone ? (friend ? '' : `${them} has left.`)
            : state.theyWantAgain ? `${them} wants another.`
              : asked ? 'Waiting for the host to restart…'
                : friend ? `${them} is on your friends list.` : ''}
        </p>
      </div>

      <Leaderboard
        rows={board}
        highlight={[state.me.name, them]}
        onCleared={api.clearBoard}
      />
    </div>
  );
}

const verdict = (a: { correct: boolean; timeout: boolean } | null): string =>
  !a || a.timeout ? 'out' : a.correct ? 'ok' : 'bad';

const pts = (a: { points: number; timeout: boolean } | null): string =>
  !a || a.timeout ? '—' : `+${a.points}`;

/** What one side got out of the match, under the scoreline. */
const tally = (racing: boolean, answers: readonly (RoundAnswer | null)[], of: number): string =>
  (racing ? `${correctOf(answers)} of ${of} named` : `${correctOf(answers)}/${of} right`);

/**
 * A trial's two lists, side by side.
 *
 * Not a run of rounds: the two sides were never asked the same thing at the
 * same time, so row three is this player's third name beside that player's
 * third, and neither has anything to say about the other. The round-by-round
 * strip read a trial off the match's plan instead — fifty states the seed
 * drew and nobody was asked — and so listed a match neither player played.
 */
function NamesIn({ mine, theirs, names, colors }: {
  mine: TrialName[]; theirs: TrialName[];
  names: { me: string; them: string }; colors: { me: PlayerColor; them: PlayerColor };
}) {
  return (
    <ol>
      {Array.from({ length: Math.max(mine.length, theirs.length) }, (_, i) => (
        <li key={i}>
          <b className="mono">{i + 1}</b>
          <NameCell name={mine[i]} who={names.me} color={colors.me} />
          <NameCell name={theirs[i]} who={names.them} color={colors.them} />
        </li>
      ))}
    </ol>
  );
}

function NameCell({ name, who, color }: { name: TrialName | undefined; who: string; color: PlayerColor }) {
  return (
    <span className={`vs-named${name ? '' : ' none'}`} data-pc={color} aria-label={`${who}: ${name ? BY[name.abbr].n : 'nothing'}`}>
      <em>{name ? BY[name.abbr].n : '—'}</em>
      {name && <i className="mono">{fmtTime(name.ms)}</i>}
    </span>
  );
}

function AwardCard({ award, me, them, colors }: {
  award: Award; me: string; them: string; colors: { me: PlayerColor; them: PlayerColor };
}) {
  const who = award.who === 'me' ? 'You' : award.who === 'them' ? them : `${me} & ${them}`;
  const pc = award.who === 'both' ? undefined : colors[award.who];
  return (
    <li className="vs-award" data-pc={pc}>
      <em>{who}</em>
      <b>{award.label}</b>
      <span>{award.note}</span>
    </li>
  );
}

/** One line of the numbers behind the score. */
interface StatRow {
  label: string;
  a: string;
  b: string;
  better: 'me' | 'them' | null;
}

const matchRows = (mine: SideStats, theirs: SideStats): StatRow[] => [
  { label: 'Rounds won', a: String(mine.roundsWon), b: String(theirs.roundsWon), better: higher(mine.roundsWon, theirs.roundsWon) },
  { label: 'Right', a: `${mine.correct}/${mine.asked}`, b: `${theirs.correct}/${theirs.asked}`, better: higher(mine.correct, theirs.correct) },
  { label: 'Fastest', a: secs(mine.fastestMs), b: secs(theirs.fastestMs), better: lower(mine.fastestMs, theirs.fastestMs) },
  { label: 'Average', a: secs(mine.avgMs), b: secs(theirs.avgMs), better: lower(mine.avgMs, theirs.avgMs) },
  { label: 'Best streak', a: String(mine.bestStreak), b: String(theirs.bestStreak), better: higher(mine.bestStreak, theirs.bestStreak) },
];

/**
 * The same layout for a race, over numbers a race actually has.
 *
 * "Last in" decides the match only when the two lists are level, so it is
 * lit only then: whoever named more finished later almost by definition,
 * and marking that as the worse of the two would be backwards.
 */
const raceRows = (mine: RaceStats, theirs: RaceStats): StatRow[] => {
  const level = mine.named === theirs.named;
  return [
    { label: 'Named', a: `${mine.named}/${mine.target}`, b: `${theirs.named}/${theirs.target}`, better: higher(mine.named, theirs.named) },
    { label: 'First in', a: clock(mine.firstMs), b: clock(theirs.firstMs), better: lower(mine.firstMs, theirs.firstMs) },
    { label: 'Last in', a: clock(mine.lastMs), b: clock(theirs.lastMs), better: level ? lower(mine.lastMs, theirs.lastMs) : null },
  ];
};

/** The numbers behind the score, side by side, with the better of each pair lit. */
function Stats({ rows, names, colors }: {
  rows: StatRow[];
  names: { me: string; them: string }; colors: { me: PlayerColor; them: PlayerColor };
}) {
  return (
    <section className="vs-stats" aria-label="Match statistics">
      <i className="me" data-pc={colors.me}>{names.me}</i>
      <span aria-hidden="true" />
      <i className="them" data-pc={colors.them}>{names.them}</i>
      {rows.map((r) => (
        <div className="vs-stats-row" key={r.label}>
          <b className={`me mono${r.better === 'me' ? ' top' : ''}`} data-pc={colors.me}>{r.a}</b>
          <span>{r.label}</span>
          <b className={`them mono${r.better === 'them' ? ' top' : ''}`} data-pc={colors.them}>{r.b}</b>
        </div>
      ))}
    </section>
  );
}

const clock = (ms: number | null): string => (ms === null ? '—' : fmtTime(ms));

const higher = (a: number, b: number): 'me' | 'them' | null => (a > b ? 'me' : b > a ? 'them' : null);
const lower = (a: number | null, b: number | null): 'me' | 'them' | null =>
  a === null && b === null ? null : a === null ? 'them' : b === null ? 'me' : a < b ? 'me' : b < a ? 'them' : null;
