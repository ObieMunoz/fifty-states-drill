import { HOOKS } from '../../data/hooks';
import { useGame } from '../../game/context';

export function HooksPanel() {
  const { state, dispatch } = useGame();

  return (
    <>
      <div className="eyebrow">Learn · Hooks</div>
      <h2 className="ask sm">Things that make the fifty stick</h2>
      <div className="sub">Tap any hook to light the states it talks about.</div>

      {HOOKS.map((sec, gi) => (
        <div className="hookgrp" key={sec.g}>
          <h3 className="eyebrow">{sec.g}</h3>
          {sec.items.map((h, ii) => (
            <button
              key={h.t}
              className={`hook ${state.sel === `h${gi}-${ii}` ? 'on' : ''}`}
              type="button"
              onClick={() => dispatch({ type: 'selectHook', group: gi, item: ii })}
            >
              <b>{h.t}</b>
              <span>{h.b}</span>
              {/* Long lists become a count; the map is doing the showing. */}
              <u className="mono">{h.s.length > 8 ? `${h.s.length} states` : h.s.join(' · ')}</u>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}
