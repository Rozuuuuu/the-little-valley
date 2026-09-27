# Milestone reports

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
