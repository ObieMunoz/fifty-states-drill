import { useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { DC_PATH, ST } from '../../data/states';
import { useViewBox } from '../../hooks/useViewBox';
import { stateClass } from '../../versus/marks';
import type { MapMarks } from '../../versus/marks';
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
  /** The right answer, revealed once the round is graded. */
  answer?: Abbr | null;
  revealed?: boolean;
  onPick?: (abbr: Abbr) => void;
  disabled?: boolean;
}

export function VersusMap({
  zoom, highlight = null, divisionHint = null, solo = null,
  picked = null, answer = null, revealed = false, onPick, disabled = false,
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
  const marks: MapMarks = { solo, highlight, divisionHint, picked, answer, revealed };

  return (
    <svg
      ref={svgRef}
      className={`map vs-map${solo ? ' solo' : ''}`}
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
