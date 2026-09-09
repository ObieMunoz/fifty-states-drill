import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { DC_PATH, ST } from '../data/states';
import { DIFFS, trackOrNull } from '../data/modes';
import { useGame } from '../game/context';
import { inScope } from '../game/scope';
import { levelFor } from '../game/progress';
import { useViewBox } from '../hooks/useViewBox';
import type { Abbr, State } from '../types';

/** Label anchors are only legible once the state is a reasonable fraction of the frame. */
const LABEL_MIN_RATIO = 0.027;

/** Reference viewBox width; label metrics scale against it. */
const REF_WIDTH = 975;

/** Padding on the invisible hit target, so Rhode Island is still tappable. */
const hitPad = (s: State) => (s.ar < 1200 ? 7 : s.ar < 4000 ? 3.5 : 1);

export function UsMap() {
  const { state, dispatch } = useGame();
  const { mode, qm, ask, locked, sel, letter, labels, scope, recall, hookSet, progress, dif } = state;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Abbr | null>(null);
  const viewWidth = useViewBox(svgRef, state.zoom);

  // Geometry never changes, so keep React from rebuilding a hundred nodes.
  const defs = useMemo(() => (
    <defs>
      {ST.map((s) => <path key={s.a} id={`p-${s.a}`} d={s.d} />)}
      <path id="p-DC" d={DC_PATH} />
    </defs>
  ), []);

  const hitTargets = useMemo(() => (
    // Largest first, so a small state's padded target sits on top of its neighbours.
    [...ST].sort((a, b) => b.ar - a.ar).map((s) => (
      <use key={s.a} href={`#p-${s.a}`} strokeWidth={hitPad(s)} data-a={s.a} />
    ))
  ), []);

  /** Silhouette mode shows one state and nothing else. */
  const solo = qm === 'shape' && ask ? ask.s.a : null;
  const track = trackOrNull(qm);
  const hoverOK = mode === 'map' || mode === 'letter';
  const interactive =
    mode === 'map' || mode === 'letter' || mode === 'hooks' || mode === 'weak' ||
    (qm === 'find' && !locked);

  const letterSet = mode === 'letter'
    ? new Set(ST.filter((s) => s.n[0] === letter).map((s) => s.a))
    : null;

  function classOf(s: State): string {
    if (solo) {
      // Everything but the target is hidden, so it needs no styling of its own.
      if (s.a !== solo) return 'st';
      return locked && ask ? (ask.won ? 'st ok' : 'st bad') : 'st solo';
    }
    const c = ['st'];
    const L = levelFor(progress, s.a, track);

    if (recall) {
      if (recall.got.has(s.a)) c.push('ok');
      else if (recall.done) c.push('bad');
    } else {
      if (L > 0) c.push('m' + L);
      if (track && L < 2 && (progress.err[s.a] ?? 0) > 0) c.push('weak');
    }

    if (letterSet && !letterSet.has(s.a)) c.push('mute');
    if (mode === 'hooks' && hookSet) c.push(hookSet.has(s.a) ? 'pick' : 'mute');
    // Guided dims everything outside the target's census division.
    if (ask && !locked && qm === 'find' && DIFFS[dif].regionHint && s.div !== ask.s.div) c.push('mute');
    if (scope !== 'all' && !inScope(s, scope, progress)) c.push('mute');

    if (ask && ask.show === s.a && !locked) c.push('target');
    if (ask && locked && ask.s.a === s.a) c.push('ok');
    if (ask && !ask.won && ask.hit && ask.hit !== ask.s.a && ask.hit === s.a) c.push('bad');
    if (sel === s.a && hoverOK) c.push('pick');
    if (hover === s.a && hoverOK && sel !== s.a) c.push('hov');
    return c.join(' ');
  }

  const labelStyle = {
    fontSize: `${(viewWidth / REF_WIDTH * 11).toFixed(1)}px`,
    strokeWidth: `${(viewWidth / REF_WIDTH * 3.5).toFixed(1)}px`,
  };
  const labelVisible = (s: State) => {
    // Hawaii is small but sits alone in open water, so it always has room.
    const big = Math.sqrt(s.ar) / viewWidth > LABEL_MIN_RATIO;
    return labels && (big || s.a === 'HI') && (scope === 'all' || inScope(s, scope, progress));
  };

  const abbrAt = (e: ReactPointerEvent | ReactMouseEvent): Abbr | null =>
    ((e.target as SVGElement).dataset.a as Abbr | undefined) ?? null;

  return (
    <svg
      ref={svgRef}
      className={`map${solo ? ' solo' : ''}`}
      id="map"
      role="img"
      aria-label="Map of the United States"
    >
      {defs}

      <g>
        {ST.map((s) => (
          <use
            key={s.a}
            href={`#p-${s.a}`}
            className={classOf(s)}
            style={solo && s.a !== solo ? { display: 'none' } : undefined}
          />
        ))}
        <use href="#p-DC" className="dc" />
      </g>

      <text className="water" x={905} y={415} textAnchor="middle">Atlantic Ocean</text>
      <text className="note" x={16} y={615}>
        Albers equal-area projection · Alaska shown at ⅓ scale
      </text>

      <g>
        {ST.map((s) => (
          <text
            key={s.a}
            className="lab"
            x={s.c[0]}
            y={s.c[1]}
            style={{ ...labelStyle, display: labelVisible(s) ? undefined : 'none' }}
          >
            {s.a}
          </text>
        ))}
      </g>

      <g
        id="hit"
        className={`hit ${interactive ? 'live' : 'off'}`}
        onClick={(e) => { const a = abbrAt(e); if (a) dispatch({ type: 'tapState', abbr: a }); }}
        onPointerMove={(e) => { if (hoverOK) setHover(abbrAt(e)); }}
        onPointerLeave={() => setHover(null)}
      >
        {hitTargets}
      </g>
    </svg>
  );
}
