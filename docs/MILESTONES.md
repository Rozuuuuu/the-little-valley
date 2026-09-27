# Milestone reports

## Milestone 2: A Village Worth Returning To

### Review before building (what the code actually did)

- **Extendable:** typed content tables, a generic recipe and hauling system, the
  settler brain (needs → focus → job priorities, with reservations), the 4 Hz UI
  snapshot, and v2 saves with backup and emergency copies.
- **Old progression:** Hamlet needed 6 settlers, a house and 10 harvested food.
  Village needed 9 settlers, a workshop, a storehouse and 20 planks: one fixed path.
- **Differences from the docs, now fixed:**
  - Camp tents silently counted as 5 beds for growth, and camp sleepers had no home
    assignment. This is now an explicit, visible rule (camp bedrolls).
  - Beds weren't reserved for newcomers, and removing a house gave no shortage notice.
  - Finished buildings without a sprite drew nothing (the docs promised a placeholder).
  - The README said hovering the settler list shows idle reasons; it doesn't.
  - Only the `crafter` job could craft, with no worker limits.
  - World generation had no version.

### What changed and how the new journey plays

1. **Returning.** Loading a valley opens **Valley today**. It recaps the last
   session from recorded events only ("Built: 3× house. Welcomed Maple, Zinnia, Kit,
   Sorrel. Brought in 5 food, 42 wheat…"). It then lists up to 3 issues (storage
   full, no bed, mill needs wheat, "Deliver 8 more stone to the stone bridge", idle
   settlers), 2–3 goals from the real world state, and Village progress. Every line
   jumps to its target and highlights it. The **Today** button reopens it. Saves
   without history say so instead of inventing any.
2. **Organising.** The **Areas** tab draws farm areas, woodlots, quarries and building
   areas on explored land. You name them, assign selected settlers (up to 12), redraw,
   change kind or remove them. Assigned settlers do area work first. Woodlots and
   quarries need no marks. Each area shows what work is available, and settlers say
   why they're idle ("Fields in Home farm are growing", "Can't reach the rocks in
   Quarry 1"). The **work order** editor reorders or switches off Build, Haul, Farm,
   Gather and Craft per settler. Direct orders still take over temporarily.
3. **Bread.** Wheat now yields wheat. A **mill** (3 wheat → 2 flour) and a **bakery**
   (2 flour + 1 wood → 5 food) each take 1 worker (assign by right-click, see
   "Workers 1/1", unassign in the inspector). Inspectors show the recipe, inputs on
   hand, progress, workers and the exact reason for any stop. The mill's sails turn
   faster while it grinds. A wheat field ends up worth about 1.4 turnip fields of
   food, at the cost of two buildings, two workers, fuel wood and hauling, so turnips
   and pumpkins stay useful.
4. **The great river.** New worlds (generator 2) have a deep river about 20 tiles east
   with no fords. A settler on the bank can see across (river sightlines). The **stone
   bridge** is dragged bank to bank and explains problems before you confirm ("Both
   ends must reach dry land", "Too long", "Too deep for a wooden bridge — a stone
   bridge can cross here"). It costs 6 stone + 2 planks per tile (an 8-tile crossing
   is 48 stone + 16 planks), and haulers supply it. You watch piers, arches and deck
   go up. It is permanent, pathable, saved, on the minimap and in the goals. The far
   bank is open meadow with boulders and berries.
5. **Village.** 10 settlers, 8 home beds, and **any 2 of 4** projects: bake 30 food,
   2 staffed work areas, a stone bridge, or 25 path tiles. Reaching it brings a short
   celebration (the world pauses), turns the camp into a **village hall**, unlocks
   **cottages** (4 beds), benches and the Grand Market, and shows Town and Region as
   next goals, with Region clearly marked as a future update.
6. **Getting around.** A **minimap** shows explored terrain, rivers, roads, buildings,
   settler groups (idle ones in yellow), work areas and the view. Click it to move;
   toggle layers; switch between three zooms. Quick-find buttons jump to idle
   settlers, buildings waiting for resources, sites, the bridge (or a suggested
   crossing) and home.
7. **Homes and routines.**
   - Beds are explicit: house 2, cottage 4, camp 5 temporary bedrolls.
   - A bed is reserved when a newcomer arrives, and no home ever holds more people
     than beds.
   - Removing a home rehouses people or reports the shortage.
   - Villagers walk to their own door and sleep inside (lit windows only when
     occupied); campers each get their own spot.
   - A blocked route home means resting outdoors that night with an explanation, and
     no loop. Bed and wake times are staggered.
   - The settler inspector shows the bed and has **Show home**. Home inspectors show
     occupied/total beds and who's asleep.

