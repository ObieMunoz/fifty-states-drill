import { useCallback } from 'react';
import { HOOKS } from '../../data/hooks';
import { useGame } from '../../game/context';

export function HooksPanel() {
  const { state, dispatch } = useGame();

  /* A hook opened near the foot of the column would unfold its body below the
     fold, so bring it back into view. `nearest` moves the least it can, which
     leaves a card that already fits exactly where it is — so the jump is only
     ever the few pixels the body added, and wants no animation.
     This is a callback ref rather than an effect over a shared object ref: with
     one ref shared by every card, React detaches the closing card after it has
     attached the opening one, and the effect finds nothing but null. */
  const openCard = useCallback((el: HTMLButtonElement | null) => {
    el?.scrollIntoView({ block: 'nearest' });
  }, []);

  return (
    <>
      <div className="eyebrow">Learn · Hooks</div>
      <h2 className="ask sm">Things that make the fifty stick</h2>
      <div className="sub">Tap any hook to read it and light the states it talks about.</div>

      {HOOKS.map((sec, gi) => (
        <div className="hookgrp" key={sec.g}>
          <h3 className="eyebrow">{sec.g}</h3>
          {sec.items.map((h, ii) => {
            const open = state.sel === `h${gi}-${ii}`;
            return (
              <button
                key={h.t}
                ref={open ? openCard : undefined}
                className={`hook ${open ? 'on' : ''}`}
                type="button"
                aria-expanded={open}
                onClick={() => dispatch({ type: 'selectHook', group: gi, item: ii })}
              >
                <b>{h.t}</b>
                {/* Collapsed, a hook is just its title and its states: all
                    eighteen stay scannable at once, and the body arrives only
                    for the one being read. */}
                {open && <span>{h.b}</span>}
                {/* Past four, the codes crowd the title out of its own row, so
                    they become a count and the map does the showing. */}
                <u className="mono">{h.s.length > 4 ? `${h.s.length} states` : h.s.join(' · ')}</u>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}
