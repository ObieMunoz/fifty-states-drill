import { useEffect, useRef } from 'react';
import { useWakeLock } from '../../hooks/useWakeLock';
import { useVersus } from '../../versus/useVersus';
import { VersusMenu } from './VersusMenu';
import { VersusWaiting } from './VersusWaiting';
import { VersusLobby } from './VersusLobby';
import { VersusCountdown } from './VersusCountdown';
import { VersusPlay } from './VersusPlay';
import { VersusFinal } from './VersusFinal';

/**
 * Versus mode, top to bottom.
 *
 * A full-screen takeover rather than a panel in the solo layout: a match is
 * played on a phone held in one hand, and the map, rail and roster that make
 * sense while studying are all noise while racing.
 */
export function VersusScreen({ onExit }: { onExit: () => void }) {
  const api = useVersus();
  const { phase } = api.state;

  // Lets the stylesheet reclaim the whole viewport and lock the page down.
  useEffect(() => {
    document.body.dataset.versus = '1';
    return () => { delete document.body.dataset.versus; };
  }, []);

  // A phone set down to wait, or mid-match, must not lock and freeze the room.
  useWakeLock(phase !== 'menu' && phase !== 'final');

  // Leaving from anywhere tears the connection down before the solo app returns.
  const left = useRef(false);
  const exit = () => { left.current = true; api.leave(); onExit(); };

  // The back button unmounts this screen without passing through Leave; the
  // room still has to be told. Refs, so the cleanup sees the latest without
  // re-arming on every render; the phase check keeps development's rehearsal
  // unmount from leaving a room that has only just been asked for.
  const latest = useRef({ leave: api.leave, phase });
  useEffect(() => { latest.current = { leave: api.leave, phase }; }, [api.leave, phase]);
  useEffect(() => () => {
    if (!left.current && latest.current.phase !== 'menu') latest.current.leave();
  }, []);

  return <div className="vs-root">{screen()}</div>;

  function screen() {
    switch (phase) {
      case 'menu':      return <VersusMenu api={api} onExit={exit} />;
      case 'connecting': return <VersusWaiting api={api} />;
      case 'lobby':     return <VersusLobby api={api} />;
      case 'countdown': return <VersusCountdown api={api} />;
      case 'question':
      case 'reveal':    return <VersusPlay api={api} />;
      case 'final':     return <VersusFinal key={api.state.matchNo} api={api} />;
    }
  }
}
