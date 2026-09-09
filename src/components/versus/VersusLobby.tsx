import { DIFFS, DIFF_KEYS, MODES } from '../../data/modes';
import { REGS, ST } from '../../data/states';
import { ROUND_CHOICES, VERSUS_MODES } from '../../versus/types';
import type { VersusApi } from '../../versus/useVersus';
import type { DiffKey, ModeKey, Scope } from '../../types';

/**
 * The pre-match screen.
 *
 * The host owns the rules; the guest sees them settle in real time and cannot
 * edit them. What the guest *does* own is their own level — the two players
 * can be on different ones, which is the point: a Guided player picking from
 * four and an Expert typing blind can share a match and it is still a race.
 *
 * Those two facts have to be legible at a glance, so the guest is never shown
 * the host's controls greyed out. A dimmed row of chips still reads as a row
 * of chips on a phone, and a tap that does nothing feels like a broken app
 * rather than a rule. The guest gets a plain readout of the settled values
 * instead: nothing on it looks pressable, and the only thing that does — their
 * own level — is the one thing they can actually change.
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
        {isHost
          ? <HostRules draft={draft} setDraft={api.setDraft} />
          : <GuestRules draft={draft} host={them?.name} />}
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

type Draft = { mode: ModeKey; rounds: number; scope: Scope };

/** How a scope reads on its own, away from the chip that would have set it. */
const scopeName = (scope: Scope) => (scope === 'all' ? 'All 50' : scope.slice(2));

/** The host's editable rules: everything on offer, one row per setting. */
function HostRules({ draft, setDraft }: {
  draft: Draft;
  setDraft: (d: Partial<Draft>) => void;
}) {
  return (
    <>
      <span className="eyebrow">Your rules</span>

      <div className="vs-pick">
        <span className="vs-pick-lab">Quiz</span>
        <div className="vs-chips">
          {VERSUS_MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={draft.mode === m}
              onClick={() => setDraft({ mode: m })}
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
              onClick={() => setDraft({ rounds: n })}
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
            onClick={() => setDraft({ scope: 'all' })}
          >
            All 50
          </button>
          {REGS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={draft.scope === `r:${r}`}
              onClick={() => setDraft({ scope: `r:${r}` })}
            >
              {r} <i>{ST.filter((s) => s.reg === r).length}</i>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * The same rules as the guest sees them: settled values only, no controls.
 *
 * Each value is keyed on itself so React remounts it when the host changes it,
 * which replays the flash — that is what "watching them settle" looks like
 * from this side, and it is also why the list is announced politely.
 */
function GuestRules({ draft, host }: { draft: Draft; host?: string }) {
  return (
    <>
      <span className="eyebrow vs-locked-by">
        <LockIcon />
        {host ? `${host} sets the rules` : 'The host sets the rules'}
      </span>
      <dl className="vs-readout" aria-live="polite">
        <div>
          <dt>Quiz</dt>
          <dd key={draft.mode}>{MODES[draft.mode].label}</dd>
        </div>
        <div>
          <dt>Rounds</dt>
          <dd key={draft.rounds}>{draft.rounds}</dd>
        </div>
        <div>
          <dt>States</dt>
          <dd key={draft.scope}>{scopeName(draft.scope)}</dd>
        </div>
      </dl>
      <p className="vs-readout-note">Your level below is yours to set.</p>
    </>
  );
}

function LockIcon() {
  return (
    <svg className="vs-lock" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M3.6 5V3.6a2.4 2.4 0 0 1 4.8 0V5" fill="none"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="2.3" y="5" width="7.4" height="5.4" rx="1.3" fill="currentColor" />
    </svg>
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
