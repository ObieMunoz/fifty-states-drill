import { DIFFS, DIFF_KEYS, MODES } from '../../data/modes';
import { REGS, ST } from '../../data/states';
import { ROUND_CHOICES, VERSUS_MODES } from '../../versus/types';
import type { VersusApi } from '../../versus/useVersus';
import type { DiffKey } from '../../types';

/**
 * The pre-match screen.
 *
 * The host owns the rules; the guest sees them settle in real time and cannot
 * edit them. What the guest *does* own is their own level — the two players
 * can be on different ones, which is the point: a Guided player picking from
 * four and an Expert typing blind can share a match and it is still a race.
 */
export function VersusLobby({ api }: { api: VersusApi }) {
  const { state } = api;
  const { me, them, draft, isHost } = state;
  const bothReady = me.ready && them?.ready;

  return (
    <div className="vs-sheet vs-lobby">
      <header className="vs-top">
        <button type="button" className="vs-back" onClick={api.leave}>← Leave</button>
        <span className="eyebrow mono">Room {state.code}</span>
      </header>

      <div className="vs-versus">
        <PlayerCard
          side="me"
          name={me.name}
          dif={me.dif}
          ready={me.ready}
          onDif={api.setDif}
        />
        <span className="vs-vs" aria-hidden="true">vs</span>
        <PlayerCard
          side="them"
          name={them?.name || (state.lastOpponent ? `${state.lastOpponent} (gone)` : 'Waiting…')}
          dif={them?.dif ?? 'standard'}
          ready={!!them?.ready}
        />
      </div>

      <section className="vs-rules">
        <span className="eyebrow">
          {isHost ? 'Your rules' : `${them?.name ?? 'The host'} sets the rules`}
        </span>

        <div className="vs-pick">
          <span className="vs-pick-lab">Quiz</span>
          <div className="vs-chips">
            {VERSUS_MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={draft.mode === m}
                disabled={!isHost}
                onClick={() => api.setDraft({ mode: m })}
              >
                {MODES[m].label}
              </button>
            ))}
          </div>
        </div>

        <div className="vs-pick">
          <span className="vs-pick-lab">Rounds</span>
          <div className="vs-chips">
            {ROUND_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={draft.rounds === n}
                disabled={!isHost}
                onClick={() => api.setDraft({ rounds: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="vs-pick">
          <span className="vs-pick-lab">States</span>
          <div className="vs-chips">
            <button
              type="button"
              aria-pressed={draft.scope === 'all'}
              disabled={!isHost}
              onClick={() => api.setDraft({ scope: 'all' })}
            >
              All 50
            </button>
            {REGS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={draft.scope === `r:${r}`}
                disabled={!isHost}
                onClick={() => api.setDraft({ scope: `r:${r}` })}
              >
                {r} <i>{ST.filter((s) => s.reg === r).length}</i>
              </button>
            ))}
          </div>
        </div>
      </section>

      <p className="vs-fine">{DIFFS[me.dif].blurb}</p>

      <div className="vs-foot">
        <button
          type="button"
          className={`vs-big ${me.ready ? 'on' : 'primary'}`}
          disabled={!them}
          onClick={() => api.setReady(!me.ready)}
        >
          {me.ready ? 'Ready — tap to cancel' : "I'm ready"}
        </button>
        <p className="vs-foot-note" role="status">
          {!them ? `Waiting for ${state.lastOpponent || 'the other player'} to reconnect…`
            : bothReady ? 'Starting…'
              : me.ready ? `Waiting for ${them.name}…`
                : them.ready ? `${them.name} is ready` : 'Both players tap ready to start'}
        </p>
      </div>
    </div>
  );
}

function PlayerCard({
  side, name, dif, ready, onDif,
}: {
  side: 'me' | 'them';
  name: string;
  dif: DiffKey;
  ready: boolean;
  onDif?: (d: DiffKey) => void;
}) {
  return (
    <div className={`vs-card ${side}${ready ? ' ready' : ''}`}>
      <span className="eyebrow">{side === 'me' ? 'You' : 'Opponent'}</span>
      <b className="vs-name">{name}</b>
      {onDif ? (
        <div className="vs-levels">
          {DIFF_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              data-d={k}
              aria-pressed={dif === k}
              onClick={() => onDif(k)}
            >
              {DIFFS[k].label}
            </button>
          ))}
        </div>
      ) : (
        <span className="vs-level-tag" data-d={dif}>{DIFFS[dif].label}</span>
      )}
      <span className="vs-ready-tag">{ready ? 'Ready' : '—'}</span>
    </div>
  );
}
