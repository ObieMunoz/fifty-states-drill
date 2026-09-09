import { useCallback, useEffect, useRef, useState } from 'react';
import { MODES, MODE_KEYS } from '../data/modes';
import { useGame } from '../game/context';
import type { ModeKey } from '../types';

const LEARN = MODE_KEYS.filter((k) => MODES[k].g === 'learn');
const QUIZ = MODE_KEYS.filter((k) => MODES[k].g === 'quiz');

interface GroupProps {
  keys: ModeKey[];
  label: string;
  group: 'learn' | 'quiz';
  mode: ModeKey;
  onPick: (m: ModeKey) => void;
}

function ModeGroup({ keys, label, group, mode, onPick }: GroupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  // Only ever updates the fade. Must not move anything: this runs on every
  // scroll event, so nudging the scroller here would fight the finger and snap
  // back.
  const updateFade = useCallback(() => {
    const g = ref.current;
    if (!g) return;
    setMore(g.scrollWidth > g.clientWidth + 1 && g.scrollLeft + g.clientWidth < g.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateFade();
    window.addEventListener('resize', updateFade);
    return () => window.removeEventListener('resize', updateFade);
  }, [updateFade]);

  // Runs on mode change only, and scrolls the group itself rather than using
  // scrollIntoView, which walks every ancestor and pans the whole page on mobile.
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const on = g.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (on) {
      const gr = g.getBoundingClientRect();
      const br = on.getBoundingClientRect();
      if (br.left < gr.left) g.scrollLeft -= gr.left - br.left + 12;
      else if (br.right > gr.right) g.scrollLeft += br.right - gr.right + 12;
    }
    updateFade();
  }, [mode, updateFade]);

  return (
    <div className={`mrow${more ? ' more' : ''}`}>
      <span className="glab">{label}</span>
      <div ref={ref} className={`mgroup ${group}`} onScroll={updateFade}>
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === mode}
            onClick={() => onPick(k)}
          >
            {MODES[k].label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ModeBar() {
  const { state, dispatch } = useGame();
  const pick = (mode: ModeKey) => dispatch({ type: 'setMode', mode });

  return (
    <nav className="modebar" aria-label="Modes">
      <ModeGroup keys={LEARN} label="Learn" group="learn" mode={state.mode} onPick={pick} />
      <span className="sep" aria-hidden="true" />
      <ModeGroup keys={QUIZ} label="Quiz" group="quiz" mode={state.mode} onPick={pick} />
    </nav>
  );
}
