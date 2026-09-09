import { createContext, useContext } from 'react';
import type { Dispatch } from 'react';
import type { Action, GameState } from './state';

export interface GameApi {
  state: GameState;
  dispatch: Dispatch<Action>;
}

export const GameContext = createContext<GameApi | null>(null);

/** State and dispatch for the whole app. Throws outside the provider. */
export function useGame(): GameApi {
  const api = useContext(GameContext);
  if (!api) throw new Error('useGame must be used inside <GameContext.Provider>');
  return api;
}
