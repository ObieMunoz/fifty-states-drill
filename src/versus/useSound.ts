import { useCallback, useSyncExternalStore } from 'react';
import { onSoundChange, setSoundOn, soundOn } from './sound';

/** The sound switch, as a screen sees it: on or off, and a way to flip it. */
export function useSound(): [boolean, () => void] {
  const on = useSyncExternalStore(onSoundChange, soundOn, () => true);
  const toggle = useCallback(() => setSoundOn(!soundOn()), []);
  return [on, toggle];
}
