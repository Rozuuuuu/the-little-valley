import { createContext, useContext } from 'react';
import type { GameController } from '../engine/GameController';
import { useStore } from '../engine/store';
import type { SpriteBank } from '../render/sprites';

export interface GameContextValue {
  game: GameController;
  sprites: SpriteBank;
}

export const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const v = useContext(GameContext);
  if (!v) throw new Error('Game context missing');
  return v;
}

export function useSnapshot() {
  const { game } = useGame();
  return useStore(game.ui);
}
