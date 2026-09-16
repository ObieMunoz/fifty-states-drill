import { useMemo, useRef, useState } from 'react';
import { BY } from '../../data/states';
import { fullBox } from '../../lib/geo';
import { trialTarget } from '../../versus/trial';
import { ReactionBubbles, ReactionTray } from './Reactions';
import { SoundToggle } from './SoundToggle';
import { VersusMap } from './VersusMap';
import { LinkNotice } from './LinkNotice';
import type { VersusApi } from '../../versus/useVersus';
import type { Abbr } from '../../types';

/** Under this much left, the clock reads urgent. */
const LOW_MS = 30_000;

const clock = (ms: number): string => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Time Trial: both players racing their own list against one clock.
 *
 * Nothing here is shared but the clock and the score line. There is no
 * question, no reveal and no waiting on the other player — you type, the map
 * fills, and the only thing the opponent's half of the screen tells you is
 * how far ahead or behind you are, which is the whole of the pressure.
 */
export function VersusTrial({ api }: { api: VersusApi }) {
  const { state, msLeft, myTotal, theirTotal } = api;
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const target = trialTarget(state.cfg?.scope ?? 'all');
  const left = msLeft ?? 0;
  const low = left <= LOW_MS;

  /* Everything this player has named, in the order they named it. The map
     paints the set; the last one is called out under the box, which is the
     only acknowledgement a name gets — there is no reveal to wait for. */
  const named = useMemo(() => {
    const out: Abbr[] = [];
    for (const a of state.myAnswers) if (a?.pick) out.push(a.pick as Abbr);
    return out;
  }, [state.myAnswers]);

  const placed = useMemo(() => new Set(named), [named]);
  const last = named.length ? BY[named[named.length - 1]] : null;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    api.answerName(text);
    setText('');
    inputRef.current?.focus();
  };

  return (
    <div className="vs-sheet vs-trial">
      <div className="vs-scores" data-lead={myTotal === theirTotal ? 'tie' : myTotal > theirTotal ? 'me' : 'them'}>
        <div className="vs-score me" data-pc={state.me.color}>
          <span className="vs-score-name">{state.me.name}</span>
          <b className="mono">{myTotal}</b>
        </div>
        <div className="vs-score them" data-pc={state.them?.color ?? 'coral'}>
          <span className="vs-score-name">{state.them?.name ?? (state.lastOpponent || 'Opponent')}</span>
          <b className="mono">{theirTotal}</b>
        </div>
        <ReactionBubbles reactions={api.reactions} them={state.them?.name ?? 'Opponent'} />
      </div>

      <div className="vs-clock" aria-hidden="true">
        <i style={{ transform: `scaleX(${Math.max(0, left / (api.limitMs || 1))})` }} className={low ? 'low' : undefined} />
      </div>

      <div className="vs-round-line">
        <span className="eyebrow">{myTotal} of {target} named</span>
        <span className="vs-round-right">
          <span className={`vs-secs mono${low ? ' low' : ''}`}>{clock(left)}</span>
          <SoundToggle />
        </span>
      </div>

      <div className="vs-stage">
        <VersusMap zoom={fullBox()} placed={placed} colors={{ mine: state.me.color, theirs: state.them?.color ?? 'coral' }} />
      </div>

      <form className="vs-entry" onSubmit={send}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Name a state"
          aria-label="Name a state"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="send"
          autoFocus
        />
        <button type="submit" className="vs-send" disabled={!text.trim()}>Go</button>
      </form>

      <p className="vs-tap" role="status">
        {last ? `${last.n} — ${target - myTotal} to go` : `Type them as fast as you can. ${target} to go.`}
      </p>

      <ReactionTray onReact={api.react} small />
      <LinkNotice state={state} />
    </div>
  );
}
