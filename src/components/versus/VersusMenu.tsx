import { useEffect, useRef, useState } from 'react';
import { BUILD } from '../../build';
import { MAX_NAME, cleanName, clearName } from '../../versus/identity';
import { CODE_LENGTH, isCompleteCode, normalizeCode } from '../../versus/room';
import { usePush } from '../../versus/usePush';
import { Friends } from './Friends';
import { Leaderboard } from './Leaderboard';
import { Notifications } from './Notifications';
import type { VersusApi } from '../../versus/useVersus';

/**
 * The front door: who you are, and whether you are starting a room or joining
 * one. The name is remembered between sessions and pre-filled here, which is
 * the only thing this app stores about a person.
 *
 * Arriving on an invite link is the one case that skips the door: the room is
 * known, and a saved name has already put the player in it before this
 * renders. What is left here is the player with no name yet — they are asked
 * for one and nothing else, and go in the moment they give it.
 */
export function VersusMenu({ api, onExit }: { api: VersusApi; onExit: () => void }) {
  const { state } = api;
  const [name, setName] = useState(state.me.name);
  const [mode, setMode] = useState<'idle' | 'join' | 'invited'>(
    state.code ? 'invited' : 'idle',
  );
  const [code, setCode] = useState(state.code);
  const nameRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const push = usePush();

  useEffect(() => {
    if (mode === 'join') codeRef.current?.focus();
    if (mode === 'invited') nameRef.current?.focus();
  }, [mode]);

  const named = cleanName(name).length > 0;
  const ready = named && isCompleteCode(code);
  const invited = mode === 'invited';
  const accept = () => { if (named) api.join(state.code, name); };

  return (
    <div className="vs-sheet">
      <header className="vs-top">
        <button type="button" className="vs-back" onClick={onExit} aria-label="Back to solo practice">
          ← Solo
        </button>
        <span className="eyebrow">Versus</span>
      </header>

      <div className="vs-hero">
        {invited ? (
          <>
            <h1>You’re invited</h1>
            <p>Someone sent you room {state.code}. Add your name and you’re in.</p>
          </>
        ) : (
          <>
            <h1>Head to head</h1>
            <p>
              Two phones, the same questions, one clock. Fastest right answer takes the round.
            </p>
          </>
        )}
      </div>

      <label className="vs-field">
        <span className="eyebrow">Your name</span>
        <div className="vs-nameRow">
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
            onKeyDown={(e) => { if (e.key === 'Enter' && invited) accept(); }}
            placeholder="Who's playing?"
            maxLength={MAX_NAME}
            autoComplete="given-name"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Your name"
            enterKeyHint="done"
          />
          {named && (
            <button
              type="button"
              className="vs-mini"
              onClick={() => { clearName(); setName(''); }}
            >
              Reset
            </button>
          )}
        </div>
      </label>

      {state.error && <p className="vs-error" role="alert">{state.error}</p>}

      {invited ? (
        <div className="vs-actions">
          <button
            type="button"
            className="vs-big primary"
            disabled={!named}
            onClick={accept}
          >
            Join room {state.code}
            <small>{named ? `Playing as ${cleanName(name)}` : 'Add your name first'}</small>
          </button>
          <button type="button" className="vs-big ghost" onClick={() => setMode('idle')}>
            Not this room
          </button>
        </div>
      ) : mode === 'idle' ? (
        <div className="vs-actions">
          <button
            type="button"
            className="vs-big primary"
            disabled={!named}
            onClick={() => api.host(name)}
          >
            Start a room
            <small>You pick the rules</small>
          </button>
          <button
            type="button"
            className="vs-big"
            disabled={!named}
            onClick={() => setMode('join')}
          >
            Join a room
            <small>Enter their code</small>
          </button>
        </div>
      ) : (
        <div className="vs-join">
          <label className="vs-field">
            <span className="eyebrow">Room code</span>
            <input
              ref={codeRef}
              className="vs-code-in mono"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter' && ready) api.join(code, name); }}
              placeholder={'·'.repeat(CODE_LENGTH)}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={CODE_LENGTH}
              aria-label="Room code"
              enterKeyHint="go"
            />
          </label>
          <div className="vs-actions">
            <button
              type="button"
              className="vs-big primary"
              disabled={!ready}
              onClick={() => api.join(code, name)}
            >
              Join
            </button>
            <button type="button" className="vs-big ghost" onClick={() => setMode('idle')}>
              Back
            </button>
          </div>
        </div>
      )}

      <Friends
        friends={api.friends}
        canAsk={named}
        onAsk={(f) => api.requestRematch(f, name)}
        onRemove={api.removeFriend}
      />

      <Notifications push={push} />

      <Leaderboard rows={api.board} onCleared={api.clearBoard} />

      <p className="vs-fine">
        A room lives on the server only while you play. Nobody signs in, and the standings
        and friends above never leave this device.
        <span className="vs-diag">Build {BUILD}</span>
      </p>
    </div>
  );
}