### How to run

`npm install`, then `npm run dev` (http://localhost:5173). `npm test`, `npm run build`.
Profiling: `npx tsx scripts/profile-village.ts 100`. Generator check:
`npx tsx scripts/check-gen-fingerprint.ts`.

### Tests and build

- `npm test`: **79 tests, all passing** (5 files; 31 new in `tests/village.test.ts`).
  - Work areas: woodlot harvesting without marks, direct orders overriding and then
    returning, farm areas and their idle reasons, fog and size and worker limits.
  - Reservation cleanup while deleting and resizing areas, changing work orders and
    jobs. Every reservation must belong to a task that holds it, and every unit in
    transit must match.
  - Work orders.
  - Wheat, flour and bakery **resource conservation**, wheat yield, worker limits and
    stopped-production reasons.
  - Stone bridge: placement reasons, exact length-scaled cost, hauled supply,
    completion to terrain, **a path that didn't exist before**, a settler walking
    across, permanence, cancel-refund, save/load.
  - A scout surveying the far bank.
  - Village `anyOf` progress, unlocks, and bedrolls not counting as village beds.
  - All **8 housing edge cases**:
    1. 3 beds take 3, never 4
    2. two newcomers and one bed give one arrival
    3. an unfinished house has no beds
    4. removing a house rehouses and reports
    5. night in own homes, then back to work
    6. a walled-in home falls back
    7. save/load keeps homes and occupancy
    8. limits hold with 60 settlers
  - Saves: a **genuine v2 save** migrated, generator-1 land unchanged, v2 recovered via
    backup and emergency copy, a clear unrecoverable error, exact v3 round trip of all
    new state.
  - Valley today: only recorded events, valid targets, specific issues.
  - The **Hamlet → Village journey** via player commands, then save/resume.
- `npm run build`: passes (144 KB gzipped JS).
- `scripts/check-gen-fingerprint.ts`: 18/18 generator-1 chunks identical.

### Browser playthrough (actually performed, with a caveat)

Played in Chrome 152 on this machine. **Caveat:** the automated browser tab was hidden
(occluded), so the browser paused `requestAnimationFrame`. Frames were driven from the
console. For part of the session the automation also stopped delivering real mouse
events, so some clicks were sent as synthetic pointer events into the real input
handler.

- **Seen working:**
  - drawing a woodlot and assigning two settlers through the Areas tab (real clicks)
  - Valley today on resume (accurate)
  - right-clicking a mill to assign its worker, and a second worker refused with "1/1"
  - milling and baking running
  - the stone bridge refusing a half drag with its reason shown during the drag, then
    placed, built in visible stages, finished as a deck and crossed
  - Village reached with the celebration and the village hall
  - lit windows only in occupied homes
  - your two existing v2 saves in this browser **migrated and simulated in memory,
    read-only**; they were not loaded into the game or overwritten
- **Found and fixed while playing:**
  - area labels hidden under fog
  - a command-marker crash under clock skew
  - the far bank impossible to survey before bridging (river sightlines)
  - wheat flooding storage (yield rebalanced)
  - the overview listing issues before settlers had picked work
  - an "explore" goal that selected the camp
  - a wrapping tab label
- Not judged: animation smoothness and audio feel at real time. A playthrough in a
  visible window is still needed for those.

### Performance

Environment: Intel Core i5-4200M (2013 laptop, 4 threads), Node 22 / Chrome 152,
1920×901 canvas at 1× DPR.

Village: 101 settlers, about 99 buildings, 16 cottages, 3 storehouses, mill, bakery,
workshop, 4 work areas, 4 construction sites, a large harvest designation, 2 in-game
days including bedtime and morning rushes. Three runs each.

| | average | p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- | --- |
| Sim tick, day | 0.48–0.72 ms | 0.26–0.35 | 1.5–2.3 | 3.3–6.7 | 20–43 |
| Sim tick, night | 0.12–0.26 ms | ≤0.03 | 0.5–1.2 | 1.9–5.0 | 7–16 |
| Render frame (browser, zoom 2–3) | 6.6–12 ms | 6.5–8.8 | 9–29 (noisy) | | |

**Before the fixes**, the same village had night p99 of 90 ms and max 184 ms, and
daytime p99 of 16 ms. The fixes:

- a per-tick pathfinding budget
- staggered bed and wake times
- an idle back-off (woken by any change)
- shared, backed-off unreachable notes, cleared when the map changes
- a chunk lookup cache and an allocation-free A* heap
- 3–8× faster chunk generation (output verified identical)
- skipping unchanged fog reveals
- lights culled to the view

Remaining rare outliers come from garbage collection, first-time chunk generation
and occasional capped path searches.

### Save migration

Save v2 → v3 is a new migration; the v1 → v2 migration is unchanged. v2 worlds get
`genVersion: 1`, so unexplored land still generates exactly as before, plus empty
work areas, default work orders, empty worker lists, and no session record. Camp
sleepers get explicit bedrolls on load. Wheat fields in old worlds now yield wheat
for a mill. See [SAVE_FORMAT.md](SAVE_FORMAT.md).

### Known limitations

- No human playtest yet: [PLAYTEST.md](PLAYTEST.md) is ready, not run.
- The real-time feel (animation, sound, 60 fps pacing) was not judged in a visible
  window during this session.
- Production buildings take 1 worker each. More output means more mills or bakeries.
- Settlers mostly share one landmass. The shared "unreachable" note assumes that; a
  settler on the far bank may briefly skip a target others can't reach.
- Occasional 20–40 ms simulation outliers remain on an old laptop (garbage
  collection and chunk generation). Region-based reachability would remove the rest
  of the failed-search cost.
- The "since last session" recap starts with this version: older saves show today's
  state only.
- Touch controls, seasons, trade and multiple settlements are still to come.

### Highest-value next milestone

**"Seasons and the second settlement"**: add seasons (crop preferences, winter food
planning) that give the bread chain and storage real planning weight. Then let the
riverlands across the bridge host a **second settlement** with its own storehouse and
work areas, linked by roads with simple haul routes. That's the first real step
toward the Region tier, and it builds directly on the bridge, work areas and
production chain from this milestone.

---

## Milestone 1: first playable release (vertical slice)

### What is playable

- **Title screen** with the valley living behind the menu. Continue, new valley (name,
  seed, optional introduction), load/delete saved valleys, and settings.
- **One starting biome** that expands without limit: a seeded clearing with meadow,
  forest, rocky hills, a pond, rivers with fords, and lakes further out. Chunks
  generate lazily, fog of war lifts as settlers explore, and trees regrow from stumps
  and berries refill.
- **Five settlers** with names, looks, jobs (laborer, farmer, gatherer, builder,
  hauler, crafter), hunger, energy and homes. Click or drag to select, right-click
  for contextual orders. They find paths, avoid duplicate work, re-plan around new
  obstacles, and say why they are idle.
- **Resources:** food, wood and stone, plus planks and tools from the workshop.
  Per-building storage, hauling to sites and workshops, and a storage-full warning.
- **Farming:** turnip, wheat and pumpkin (unlocked at Hamlet), each with four visible
  stages. Fields go staked → tilled → planted → growing → ripe → harvest → replant.
  Watering and rain affect growth, and fertile meadow grows faster.
- **Buildings:** house, field, storehouse and workshop (required), plus path, bridge,
  fence, flower bed, lantern post, bench and the Grand Market project. Placement
  preview shows valid and invalid tiles with reasons, and construction climbs
  visibly from scaffold to finished building.
- **Population growth** from free beds plus food. Milestones Camp → Hamlet → Village
  → Town unlock content. Region and Civilization appear as future goals.
- **Day and night** with lighting, lit windows and campfire glow, settlers sleeping
  at home, rain showers, fireflies, chimney smoke, swaying trees and rippling water.
- **Time controls** (pause, 1×, 2×, 4×), a nine-step introduction, toasts, hover
  info, settler list, goals panel and inspectors.
- **Sound:** synthesised effects, ambience and generative music, with master, music
  and effects volumes and mute.
- **Saving:** autosave (interval plus after big moments), manual save, multiple slots,
  resume, backup rotation, emergency save on close, versioned format with migrations.

### Demonstration of the player journey

Played in Chrome at 1920×901, then as a headless test (`tests/journey.test.ts`):

1. **New valley.** Five settlers, the camp, 30 food, 15 wood and 5 stone. The
   introduction starts.
2. **Selection.** Click one settler, then drag a box around three.
3. **Gathering.** Right-click an oak. Three settlers chop it, carry logs overhead
   to camp, then move on to nearby trees. The gatherer keeps stone topped up.
4. **Farming.** Build → Field, then drag 15 fields onto the meadow. Farmers till
   (hoe), plant, water (can) and harvest (sickle), and crops pass through every stage.
5. **House.** Placed north of camp. Haulers deliver 20 wood and 6 stone, and builders
   raise it. A newcomer ("Posy has settled in the valley!") arrives, and the valley
   becomes a **Hamlet** (pumpkins, bridges and lanterns unlock).
6. **Workshop.** Placed east of camp. Its warning icon reads "No crafter". Right-click
   it with a settler selected, they become a Crafter, and the first planks appear.
   Storage fills, a warning toast appears, and a storehouse fixes it.
7. **Night.** The camp glows, windows light up, and settlers head home or sleep
   around the tents.
8. **Exploration.** Order a settler into the fog. The explored area grows, and new
   chunks paint in without stutter.
9. **Save and resume.** Autosave, save from the menu, reload the page, Continue.
   The same day, buildings, fields and settlers come back, including progress since
   the last full save through the emergency copy.

### What was tested

- `npm test`: **48 Vitest tests, all passing.**
  - RNG determinism and resumable RNG state, noise ranges, tile keys with negative
    coordinates.
  - World generation reproducible per seed, different across seeds, and a friendly
    spawn for five seeds (clear camp, enough trees, rocks and berries, fertile meadow).
  - Pathfinding around walls, no corner cutting, budget cut-off, partial paths,
    reaching building sides.
  - Gathering and hauling, marking for harvest, invalid orders with reasons.
  - Construction consuming exactly its cost, placement rules (water, trees, fog),
    refunds on cancel, paths and bridges becoming terrain, unlock gates.
  - Farming through every visual stage, slower dry growth that never kills crops,
    crop unlocks.
  - Eating, sleeping, newcomers with free beds and food, no growth without housing.
  - The workshop producing planks, and idle workshops explaining why.
  - **Resource conservation**: over six simulated half-days, every unit of wood and
    stone is accounted for in storage, sites, hands or finished buildings, and no
    reservation ever goes negative.
  - **Saves**: exact round trip, persistence of changed chunks, exploration and
    marks, compact storage of unchanged chunks, no goods lost across load, v1→v2
    migration, rejection of future and damaged saves, backup fallback after a
    truncated write, emergency copies (newer wins, stale ignored).
  - **The full first journey**, played headless through the same commands the UI sends.
- `npm run build`: typecheck and production bundle succeed (126 KB gzipped JS).
- In the browser: the journey above, the pause menu, settings (volumes, keys),
  save/Continue, day/night, rain, and exploration with worker-painted chunks.
- Performance in Chrome at 1920×901: frame render about 3.5–5 ms (7 settlers) and
  about 7.6 ms (60 settlers). Simulation tick about 0.17 ms (7) and about 1.5 ms (60).
  Chunk ground painting moved to a worker after measuring 60–800 ms on the main thread.

### Fixed during playtesting

- Settlers holding goods with full storage stood idle (and could starve with food
  in stock). They now keep farming and building, and eat.
- Move orders into sealed-off forest failed outright. Forests are now thinner, and
  moves walk as close as they can.
- Everyone slept on one tile around the camp. Sleepers now spread out.
- Closing the tab could lose progress since the last IndexedDB write. An emergency
  synchronous copy now covers this.
- Pixel-font digits (5/S, 8/B) were hard to read. Numbers now use Atkinson Hyperlegible.
- The build menu covered the map while placing. It closes on selection and shows a
  compact placing bar with the crop picker.

### Known limitations

- Touch controls are not implemented yet (desktop first, as planned).
- Settlers don't collide with each other and can overlap.
- Distant settlements, trade, seasons, orchards and food chains aren't built yet.
  The data tables and milestone list leave room for them.
- Changing `worldgen.ts` would alter unmodified chunks of existing worlds. A
  generator version will be needed before the next generator change.
- There is no minimap, and no rename for settlers or valleys after creation.
- Tool bonus: tools don't wear out. They just give a flat 25% speed bonus once
  there is one per settler.
- The in-browser check drove frames by hand because the automation tab was
  hidden (browsers pause `requestAnimationFrame` in hidden tabs, and so does the
  game). A human playtest on a visible window is still worthwhile for feel.

### Next milestone (2): the Hamlet → Village loop

- Work areas: assign settlers to zones (a farm district, a woodlot) and set job
  priorities per settler.
- Seasons with crop preferences, and an orchard tree with multi-year growth.
- A food chain (wheat → mill → bakery) using the recipe system and multiple-input
  buildings.
- A minimap, settler and valley rename, and touch/pinch controls.
- More long projects: a stone bridge that permanently spans a river, plus the
  district and road network that lead toward Town.
- A performance pass for 100+ settlers (spatial index for job search, staggered AI).
