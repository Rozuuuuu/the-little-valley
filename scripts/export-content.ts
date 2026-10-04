// Exports every content table and balance constant from src/game/data (plus terrain and object
// definitions) to godot/content/*.json, so the Godot port runs on exactly the browser game's numbers.
// Run: npx tsx scripts/export-content.ts   (re-run after changing any table; the Godot tests compare
// against these files, and `--check` fails if they are out of date).
//
// Functions cannot be exported as data. Any exported function or function-valued field is listed in
// godot/content/_manifest.json under `logicNotExported`, so each one is ported to GDScript by hand.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as animals from '../src/game/data/animals';
import * as buildings from '../src/game/data/buildings';
import * as crops from '../src/game/data/crops';
import * as habitats from '../src/game/data/habitats';
import * as jobs from '../src/game/data/jobs';
import * as kingdomBalance from '../src/game/data/kingdomBalance';
import * as kingdoms from '../src/game/data/kingdoms';
import * as minerals from '../src/game/data/minerals';
import * as names from '../src/game/data/names';
import * as progression from '../src/game/data/progression';
import * as recipes from '../src/game/data/recipes';
import * as resources from '../src/game/data/resources';
import * as seasons from '../src/game/data/seasons';
import * as trade from '../src/game/data/trade';
import * as treaties from '../src/game/data/treaties';
import * as units from '../src/game/data/units';
import * as war from '../src/game/data/war';
import * as constants from '../src/game/core/constants';
import * as tiles from '../src/game/world/tiles';

const OUT = 'godot/content';
const check = process.argv.includes('--check');
const modules: Record<string, Record<string, unknown>> = {
  animals, buildings, crops, habitats, jobs, kingdomBalance, kingdoms, minerals, names, progression,
  recipes, resources, seasons, trade, treaties, units, war, constants, tiles,
};

const logic: string[] = [];
/** Every non-integer number with its exact IEEE-754 bits, so the Godot tests can prove JSON parsing lost nothing. */
const floats: [string, string][] = [];
function bits(x: number): string {
  const v = new DataView(new ArrayBuffer(8));
  v.setFloat64(0, x);
  let s = '';
  for (let i = 0; i < 8; i++) s += v.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function toData(value: unknown, path: string): unknown {
  if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) floats.push([path, bits(value)]);
  if (typeof value === 'function') {
    logic.push(path);
    return undefined;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${path} is ${value}, which JSON cannot hold`);
  if (Array.isArray(value)) return value.map((v, i) => toData(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const d = toData(v, `${path}.${k}`);
      if (d !== undefined) out[k] = d;
    }
    return out;
  }
  return value;
}

mkdirSync(OUT, { recursive: true });
let stale = 0;
for (const [name, mod] of Object.entries(modules)) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(mod)) {
    const d = toData(v, `${name}.${k}`);
    if (d !== undefined) data[k] = d;
  }
  const text = JSON.stringify(data, null, 1) + '\n';
  const file = `${OUT}/${name}.json`;
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
      console.error(`${file} is out of date`);
      stale++;
    }
  } else writeFileSync(file, text);
}
const manifest = JSON.stringify({ source: 'scripts/export-content.ts', logicNotExported: logic, floats }, null, 1) + '\n';
if (check) {
  if (!existsSync(`${OUT}/_manifest.json`) || readFileSync(`${OUT}/_manifest.json`, 'utf8') !== manifest) stale++;
  if (stale) process.exit(1);
  console.log('content is up to date');
} else {
  writeFileSync(`${OUT}/_manifest.json`, manifest);
  console.log(`${Object.keys(modules).length} content files written; ${logic.length} functions to port by hand`);
}
