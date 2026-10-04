# Little Valley in Godot: migration plan and status

The browser game (TypeScript, Canvas 2D, React) stays playable and untouched in `src/` while
a Godot version is built in `godot/`. This document is the plan of record: decisions, the
architecture, the system-by-system migration matrix with status, and the phases.
Measurements are in [BASELINE.md](BASELINE.md).

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Engine | **Godot 4.7.2-stable** (pinned in `godot/VERSION`) | Current stable on godotengine.org (18 Aug 2026). |
| Language | **Typed GDScript only** (`untyped_declaration` is an error) | The game ships as a web install. Godot 4.7's docs: "Projects written in C# using Godot 4 currently cannot be exported to the web." |
| Renderer | **Compatibility** (WebGL 2) | The only renderer Godot 4 supports on the web. |
| Distribution | **Web install (PWA) on desktop and mobile**, no app stores; optionally an Android APK from the website | Owner's choice (no store budget). Godot's web export has a PWA option. iPhones use the web install. |
| Address | The Godot version is built and tested at a separate preview address. When it reaches parity, it **replaces the current game at the same address** | Browsers keep each site's saves in a box only that address can open, so the same address can read and convert old saves automatically. |
| Saves | On the device; **a rolling history of save points per world** (last 10 kept automatically, any can be named and kept), plus **Download save file / Load from file** | Owner's choice. `user://` on the web is IndexedDB. |
| Old saves | Read the old game's IndexedDB on the same address and convert (v15 JSON). Save files from the old game load too | Terrain generation is bit-for-bit identical (see below), so old worlds need no stored terrain. |
| Population | **No design cap.** The 300 cap is removed once benchmarks show what each platform sustains. The supported scale is published per platform from measurements | Owner wants a long, big, scalable game. |
| Art | Provisional illustrated art authored as SVG, replaced over time. Shipped art must have a clear licence (CC0 or CC-BY with credit, listed in the game's credits) | Internet art needs licence tracking. Mixed sources need a palette pass to look like one game. |
| Asset Studio | **An in-game editor for players**: upload images, assign them to game items, set anchor and frames, preview, recolour to the palette, export and import packs. Stored **on that device only** | Owner's choice. Comes after the playable slice, when the asset spec is fixed. |
| Paid AI | None in gameplay | Settler AI stays deterministic rules. |

## What was verified (Phase 0 and the Godot core)

- **The browser game is unchanged:** 336 tests pass. The only additions are new scripts and fixtures.
- **Terrain is bit-for-bit identical in Godot** for generators 1–4 and all five habitats:
  189 fingerprinted chunks plus 18 full chunk dumps. This needed:
  - a 32-bit integer layer (`I32`) for JavaScript's `|0`, `>>>` and `Math.imul`;
  - V8's `Math.hypot` algorithm (Kahan-summed), since `sqrt(x*x+y*y)` rounds differently;
  - a port of fdlibm `sin`: Godot's `sin` differed from V8 in the last bit for 90 of 2,574 generator arguments;
  - exact constants: **GDScript reads long decimal literals inexactly** (measured: a 21-digit
    constant came out one bit off), so exact constants are given by their bits, and a test
    rejects any literal longer than 15 significant digits under `godot/src`.
  JSON parsing was exact for all 110 decimal values in the content tables (tested).
- **Content tables are shared data.** `scripts/export-content.ts` writes every table in
  `src/game/data` (plus terrain and object definitions) to `godot/content/*.json`. They are
  all plain data; 21 small helper functions are ported by hand. `--check` fails if the export
  is stale.

## Architecture (Godot)

```
godot/
  src/core/        I32, JsMath, WorldNoise, Rng, Content: exact numeric ports and the content loader
  src/world/       Tiles, HabitatDef, Chunk, WorldGen (pure generation), World (streaming; next)
  src/sim/         authoritative simulation (no nodes): state, step order, commands, settlers,
                   reservations, spatial index, pathfinding, systems (farming, buildings, ...)
  src/persistence/ save format, migrations, validation, safe writes, history, import
  src/presentation/ rendering and animation that only read simulation state
  src/ui/          Control scenes; send commands, read snapshots
  src/audio/
  content/         JSON exported from the browser game (source of truth until the TS game retires)
  tests/           headless tests (tools/run_tests.gd) and golden data from the browser game
  tools/           test runner, benchmarks
```

Rules, carried over from the browser game:

1. **The simulation owns state.** It is plain GDScript objects and packed arrays, not scene
   nodes. Nothing outside `src/sim` changes it except through commands, which validate and
   return `{ok, message}`.
2. **Presentation and UI only read.** Rendering interpolates between ticks (`px, py` → `x, y`).
   The UI reads a snapshot at a few hertz.
3. **Fixed 10 Hz tick**, capped steps per frame, and time stops while the game is closed.
4. **Stable integer ids** for every entity. References are ids, never object pointers, in saved state.
5. **Never change a shipped generator;** add a new one.

### World storage and streaming (to build; motivated by BASELINE findings 1 and 2)

- Generated terrain is a pure function of (seed, generator, habitat, chunk). Persistent state is
  only **modifications** (changed tiles, objects, amounts) and **exploration** (a 128-byte bitset per chunk).
- Chunks in memory: the working set around the camera, settlements, active workers and scouts,
  plus all modified chunks (about 3 KB each). Unmodified chunks are evicted when far and idle.
- **Queries never generate.** Pathfinding and finders read only loaded chunks. Unloaded or
  unexplored tiles count as unknown, which is not walkable for routing (explicit move orders
  into fog are allowed to path to the edge of the known land and continue as land loads).
- **Generation runs off the main thread** (WorkerThreadPool) with a per-frame budget. Results are
  applied on the main thread. The web build therefore uses Godot's threads option
  (cross-origin isolation headers on Vercel, or the PWA option that simulates them). The
  single-threaded fallback generates within a time budget per frame.
- **A derived chunk cache on the device** (compressed terrain per explored chunk, keyed by seed,
  generator and habitat). It is not part of the save and is safe to delete. Loading a world
  regenerates nothing up front; the cache or the generator fills chunks on demand.

### Settler AI

The browser game's settler brain is a deterministic **priority cascade**:

1. needs: deliver carried goods, eat, sleep;
2. then direct orders and their "focus";
3. then work area;
4. then the settler's own ordered work kinds (build, haul, farm, gather, craft);
5. otherwise idle, with a stated reason.

It has explicit reservations, staggered decisions and idle back-off. The port **keeps this
structure**, because players set work orders explicitly and must be able to predict them;
utility scoring would hide why a settler chose a job. The changes are in how candidates are
found:
- per-chunk **spatial indexes** for harvest marks, resources, buildings and storage;
- typed reservation keys instead of strings;
- a **decision budget** per tick, so a morning rush is spread across ticks.

### Pathfinding

The browser game uses bounded A* with:
- 8-way moves, no corner cutting and road costs;
- goals that are rectangles, or tiles adjacent to them;
- partial paths for move orders;
- a per-tick node budget and shared unreachable notes.

**Measured and decided** (BASELINE.md, "Pathfinding"):
- The faithful GDScript port matches every golden search step for step, but is 29x slower than the
  browser at 57.7 µs per node.
- A flat-array version is still 5.5x slower.
- Godot's native `AStarGrid2D` is 53x faster than that, with equal path costs.

So local paths use `NavWindow`, which wraps AStarGrid2D in a bounded window around each
settlement and adds rectangle and adjacent goals and partial paths. Because of memory (about 90
bytes per tile) and the cost of unreachable or very long searches, windows stay small. Long
routes get a coarse chunk-level graph, and searches are budgeted by time with unreachable
notes kept.

### Distant activity

Today every player settlement is simulated in full each tick, and rival kingdoms are already
abstract. There is no aggregation until benchmarks show per-settlement cost dominates. Before
any is built, it gets a written spec covering exact production by elapsed time, the same
reservations, and a deterministic return to full simulation.

## Migration matrix

Status: **Done** (ported and tested against the browser game), **Started**, **Planned**.

| System | Browser (TS) | Godot | Verification | Status |
| --- | --- | --- | --- | --- |
| Constants, RNG, hashes, noise | `core/*` | `src/core/i32.gd`, `rng.gd`, `world_noise.gd` | Golden sequences, bit-exact | **Done** |
| JS math parity (hypot, sin, round) | V8 built-ins | `src/core/js_math.gd` | 2,574 golden args each, bit-exact | **Done** |
| Content tables | `game/data/*` | `content/*.json` via `scripts/export-content.ts` | Export `--check`; float bits | **Done** |
| Terrain/object ids | `world/tiles.ts` | `src/world/tiles.gd` | Compared with content | **Done** |
| Worldgen gens 1–4, habitats | `world/worldgen.ts` | `src/world/world_gen.gd` | 189 fingerprints, 18 dumps, bit-exact | **Done** |
| World, chunks, streaming | `world/World.ts`, `Chunk.ts` | `src/world/world.gd`, `chunk.gd`: queries never generate, threaded generation, eviction keeps exploration | 7 streaming tests; soak with the simulation (Phase 2) | **Done** (soak pending) |
| Geology, regions | `world/geology.ts`, `regions.ts` | `src/world/` | Deposit/region goldens | Planned |
| Pathfinding (local) | `sim/pathfinding.ts` | `src/sim/path/nav_window.gd` (AStarGrid2D); `grid_astar.gd`, `dense_astar.gd` as exact references | 80-search golden corpus, validity and optimality, replanning; benchmark | **Done** |
| Pathfinding (long routes) | same A* | Coarse chunk graph over NavWindows | Benchmark long routes | Planned |
| Simulation state and step order | `sim/Simulation.ts` | `src/sim/simulation.gd` | 15 tests ported from simulation.test.ts | **Done (slice)** |
| Commands | `sim/commands.ts` | `src/sim/commands.gd`: move, gather, place, placeArea, remove, designate, setJob, setPriorities, setCrop, stop, hold, returnGoods | Slice tests | **Started** (12 of about 60) |
| Settler brain, tasks, priorities | `sim/settlers.ts`, `priorities.ts` | `src/sim/settler_brain.gd`, `settler_tasks.gd`: needs, gather, deliver, haul, build, farm, eat, sleep, move, focus, stop/hold | Slice tests, interruption test | **Started** (no work areas, crafting, hunting, herding or roles yet) |
| Reservations | `Simulation.reservations` | int keys in `simulation.gd` | `reservation_problems()` in tests | **Done** |
| Spatial index | none | `src/sim/tile_set_index.gd`: harvest marks and harvestable objects | Slice tests; benchmark (48 to 4 ms per tick at 100) | **Done** (buildings and storage not indexed; not needed so far) |
| Buildings, construction, levels | `sim/buildings.ts`, `levels.ts` | `src/sim/building_ops.gd`: place, complete, remove, homes, regrowth, paths, bridges | Construction and refund tests | **Started** (no upgrades, spans, workshops, pens or mines) |
| Farming, weather, seasons | `sim/farming.ts`, `seasons.ts` | `src/sim/farming.gd`, `seasons.gd` | Farming-cycle, dry-field, crop-unlock tests | **Done** (wells come with the well) |
| Orchards | `sim/orchards.ts` | `src/sim/orchards.gd`, orchard art in seven looks | Establish and bear, winter rest, dried-apple conservation | **Done** |
| Production, workshops | `sim/buildings.ts` | `src/sim/production.gd`: recipes, fuel, two-batch buffering, worker assignment, status explanations; work, assignWorker, setRecipe, toggleWorkshop commands | Planks, idle explanation, wheat → flour → bread conservation, worker limits | **Done** (quarries and mines come with mining) |
| Hauling, stock targets | `sim/settlers.ts` | `src/sim/settlers/` | Conservation, no shuttling | Planned |
| Population, households, recruitment | `population.ts`, `households.ts`, `travelers.ts` | `src/sim/people.gd`: visitors and welcomed travellers with escrow, households, bed claims, births, children, legacy arrivals; People window | 15 ported tests (claims, births across saves, refunds, refusals) | **Done** (no 300 cap: a 5,000 safety ceiling, owner's decision) |
| Progression, milestones | `progression.ts` | `src/sim/progression.gd` | Through slice and production tests | **Done** (requirements for unported systems read 0) |
| Work areas | `areas.ts` | `src/sim/` | areas-auto port | Planned |
| Ruler, chief, roles, training | `ruler.ts`, `roles.ts` | `src/sim/people/` | roles/townhall ports | Planned |
| Animals, hunting, herding | `animals.ts` | `src/sim/` | animals, hunting ports | Planned |
| Mining, quarries | `mining.ts` | `src/sim/` | mining port | Planned |
| Settlements | `settlements.ts` | `src/sim/` | regional-journey port | Planned |
| Caravans, merchants, trade | `logistics.ts`, `travelers.ts` | `src/sim/trade/` | logistics/travelers ports | Planned |
| Kingdoms, territory | `kingdoms.ts`, `territory.ts` | `src/sim/realm/` | Ported tests | Planned |
| News, concern, diplomacy, campaigns | `news.ts`, `concern.ts`, `diplomacy.ts`, `campaigns.ts` | `src/sim/realm/` | Ported tests | Planned |
| Military, war | `military.ts`, `combat.ts` | `src/sim/war/` | Ported tests | Planned |
| Saves: format, migrations, history, files | `save/*` | `src/persistence/save_codec.gd`, `save_store.gd`: v15 layout, validation, 10 automatic plus named points, safe writes | Round trip, damaged saves, store history and fallback | **Started** (migrations v2–v14 and save files on the web to do) |
| Old-save import | n/a | `SaveCodec.decode` with an unsupported-data report | Genuine v15 browser fixture | **Started** (reading the old IndexedDB on the web to do) |
| Rendering | `render/*` | `src/presentation/`: ground shader, WorldView, SettlerView, overlay | Capture screenshots, frame benchmarks (BASELINE) | **Done for the slice** |
| Art | code-drawn pixel sprites | `scripts/art/*` → 144 provisional SVG sprites; `docs/godot/ART_STYLE.md` | Contact sheets (`tools/art_sheet.gd`), screenshots | **Started** (provisional; animals, orchards, pens, military still to draw) |
| Animation, effects | `particles.ts`, renderer | `src/presentation/fx/` | Frame benchmarks, reduced motion | Planned |
| Input and bindings, touch | `input/*` | `src/ui/game.gd`, `camera_rig.gd`: mouse, keys, edge pan, touch tap, pan, pinch and box | Manual | **Started** (remapping UI to do) |
| HUD, windows, tutorial, Valley today | React `ui/*`, `engine/*` | `src/ui/hud.gd`: title, top bar, selection, command card, toasts, menu with save points and settings | Screenshots | **Started** (People/Areas/Families windows, tutorial, Valley today to do) |
| Settings | `engine/settings.ts` | `src/ui/settings.gd` (ConfigFile): reduced motion, effects, interface size, edge scroll, autosave | Manual | **Done** |
| Audio | WebAudio synth | AudioStreamGenerator or rendered samples | Listening | Planned |
| Asset Studio (new) | none | `src/ui/asset_studio/` | Pack round trip, size limits | Planned |
| Install, update (PWA) | `ui/updates.ts`, `InstallGate` | Godot PWA export + service worker | Install and offline test | Planned |

## Phases

| Phase | Content | Done when | Status |
| --- | --- | --- | --- |
| 0. Baseline | Tests, profiles, soak, gen-4 fingerprint, golden data, content export | Baseline report; browser tests green | **Done** |
| 1. Godot core | Numeric ports, worldgen, streaming world, pathfinding | Bit-exact goldens; streaming tests; pathfinding benchmarked and chosen | **Done** (the settler-loop cost moves to Phase 2, where it is measured on the real ported loop rather than a synthetic one) |
| 2. Slice simulation | Settlers (needs, gather, deliver, haul, build, farm), Town Hall, storehouse, house, field, commands, saves | Ported conservation, reservation, farming and construction tests pass headless; 20-day soak bounded | **Done** except the 20-day Godot soak (with the Phase 4 benchmarks) |
| 3. Slice presentation | Illustrated ground, objects, settlers with walk, idle, carry and work animation, camera, selection, minimal HUD, reduced motion | 60 FPS at 100 settlers on the reference machine; your review of crowded scenes | **Done** (117 FPS average at 100; awaiting your review) |
| 4. Slice evaluation | Benchmarks at 25/100/300/1,000, soak, a web build on a phone | Report and your sign-off | Planned |
| 5+. Systems | Production → people → seasons and areas → animals → mining → settlements and trade → realm → military → full UI → audio → old-save import → Asset Studio → install and update | Each with ported tests and a matrix update | Planned |
| Cut-over | The Godot version replaces the browser game at the same address and converts old saves | Parity checklist; old saves convert with a report | Planned |

## Art direction (summary)

The target look is painted, limited-palette 2D in the same top-down ¾ view. Shapes are flat
with a soft shadow band, light comes from the upper left with a mint rim light, and shadows
are deep teal instead of black.

- **Core palette:**

  | Role | Hex |
  | --- | --- |
  | Deep teal | `#173b3d` |
  | Forest | `#2f6a4f` |
  | Sage | `#8aab7a` |
  | Mint | `#cdeedb` |
  | Gold (accents only) | `#e6b65a` |

- **Supporting hues:** water, soil, stone, wood, terracotta and slate roofs, and crops.
- **Outlines:** coloured, about 2 px at the default zoom, never black. Crops and ground
  decals are not outlined.
- **Scale:** logical tiles stay 1 unit. Art is authored at 96 px per tile and shown at about
  48–64 px with mipmaps and linear filtering. Art resolution is a presentation setting only.
- **Selection and placement:**
  - Selection is a gold ring.
  - Hover is a mint ring.
  - Placement ghosts are mint, or red with hatching when blocked, so colour is never the only cue.
- **Pipeline:**
  - Sources are SVG files in `godot/art_src`, rasterised by Godot's importer.
  - Characters are SVG part sets baked into frames: walk, idle, carry and work, three directions.
  - Every first-pass asset is marked provisional in the asset manifest, with its licence and source.
