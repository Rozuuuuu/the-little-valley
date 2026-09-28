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
  | 'survey' | 'homeView' | 'findRuler' | 'rally' | 'toggleGrid' | 'healthBars' | 'goods' | 'today' | 'seeMore'
  | 'winPeople' | 'winAreas' | 'winTowns' | 'winFamilies' | 'winRealm' | 'winGoals';

export interface ActionDef {
  label: string;
  group: 'Camera' | 'Time' | 'Tools' | 'Windows' | 'Other';
  keys: string[];
}

export const DEFAULT_BINDINGS: Record<Action, ActionDef> = {
  panUp: { label: 'Pan up', group: 'Camera', keys: ['KeyW', 'ArrowUp'] },
  panDown: { label: 'Pan down', group: 'Camera', keys: ['KeyS', 'ArrowDown'] },
  panLeft: { label: 'Pan left', group: 'Camera', keys: ['KeyA', 'ArrowLeft'] },
  panRight: { label: 'Pan right', group: 'Camera', keys: ['KeyD', 'ArrowRight'] },
  zoomIn: { label: 'Zoom in', group: 'Camera', keys: ['Equal', 'NumpadAdd'] },
  zoomOut: { label: 'Zoom out', group: 'Camera', keys: ['Minus', 'NumpadSubtract'] },
  pause: { label: 'Pause / resume', group: 'Time', keys: ['Space'] },
  speed1: { label: 'Normal speed', group: 'Time', keys: ['Digit1'] },
  speed2: { label: 'Fast speed', group: 'Time', keys: ['Digit2'] },
  speed3: { label: 'Fastest speed', group: 'Time', keys: ['Digit3'] },
  build: { label: 'Build menu', group: 'Tools', keys: ['KeyB'] },
  harvest: { label: 'Mark for harvest', group: 'Tools', keys: ['KeyH'] },
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
  toggleGrid: { label: 'Show or hide the tile grid', group: 'Other', keys: ['KeyG'] },
  healthBars: { label: 'Health bars: everyone / only the hurt', group: 'Other', keys: ['KeyL'] },
  goods: { label: 'All goods', group: 'Windows', keys: ['KeyI'] },
  today: { label: 'Valley today', group: 'Windows', keys: ['KeyT'] },
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
    Equal: '=', Minus: '-', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', Period: '.', Delete: 'Del', Backspace: 'Bksp', Home: 'Home',
  };
  return names[code] ?? code;
}
