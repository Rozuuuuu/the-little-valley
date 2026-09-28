# Adding content

Content lives in typed tables under `src/game/data`. Core systems read these tables
and never switch on specific ids, except for a few special cases noted below.

## A new crop

1. Add the id to `CropId` and an entry to `CROPS` in `src/game/data/crops.ts`:

   ```ts
   carrot: {
     id: 'carrot', name: 'Carrot', description: 'Crunchy and quick.',
     stages: 4, growTicks: 1300, yield: { food: 4 },
     unlock: 'hamlet',                      // optional milestone gate
     art: { style: 'root', leaf: '#6fb04e', leafDark: '#3f7a3a', fruit: '#f08a3a', fruitDark: '#b35a26' },
   },
   ```

2. `yield` can be any resource (wheat yields `wheat` for the mill, turnips yield
   `food`). That's it. Fields, the crop pickers, the inspector, sprites (generated from
   `art.style` and colours in `render/sprites/crops.ts`), saves and validation pick it
   up automatically. For a new *shape*, add a style to `STYLE` in `crops.ts`
   (one draw function per stage).

`growTicks` is measured at 100% fertility with moist soil. Meadow grows 35% faster,
and dry soil grows at 40% speed.

## A new building

1. Add the id to `BuildingId` and an entry to `BUILDINGS` in `src/game/data/buildings.ts`.
   Relevant fields:
   - `size`, `cost`, `work` (builder ticks), `placement` (`land`, `farmland`, `water`), `blocks`
   - `paint: true` to place by dragging a rectangle of 1×1 tiles
   - `housing` (beds; `temporaryBeds: true` for camp-style bedrolls), `storage`, `recipes`,
     `maxWorkers` (production staff limit), `light`, `reveal`, `maxBuilders`, `unlock`
   - `span: { min, max, costPerTile, workPerTile }` for drag-placed crossings like the
     stone bridge (placement `'span'`). Cost and work scale with length.
   - `permanent: true` to forbid demolishing once built
   - `convertsTo: 'road' | 'bridge'` turns the tiles into terrain when finished
