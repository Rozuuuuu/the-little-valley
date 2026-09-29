/**
 * Every keyboard action goes through this table, so controls can be remapped
 * from the settings screen. Keys are KeyboardEvent.code values (layout
 * independent).
 */
export type Action =
  | 'panUp' | 'panDown' | 'panLeft' | 'panRight'
  | 'zoomIn' | 'zoomOut'
  | 'pause' | 'speed1' | 'speed2' | 'speed3'
  | 'build' | 'harvest' | 'unmark' | 'demolish' | 'cancel'
  | 'nextIdle' | 'selectAll' | 'save' | 'help'
  | 'survey' | 'homeView' | 'findRuler' | 'rally' | 'trainRole' | 'advice' | 'toggleGrid' | 'healthBars' | 'goods' | 'today' | 'seeMore'
  | 'winPeople' | 'winAreas' | 'winTowns' | 'winFamilies' | 'winRealm' | 'winGoals'
  | 'move' | 'stop' | 'hold' | 'attack' | 'returnGoods' | 'fullscreen';

/**
 * Version of the default layout. Settings saved with an older version get the new defaults:
 * v2 is the Warcraft III layout (arrows pan; A attack, S stop, H hold, M move, G gather...).
 */
export const BINDINGS_VERSION = 2;

export interface ActionDef {
  label: string;
  group: 'Camera' | 'Time' | 'Orders' | 'Tools' | 'Windows' | 'Other';
  keys: string[];
}

export const DEFAULT_BINDINGS: Record<Action, ActionDef> = {
  // Warcraft III: the arrow keys (and the screen edge) move the camera; letters are commands.
  panUp: { label: 'Pan up', group: 'Camera', keys: ['ArrowUp'] },
  panDown: { label: 'Pan down', group: 'Camera', keys: ['ArrowDown'] },
  panLeft: { label: 'Pan left', group: 'Camera', keys: ['ArrowLeft'] },
  panRight: { label: 'Pan right', group: 'Camera', keys: ['ArrowRight'] },
  move: { label: 'Move (then click a spot)', group: 'Orders', keys: ['KeyM'] },
  stop: { label: 'Stop', group: 'Orders', keys: ['KeyS'] },
  hold: { label: 'Hold position', group: 'Orders', keys: ['KeyH'] },
  attack: { label: 'Attack — hunt (then click an animal)', group: 'Orders', keys: ['KeyA'] },
  returnGoods: { label: 'Return goods to storage', group: 'Orders', keys: ['KeyC'] },
  zoomIn: { label: 'Zoom in', group: 'Camera', keys: ['Equal', 'NumpadAdd'] },
  zoomOut: { label: 'Zoom out', group: 'Camera', keys: ['Minus', 'NumpadSubtract'] },
  pause: { label: 'Pause / resume', group: 'Time', keys: ['Space'] },
  speed1: { label: 'Normal speed', group: 'Time', keys: ['Digit1'] },
  speed2: { label: 'Fast speed', group: 'Time', keys: ['Digit2'] },
  speed3: { label: 'Fastest speed', group: 'Time', keys: ['Digit3'] },
  build: { label: 'Build menu', group: 'Tools', keys: ['KeyB'] },
  harvest: { label: 'Gather: mark for harvest (people selected: click what to gather)', group: 'Orders', keys: ['KeyG'] },
  unmark: { label: 'Unmark harvest', group: 'Tools', keys: ['KeyU'] },
  demolish: { label: 'Demolish selected', group: 'Tools', keys: ['Delete', 'KeyX'] },
  cancel: { label: 'Cancel / close', group: 'Tools', keys: ['Escape'] },
  nextIdle: { label: 'Next idle settler', group: 'Other', keys: ['Period'] },
  selectAll: { label: 'Select all settlers', group: 'Other', keys: ['KeyE'] },
  save: { label: 'Quick save', group: 'Other', keys: ['F5'] },
  help: { label: 'Controls help', group: 'Other', keys: ['F1'] },
  survey: { label: 'Survey for ore', group: 'Tools', keys: ['KeyY'] },
  homeView: { label: 'Jump to the Town Hall', group: 'Camera', keys: ['Backspace', 'Home'] },
  findRuler: { label: 'Find yourself (the ruler)', group: 'Camera', keys: ['KeyK'] },
  rally: { label: 'Rally the people (ruler selected)', group: 'Tools', keys: ['KeyR'] },
  trainRole: { label: 'Train a role at the Town Hall (people selected)', group: 'Orders', keys: ['KeyT'] },
  advice: { label: "Hear the Assistant Chief's advice (or find them)", group: 'Other', keys: ['KeyO'] },
  toggleGrid: { label: 'Show or hide the tile grid', group: 'Other', keys: ['Backquote'] },
  fullscreen: { label: 'Full screen on / off', group: 'Other', keys: ['KeyF'] },
  healthBars: { label: 'Health bars: everyone / only the hurt', group: 'Other', keys: ['KeyL'] },
  goods: { label: 'All goods', group: 'Windows', keys: ['KeyI'] },
  today: { label: 'Valley today (like the Quests log)', group: 'Windows', keys: ['F9'] },
  seeMore: { label: 'See more about the selection', group: 'Windows', keys: ['KeyV'] },
  winPeople: { label: 'People window', group: 'Windows', keys: ['F2'] },
  winAreas: { label: 'Work areas window', group: 'Windows', keys: ['F3'] },
  winTowns: { label: 'Towns window', group: 'Windows', keys: ['F4'] },
  winFamilies: { label: 'Families window', group: 'Windows', keys: ['F6'] },
  winRealm: { label: 'Realm window', group: 'Windows', keys: ['F7'] },
  winGoals: { label: 'Goals window', group: 'Windows', keys: ['F8'] },
};

export type Bindings = Record<Action, string[]>;

export function defaultBindings(): Bindings {
  const out = {} as Bindings;
  for (const [k, v] of Object.entries(DEFAULT_BINDINGS)) out[k as Action] = [...v.keys];
  return out;
}

export function actionFor(bindings: Bindings, code: string): Action | null {
  for (const [a, keys] of Object.entries(bindings)) if (keys.includes(code)) return a as Action;
  return null;
}

/** Friendly name for a key code, e.g. "KeyW" → "W". */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Escape: 'Esc',
    Equal: '=', Minus: '-', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', Period: '.', Delete: 'Del', Backspace: 'Bksp', Home: 'Home', Backquote: '`',
  };
  return names[code] ?? code;
}
