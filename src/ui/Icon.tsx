import type { ResourceId } from '../game/data/resources';
import type { UiIconId } from '../render/sprites/icons';
import { useGame } from './context';

export function ResIcon({ res, size = 24 }: { res: ResourceId; size?: number }) {
  const { sprites } = useGame();
  return <img className="px" src={sprites.url(sprites.resources[res])} width={size} height={size} alt="" />;
}

export function UiIcon({ id, size = 24 }: { id: UiIconId; size?: number }) {
  const { sprites } = useGame();
  return <img className="px" src={sprites.url(sprites.ui[id])} width={size} height={size} alt="" />;
}
