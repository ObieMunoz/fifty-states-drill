import { useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { DC_PATH, ST } from '../../data/states';
import { useViewBox } from '../../hooks/useViewBox';
import { pinsFor, stateClass } from '../../versus/marks';
import type { MapMarks } from '../../versus/marks';
import type { PlayerColor } from '../../versus/types';
import type { Abbr, Box, State } from '../../types';

/**
 * The map, cut down for a phone in the middle of a race.
 *
 * Deliberately not the solo `UsMap`: that one reads the whole game state out
 * of context — mastery shading, hover, postal labels, region muting — none of
 * which belongs in a match, and all of which would be noise on a small screen.
 * What is left is a big tap target and one clear answer.
 */

/** Padding on the invisible hit target, so Rhode Island is still tappable.
    Larger than the solo map's: this is a thumb on a phone, not a mouse. */
const hitPad = (s: State) => (s.ar < 1200 ? 10 : s.ar < 4000 ? 5 : 1.5);

/** A pin's radius in map units: readable on a phone at the full frame. */
const PIN_R = 7;

export interface VersusMapProps {
  zoom: Box;
  /** Lit while the question is live, e.g. the state Borders is asking about. */
  highlight?: Abbr | null;
  /** Guided keeps only this census division lit in Find It. */
  divisionHint?: string | null;
  /** Shown alone, with everything else hidden. */
  solo?: Abbr | null;
  /** What this player tapped. */
  picked?: Abbr | null;
  /** What the opponent tapped. Painted only once revealed. */
  theirPick?: Abbr | null;
  /** The right answer, revealed once the round is graded. */
  answer?: Abbr | null;
  revealed?: boolean;
  /** Seat colours, so a live tap and the reveal's pins say whose they are. */
  colors?: { mine: PlayerColor; theirs: PlayerColor };
  onPick?: (abbr: Abbr) => void;
  disabled?: boolean;
}

const DEFAULT_COLORS = { mine: 'teal', theirs: 'coral' } as const;

export function VersusMap({
  zoom, highlight = null, divisionHint = null, solo = null,
  picked = null, theirPick = null, answer = null, revealed = false,
  colors = DEFAULT_COLORS, onPick, disabled = false,
}: VersusMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useViewBox(svgRef, zoom);

  // Geometry never changes, so keep React from rebuilding a hundred nodes.
  const defs = useMemo(() => (
    <defs>
      {ST.map((s) => <path key={s.a} id={`vp-${s.a}`} d={s.d} />)}
      <path id="vp-DC" d={DC_PATH} />
    </defs>
  ), []);

  const hitTargets = useMemo(() => (
    // Largest first, so a small state's padded target sits on top of its neighbours.
    [...ST].sort((a, b) => b.ar - a.ar).map((s) => (
      <use key={s.a} href={`#vp-${s.a}`} strokeWidth={hitPad(s)} data-a={s.a} />
    ))
  ), []);

  const abbrAt = (e: ReactMouseEvent): Abbr | null =>
    ((e.target as SVGElement).dataset.a as Abbr | undefined) ?? null;

  const live = !disabled && !!onPick && !revealed;
  // One object for the whole map rather than one per state.
  const marks: MapMarks = { solo, highlight, divisionHint, picked, theirPick, answer, revealed };
  const pins = pinsFor(marks, colors);

  return (
    <svg
      ref={svgRef}
      className={`map vs-map${solo ? ' solo' : ''}`}
      data-pc={colors.mine}
      role="img"
      aria-label="Map of the United States"
    >
      {defs}
      <g>
        {ST.map((s) => (
          <use
            key={s.a}
            href={`#vp-${s.a}`}
            className={stateClass(s, marks)}
            style={solo && s.a !== solo ? { display: 'none' } : undefined}
          />
        ))}
        {!solo && <use href="#vp-DC" className="dc" />}
      </g>
      {pins.length > 0 && (
        <g className="vs-pins" aria-hidden="true">
          {pins.map((p) => (
            <g key={p.color} className="vs-pin" data-pc={p.color} transform={`translate(${p.x} ${p.y})`}>
              <circle r={PIN_R} />
              <circle r={PIN_R * 0.38} className="vs-pin-dot" />
            </g>
          ))}
        </g>
      )}
      <g
        className={`hit ${live ? 'live' : 'off'}`}
        onClick={(e) => {
          if (!live) return;
          const a = abbrAt(e);
          if (a) onPick(a);
        }}
      >
        {hitTargets}
      </g>
    </svg>
  );
}
