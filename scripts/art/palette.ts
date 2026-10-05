/** The retired storybook palette (scripts/art/storybook-palette.json) and the colour helpers every generator module shares. */
import { readFileSync } from 'node:fs';
import { mix, type Palette } from './svg-kit';

export const P = JSON.parse(readFileSync('scripts/art/storybook-palette.json', 'utf8')) as Palette;
export const M = P.materials;
export const OUTLINE = P.people.outline;
export const RIM = P.core.mint;
export const SHADOW = P.core.teal;

/** An outline colour for a material: its darkest tone pulled toward the outline teal. */
export const outlineOf = (tones: string[]) => mix(tones[0], OUTLINE, 0.55);