2. Draw it: add a `Draw` function in `src/render/sprites/buildings.ts` and register it
   in `makeBuildingSprites()` with its canvas size and footprint offset. Use `lit` for a
   night variant (window glow). Homes only use the lit variant when someone is asleep
   inside. Finished buildings without a sprite show a simple placeholder block, so
   the game still runs. Animated parts (like the mill's sails) are separate sprites
   drawn in `Renderer.drawBuilding`.
3. Behaviour comes from the fields: housing counts toward population, storage takes
   deliveries, recipes make it a workshop, and lights appear at night. Unusual
   behaviour belongs in a system module (e.g. `sim/buildings.ts`), keyed by a
   data field rather than the id where possible.
4. Chimney smoke is currently tied to `house`, `workshop`, `bakery` and `cottage` in
   `Renderer.render`. Add an `emits` field to the definition if more buildings need it.

## A new production chain

The bread chain shows the pattern: a crop yields a raw resource (`wheat`), one building
processes it (`mill`: 3 wheat → 2 flour), and another finishes it (`bakery`: 2 flour +
1 wood → 5 food). Each is just data: resources, a crop `yield`, recipes, and buildings
with `recipes` and `maxWorkers`. Hauling, worker assignment, status lines, Valley
today issues and conservation tests all work generically. Count new outputs in
`runCraft` (a stat) if a milestone needs them, and extend `consumedByCrafting` in
`tests/helpers.ts` so the conservation tests cover the new recipe.

## A new recipe

Add it to `RECIPES` (`data/recipes.ts`) and list its id in a building's `recipes`.
Haulers buffer two batches of inputs automatically, and the workshop inspector shows
the recipe, inputs on hand and why it is waiting.

## A new resource

Add it to `RESOURCES` (`data/resources.ts`) and draw an icon in
`render/sprites/icons.ts` (`RESOURCE_ICON_DRAW`). Storage, hauling, the HUD and
saves are generic. The HUD shows `MAIN_RES` and `CRAFTED` in `ui/Hud.tsx`, so list
it there too.

## A new milestone

Milestones are ordered in `MILESTONE_ORDER` (`data/progression.ts`). Requirements
are `population` (adults only: children don't count toward a workforce), `built` (building count), `stat` (a counter in `Simulation.stats`),
`beds` (permanent home beds), `staffedAreas` (work areas with someone assigned), or
`anyOf` (any *n* of a list), which lets players pick their own path, as Village
does. Gate content by setting `unlock: '<milestoneId>'` on crops or
buildings. Mark a milestone `future: true` to show it as a goal that is not reachable
yet.

## A new job

Add it to `JOBS` (`data/jobs.ts`) with a priority list of work kinds. A new *work
kind* needs a finder in `FINDERS` (`sim/settlers.ts`) that returns a task, a reason
string, or null.

## Tests

`tests/simulation.test.ts` shows how to drive a headless world with `applyCommand`
and `runUntil`. The `accountedFor` / `consumedBy*` helpers let new production chains
be checked for resource conservation.

## A new kind of work area

Area kinds live in `AreaKind` (`sim/types.ts`) and `AREA_LABELS` (`sim/commands.ts`).
Self-staffing (`wanted`) and farm field layout (`crop`) live in `sim/areas.ts`.
Add the kind, then teach `findAreaWork` in `sim/settlers.ts` what it means, returning
a task or a plain-language reason. Give it a colour and a letter in `AREA_COLORS` and
`AREA_SYMBOL` (`render/Renderer.ts`), and a status line in `areaInfo`
(`engine/snapshot.ts`).

## Building levels

Add a `LevelDef[]` for the building in `LEVELS` (`data/buildings.ts`). Level 1 describes the
building as built (cost and time ignored); each later level has a name, a cost paid up
front, a time in ticks, an optional milestone, the stats it changes (`housing`, `storage`,
`maxWorkers`, `lodging`, `trainingSlots`, `penCapacity`, `huntRadius`, `wellRadius`,
`speed`, `light`, `reveal`) and `perks` in words for the command card. Stats a level leaves
out carry over from the level below; read them with the helpers in `sim/levels.ts`
(`housingOf`, `storageOf`, `workersOf`, `speedOf`, …), never from the definition directly.
`becomes` rebuilds the building in place as another type (the old camp → Town Hall).

## Animals, pens and hunting

- A species: `SPECIES` in `data/animals.ts` (size class, speed, how far it flees, herd size,
  the ground it lives on, what a hunt yields) and a sprite in `render/sprites/animals.ts`
  (two walking frames, facing left).
- Where it lives: add it with a weight to `WILDLIFE` for each habitat.
- A pen: a building with `pen: { species, capacity, breedTicks, product?, cull? }`, a yard
  sprite in `makePenSprites` (yard under the animals, front rail over them), and optionally
  a `penCapacity` level.

## Habitats

`HABITATS` in `data/habitats.ts` holds each habitat's numbers (range distance and
thickness, peaks and hills, forest and meadow bands, trees on grass, lakes and ponds,
rocky ground, the great river). They are read only by generator 4, so changing them
changes new worlds only — but it changes every generator-4 world, so treat shipped
numbers like a shipped generator: add a new generator instead of editing them.

## Changing world generation

Never edit an existing generator. Add a new version in `worldgen.ts` (branch on
`gen`), bump `CURRENT_GEN`, add it to `SUPPORTED_GENS`, and add a fingerprint
alongside `tests/fixtures/gen-v1-fingerprint.json`. See
[SAVE_FORMAT.md](SAVE_FORMAT.md).


## Government, diplomacy and war content

- Tax policies, council posts, banner colours/emblems and territory numbers: `data/kingdoms.ts`.
- Treaty kinds, AI acceptance thresholds, news limits and concern bands: `data/treaties.ts`.
- Soldier kinds (gear, training time and place, strength, range): `data/units.ts`; a new
  kind also needs a training building that lists it in `training.units`.
- Combat and war numbers (field budget, morale break, occupation and siege times):
  `data/war.ts`.
- New world events for news and concern are added to `WorldEventKind` (`sim/types.ts`)
  and weighed in `evaluateConcern` (`sim/concern.ts`); give them words in
  `KIND_WORDS` (`engine/kingdomSnapshot.ts`).

## Trade goods

Every resource needs a value in `PRICES` (`data/trade.ts`); merchants sell at 125% and
buy at 80%. `MERCHANT_GOODS` lists what they may bring; every merchant also carries
copper or iron ore so metal never depends on a lucky survey.

## Minerals, extraction and fuel

Minerals live in `data/minerals.ts` (weight, typical amount, the resource a mine
produces). Adding one needs a resource and an icon. Weights only affect cells that
haven't been surveyed yet in existing worlds. Buildings with
`extraction: 'quarry' | 'mine'` and a `site` rule (`'rock'` or `'deposit'`) become
dig sites; yields and upgrade costs are in `sim/mining.ts`. A recipe with `fuel: n`
burns n coal or charcoal per batch; add new fuels to `FUELS` in `data/recipes.ts`.
For conservation tests, record each recipe's batches in a stat and extend
`consumedByCrafting` in `tests/helpers.ts`.

## Growth, families and orchards

Timings and thresholds for deliberate growth live in `data/kingdomBalance.ts` (days to
birth and adulthood, family cooldown, apples per traveller, orchard yield). Change
them there; the simulation, the Families panel and the tests read the constants. A
new home only needs `housing` (beds): claims and household beds pick it up. Orchards
are tied to the `orchard` building type (`sim/orchards.ts`); a second fruit tree
would add a resource, a building and an entry there. Apples appear in the HUD via
`CRAFTED` in `ui/Hud.tsx`.

## Seasons and settlements continuation

Crop `seasons` entries multiply the season-wide growth factor; omitted entries default to one. Configure climate in `data/seasons.ts`. Buildings with `settlementCenter.minSpacing` can found settlements; keep their placement, temporary/permanent beds and storage explicit. Storage `wants` are target quantities, not newly created goods. Surplus is available stock minus the source target. The Towns UI currently exposes food targets for centres; the command supports typed resources on stores.
