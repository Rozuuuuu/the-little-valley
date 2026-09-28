# Architecture

```
src/
  game/                 ← pure TypeScript, no DOM. Runs headless in tests.
    core/               constants (tile, chunk, tick, day), RNG, noise, tile keys
    data/               typed content tables: resources, crops, buildings, recipes, jobs, milestones, names
    world/              tiles & objects, Chunk, World (lazy chunk map), seeded worldgen
    sim/                Simulation (authoritative state + step), settlers (jobs, tasks, movement),
                        pathfinding, farming, buildings, population, progression, commands, newGame,
                        seasons, settlements, households (families, bed claims), orchards, travelers
    save/               format (types), serialize, migrations + validation, storage (IndexedDB/memory), SaveManager
  render/               Canvas 2D renderer, camera, particles, terrain painter (+ web worker), sprite generators
  audio/                WebAudio synthesiser for effects, ambience and generative music
  input/                key bindings (remappable) and the pointer/keyboard → intent layer
  engine/               GameController (loop, autosave, commands, UI snapshot), growthInfo (Families panel data),
                        overview (Valley today), settings, tutorial, UI store
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
  the seed and the world's **generator version** (`worldgen.ts`). Generator 1 uses
  value-noise elevation, moisture, river contours with fords, and a hand-shaped
  spawn clearing. Generator 2 adds the **great river**: a meandering channel east of
  the spawn with a deep middle and no fords. The only way across is a stone bridge.
  Beyond it lie the fertile, stony riverlands.
- Each chunk stores flat `Uint8Array`s: terrain, object, object amount, explored.
  `modified` marks chunks that differ from the generator and must be saved in full.
- `version`, `terrainVersion` and `fogVersion` tell the renderer and minimap what to repaint.
- Fog of war: settlers and finished buildings reveal discs of tiles. Settlers standing
  near open water see much farther (12 tiles), so a scout on a riverbank can survey
  the far side before a bridge is planned. Building needs explored ground.

- **Generator 3** adds hills (walkable, 1.45× move cost, buildable) and mountain faces
  (impassable), keeping the spawn open and the ridge crossable through regular passes.
- **Geology** (`world/geology.ts`) sits beside the terrain: each 16×16 cell may hold one
  deposit at a qualifying site (rocky ground, a generated rock or boulder, or a hill tile
  at the foot of a mountain face). It reads the generator directly, so asking about ore
  never creates chunks. Copper and iron are guaranteed near every camp.
- **Mining** (`sim/mining.ts`): `surveyDeposit` sends an adult to reveal a cell (saved;
  never re-rolled). Quarries and mines are *extraction* buildings worked through the
  Craft work kind with an `extract` task; each trip reserves its ore
  (`sim.oreReserved`) so two miners can't take the last unit. Shaft upgrades pay from
  storage all at once. Recipes may take `fuel` (coal first, then charcoal), which the
  haul planner requests as whichever fuel is in stock.

- **Regions** (`world/regions.ts`): a coarse, seeded graph of 96×96-tile regions, some
  holding distant towns. Pure functions of the seed; nothing is generated until heard of
  (`sim.knownRegions`).
- **Logistics** (`sim/logistics.ts`): a route keeps a store in another settlement at a
  target. A caravan depot's teamster takes up to 20 goods per cart; the goods and a
  day's provisions leave the source at once into a manifest, the teamster is away
  (`awayOn`, not simulated), and the cart travels an abstract leg whose time comes from
  a path over *explored, loaded* tiles only (roads and bridges; no chunk is ever
  generated, so no crossing an unbridged river). In-flight cargo counts against the
  destination's space. A store never gives below its own target or the target of a route
  into it, which keeps opposing routes from shuttling. Leftovers go home, then to any
  store, then into a `crate` (a temporary store) — never lost, never counted twice.
- **Merchants** (`sim/travelers.ts`): with an inn, a merchant sets off from a nearby town
  every two days and passes through stages owned one at a time: *travelling*
  (abstract), *arriving* (walking on the map), *lodging* (barter), *leaving*.
  `barter` checks everything first (stock, your local stores, their prices, room)
  and then moves all goods at once. Prices are in `data/trade.ts`.

> Old worlds keep their generator forever. See "World generator versions" in
> [SAVE_FORMAT.md](SAVE_FORMAT.md). Never change an existing generator: add a new one.

## Settlers, jobs, work areas and routines

`settlers.ts` contains the settler brain. `assignTask` decides in this order:

1. **Needs.** Deliver goods in hand (if storage has room). Eat if hungry and food is
   stored. Go to bed at bedtime, or nap when exhausted. Bed and wake times are
   staggered by a few minutes per settler.
2. **Direct orders.** Right-click orders set a task immediately, and a gather order
   leaves a temporary *focus*: keep working the same resource nearby. When those run
   out, the settler returns to their routine.
3. **Work area.** A settler assigned to an area (`sim.workAreas`: farm, woodlot, quarry
   or building area) does that area's work first. Woodlots and quarries harvest
   everything inside, with no marks needed. Areas only count explored tiles and skip
   unreachable targets.
4. **Work order.** `priorities.ts`: the settler's own ordered list of work kinds
   (build, haul, farm, gather, craft), or their job's default. Players reorder it or
   switch kinds off in the inspector. Choosing a job resets it to that job's default.
5. **Idle.** The most relevant reason is recorded and shown ("Fields in Home farm are
   growing", "Storage is full — build a storehouse", "Can't reach the rocks in
   Quarry 1", "Every kind of work is switched off"). The settler then waits about 1.5
   seconds before searching again, unless something changes: new orders, placements
   and finished buildings wake everyone at once.

Limits that always hold (see `tests/village.test.ts`):

- **One task per settler, one worker per exclusive job.** Work is reserved
  (`sim.reservations`: `field:12`, `obj:<tile>`, `build:7:0`, `craft:9`). Goods in
  transit are reserved by quantity (`reservedOut` on the source, `incoming` on the
  destination). Tasks release everything when they end. Changing areas, jobs or work
  orders calls `replan`, which aborts area and job work cleanly while keeping direct
  orders and needs. `assertReservationsConsistent` checks that every reservation
  belongs to a task that holds it.
- **Carry capacity** is 10. Nobody accepts a delivery to full storage, a harvest with
  full hands, or a craft with nowhere to put the output.
- **Worker limits.** Production buildings have `maxWorkers` (1 each today). A work
  area takes at most 12 settlers. Extra assignments are refused with the count
  ("The mill already has 1/1 workers").
- **Hunger and energy** below 15 slow work (shown in the inspector). They never kill
  anyone.

### Housing

- `BuildingDef.housing` is a bed count: house 2, family home 3, cottage 4. The camp
  has 5 *temporary* bedrolls (`temporaryBeds`).
- **Explicit rule:** newcomers need a free, reachable bed, and camp bedrolls count.
  Everyone else sleeps in a bedroll only until a house bed frees up. Unfinished
  buildings give no beds.
- **Bed claims** (`sim.bedClaims`, saved) hold a bed for someone who doesn't live
  there yet: an expected child (permanent homes only) or an accepted traveller (any
  bed, real homes first). `bedUseCounts` = residents + claims, and `findFreeBed`,
  `assignHomes` and the move-in order all use it, so a claimed bed is never given
  away. Demolishing a home calls `relocateClaims` (another free bed in the same
  settlement, or the claim is released and the owner waits with a stated reason).
  On load, `validateClaims` drops claims on missing, unfinished or over-full homes
  before ordinary homes are assigned.
- `assignHomes` never lets a home exceed its beds. It moves bedroll sleepers into free
  house beds and leaves anyone left over without a bed. They rest by the campfire, and
  the UI says so. Reachability is checked with a cached path from the camp.
- **Growth mode** (`sim.growthMode`). `'deliberate'` (new valleys): people come only
  from households and welcomed travellers (`sim/households.ts`, `sim/travelers.ts`).
  `'legacy'` (worlds saved before v5): `welcomeNewcomer` still draws newcomers
  automatically until the player runs `adoptDeliberateGrowth`.
- **Households:** two adults (`formHousehold`); `requestChild` claims a bed at once;
  `updateHouseholds` (every 50 ticks) advances the pending child only while bed,
  20 local food and parents-in-one-settlement all hold, and records why it is paused
  otherwise. Birth after 2 steady days, adulthood after 12, a 4-day family cooldown.
  Children (`lifeStage: 'child'`) have an empty work order, refuse work commands and
  play near home. Milestone population counts adults.
- **Travellers:** one visitor at a time (`sim.offer`), first at a quarter day, next
  half a day after one leaves or settles. `acceptRecruit` claims a bed and moves 50
  apples from the settlement's own stores into the recruitment's escrow in one step;
  arrival hands them over. `cancelRecruit` returns every apple (kept in escrow while
  stores are full). One traveller settles per two days.
- **Orchards** (`sim/orchards.ts`): establish over 2 growing-season days, then ripen 25
  apples a day while tended (a farmer's `orchard` task: tend or pick); nothing grows in
  winter. The workshop's *Dry apples* recipe turns spare apples into food.
- In legacy mode `welcomeNewcomer` assigns the bed before anything else, so two
  arrivals can't take the same bed. Growth also needs 20 stored food and a cooldown.
  `sim.populationStatus` always says exactly what is holding growth back, including
  the open simulation limit (`MAX_POPULATION = 300`).
- Removing a home releases its residents, rehouses them where possible, and reports
  any shortage in a toast and the chronicle.
- **Sleep:** residents walk to the door tile and sleep *inside* (`insideId`, lit
  windows). Camp sleepers each get their own spot. If the way home is blocked, the
  settler rests where they are for that night and tries again the next night, so
  there's no endless movement loop.

### Production

Recipes (`data/recipes.ts`) run in any building with `recipes`: workshop (planks,
tools), mill (wheat → flour) and bakery (flour + wood → food). Haulers keep two
batches of inputs on hand. The assigned worker crafts and carries the output to
storage. A building with no assigned workers is open to anyone whose work order
includes Craft. Status lines explain every stop ("Needs 3 wheat — none in storage",
"No worker — select a settler and right-click the mill", "Storage is full — nowhere to
put the output").

### Pathfinding

Bounded A* (`pathfinding.ts`: 8-way, no corner cutting, road discount, an
allocation-free heap). Paths are cached per goal and re-planned when blocked. Guards
keep village-wide rushes cheap:

- a **per-tick node budget** (`PATH_BUDGET = 6000`): a settler whose search doesn't fit
  waits one tick
- **shared unreachable notes**: once a target proves unreachable, everyone skips it for
  a while, backing off exponentially until the map changes (anything built, removed or
  bridged)
- move orders accept a **partial path** and walk as close as they can

## Stone bridge (span buildings)

`BuildingDef.span` makes a building drag-placed in a straight line over water tiles
only, with walkable, explored land just beyond both ends (`checkSpan`). Its size is
stored per building (`w`, `h`). `costOf` and `workOf` scale with length (stone bridge:
6 stone + 2 planks and 100 work per tile). Builders reach it from the banks. On
completion its tiles become `T.StoneBridge` terrain (walkable, road speed). The
building stays as a permanent landmark: it can't be demolished and shows on the
minimap.

## Village progression

Milestones (`data/progression.ts`) support `anyOf` requirements. Village asks for 10
settlers and 8 home beds, plus **any 2 of**:

- bake 30 food
- run 2 staffed work areas
- complete a stone bridge
- lay 25 path tiles

Reaching it records a chronicle entry, shows a short celebration card (the world
pauses behind it), unlocks cottages, benches and the Grand Market, and turns the camp
into a village hall.

## "Valley today"

`engine/overview.ts` builds the resume panel from state only:

- the previous session's chronicle entries and stat changes (never invented; saves
  without a session mark say so)
- up to 3 issues: storage full, settlers without beds, production stopped, sites
  short of stock, idle settlers
- 2–3 goals from the actual world: build a mill or bakery, plant wheat, create a farm
  area, cross the great river (with a suggested crossing), homes for Village, or
  post-Village aims

Every item carries a target. Clicking it closes the panel, moves the camera there,
selects the building or settler, and pulses a highlight. The panel appears about a
second after loading, so idle reasons are real.

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

Performance (Intel i5-4200M laptop from 2013, Chrome 152, 1920×901 canvas at 1× DPR), for a developed village of 101 settlers, ~99 buildings, 4 work areas, and mill, bakery and workshop running:

- **Simulation tick** (`scripts/profile-village.ts`, 2 in-game days, 3 runs): daytime average 0.48–0.72 ms, p95 1.5–2.3 ms, p99 3.3–6.7 ms. Night average 0.12–0.26 ms, p99 1.9–5.0 ms. Rare outliers of 20–43 ms come from garbage collection, first-time chunk generation (now 2–5 ms per chunk) and occasional capped failed searches. At 1× the game runs 10 ticks a second.
- **Render** (browser, same village): median 6.5–8.8 ms per frame at zoom 2–3, day or night. p95 9–29 ms in noisy runs (garbage collection and chunk painting finishing in the worker). The night lighting pass only processes lights in view, and only homes with sleepers glow.

The React tree still updates at 4 Hz from the snapshot, and the minimap redraws at 5 Hz from the game loop.

## Saving

See [SAVE_FORMAT.md](SAVE_FORMAT.md). The controller autosaves every N minutes
(setting) when the world changed, shortly after important events (a building done, a
milestone, a newcomer), when the tab is hidden, and via a synchronous emergency copy
when the page closes.

## UI

React components in `src/ui` read `useSnapshot()` and call controller methods. New panels: Valley today (`ui/Village.tsx`), the minimap with layer toggles and quick-find buttons (idle settlers, buildings waiting, sites, the bridge, home), the Areas tab, the work-order editor, and the celebration card. The minimap canvas is owned by `render/Minimap.ts` and drawn by the controller, never by React.
Menus that should stop the world set `game.menuOpen`. The title screen runs a
separate "attract" simulation behind the menu. It has no autosave, toasts or sounds.


## Seasons and settlements continuation

Families and deliberate growth are described under Housing above. Seasons derive from the saved day: four days per season, sixteen per year. `data/seasons.ts` defines climate, and `sim/seasons.ts` supplies calendar and advisory winter food forecasts. Winter pauses planting and growth without destroying crops. Settlement centres, settler membership and storage targets are authoritative simulation state. Local work is preferred; workers can still help elsewhere. Target hauling uses existing incoming/outgoing reservations. `regionalInfo` publishes calendar, centre supplies, membership and cached road connectivity through the existing UI snapshot cadence. Ground cache entries and worker requests carry season identity; old ground remains visible while replacement chunks are painted.
