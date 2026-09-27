# Architecture

```
src/
  game/                 ← pure TypeScript, no DOM. Runs headless in tests.
    core/               constants (tile, chunk, tick, day), RNG, noise, tile keys
    data/               typed content tables: resources, crops, buildings, recipes, jobs, milestones, names
    world/              tiles & objects, Chunk, World (lazy chunk map), seeded worldgen
    sim/                Simulation (authoritative state + step), settlers (jobs, tasks, movement),
                        pathfinding, farming, buildings, population, progression, commands, newGame
    save/               format (types), serialize, migrations + validation, storage (IndexedDB/memory), SaveManager
  render/               Canvas 2D renderer, camera, particles, terrain painter (+ web worker), sprite generators
  audio/                WebAudio synthesiser for effects, ambience and generative music
  input/                key bindings (remappable) and the pointer/keyboard → intent layer
  engine/               GameController (loop, autosave, commands, UI snapshot), settings, tutorial, UI store
  ui/                   React HUD, menus and panels
tests/                  Vitest: world, pathfinding, simulation rules, resource accounting, saves, journey
```

## Rules of the road

- **The simulation owns state.** `Simulation` (in `game/sim`) holds settlers, buildings,
  the world and progression. Nothing outside `game/` mutates it except through
  `applyCommand` (`game/sim/commands.ts`), which validates every command and returns
  `{ ok, message }` so the UI can explain refusals.
- **Rendering and React only read.** The renderer reads the simulation every frame.
  React never touches it directly: `GameController.publish()` builds a plain
  `UiSnapshot` about four times a second and pushes it through a tiny external store
  (`engine/store.ts`, `useSyncExternalStore`). React does not re-render per tick.
- **Events flow outward.** The simulation pushes `SimEvent`s (toasts, sounds, particle
  bursts, "important" for autosave). The controller drains them each frame and
  forwards them to audio, particles and the toast list.

## Time

`GameController.tickFrame` accumulates real time × speed and runs `sim.step()` at a
fixed 10 Hz (`TICK_MS = 100`), capped per frame so a slow frame can't spiral.
Settlers store their previous position (`px, py`), and the renderer interpolates with
`alpha = accumulator / TICK_MS`, so motion stays smooth at any frame rate.
Growth, hunger, the day cycle and weather all run on simulation ticks, so nothing
advances while the tab is hidden or the game is closed.

A day is 2880 ticks (4.8 minutes at 1×). Night runs from 0.87 to 0.21 of the day.

## World

- Infinite grid of 32×32 chunks (`World`), generated lazily and deterministically from
  the seed (`worldgen.ts`: value-noise elevation, moisture and river contours, plus a
  hand-shaped spawn clearing). Fords break every river loop so the start is never sealed in.
- Each chunk stores flat `Uint8Array`s: terrain, object, object amount, explored.
  `modified` marks chunks that differ from the generator and must be saved in full.
- `version`, `terrainVersion` and `fogVersion` tell the renderer what to repaint.
- Fog of war: settlers and completed buildings reveal discs of tiles. Building needs
  explored ground.

> Changing `worldgen.ts` changes every unmodified chunk of existing worlds. If the
> generator ever changes after release, add a generator version to the save and keep
> the old generator for old worlds.

## Settlers, jobs and tasks

`settlers.ts` contains the whole settler brain:

1. **Needs first.** A settler holding goods delivers them. A hungry settler walks to
   food in storage. At night they go home (a house bed, or a spot around the camp).
2. **Standing orders.** A manual gather order sets a *focus*: after each trip the
   settler picks the nearest resource of the same kind within 7 tiles.
3. **Job priorities** (`data/jobs.ts`): each job lists work kinds (build, haul, farm,
   gather, craft) in order. Specialists fall back to general work.
4. If nothing fits, the settler records the most relevant **idle reason** (shown
   in the UI) and may wander a little.

Work is **reserved** (`sim.reservations`, e.g. `field:12`, `obj:<tile>`, `build:7:0`)
so two settlers never do the same job. Goods in transit are reserved by quantity
(`reservedOut` on the source, `incoming` on the destination). Every task releases its
reservations when it ends or is aborted. Tasks and reservations are **not saved**:
after a load, settlers simply choose work again. Carried goods are saved, so nothing
is lost or duplicated. The invariant tests check this.

Movement uses bounded A* (`pathfinding.ts`: 8-way, no corner cutting, road discount,
node budget). Paths are cached per goal and re-planned when the next tile becomes
blocked. After repeated failures the task aborts with a reason and the target is
skipped for that settler for a while. Plain move orders accept a *partial* path and
walk as close as they can.

## Rendering

`render/Renderer.ts` draws with Canvas 2D in device pixels:

- Scale is device pixels per art pixel, resting on whole numbers (2–8) so pixels
  stay crisp. It eases between levels while zooming. The camera position is a float,
  so panning and settler motion are smooth.
- **Ground** is painted per chunk into a cached 512×512 canvas by `terrainPainter.ts`,
  running in a Web Worker (`terrainWorker.ts`). Terrain borders are resolved per
  pixel with dithered noise, water gets foam and bank shadows, and tufts, flowers
  and pebbles are sprinkled per tile.
- **Objects, buildings and settlers** are collected for the visible area and
  depth-sorted by their base y, so settlers pass behind trees and houses correctly.
- **Overlays**: harvest marks, construction progress, workshop warnings, dry-field
  drops, selection rings, command markers.
- **Fog** is a 34×34 alpha texture per chunk, upscaled with smoothing for soft edges.
- **Lighting**: at dusk and night a quarter-resolution tint layer is punched with
  radial gradients around lights, then a warm additive glow is added. Also rain,
  fireflies, pollen, chimney smoke and campfire sparks.

Measured on this machine (1920×901, Chrome): about 3.5–5 ms per frame at 1× DPR with
7 settlers, and about 7.6 ms with 60 settlers. A simulation tick costs about
0.17 ms with 7 settlers and 1.5 ms with 60.

## Saving

See [SAVE_FORMAT.md](SAVE_FORMAT.md). The controller autosaves every N minutes
(setting) when the world changed, shortly after important events (a building done, a
milestone, a newcomer), when the tab is hidden, and via a synchronous emergency copy
when the page closes.

## UI

React components in `src/ui` read `useSnapshot()` and call controller methods.
Menus that should stop the world set `game.menuOpen`. The title screen runs a
separate "attract" simulation behind the menu. It has no autosave, toasts or sounds.
