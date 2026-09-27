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

2. That's it. Fields, the crop pickers, the inspector, sprites (generated from
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
   - `housing`, `storage`, `recipes`, `light`, `reveal`, `maxBuilders`, `unlock`
   - `convertsTo: 'road' | 'bridge'` turns the tiles into terrain when finished
2. Draw it: add a `Draw` function in `src/render/sprites/buildings.ts` and register it
   in `makeBuildingSprites()` with its canvas size and footprint offset. Use `lit` for a
   night variant (window glow). Buildings without a sprite fall back to a
   scaffold-only look, so the game still runs.
3. Behaviour comes from the fields: housing counts toward population, storage takes
   deliveries, recipes make it a workshop, and lights appear at night. Unusual
   behaviour belongs in a system module (e.g. `sim/buildings.ts`), keyed by a
   data field rather than the id where possible.
4. Chimney smoke is currently tied to `house`/`workshop` in `Renderer.render`. Add an
   `emits` field to the definition if more buildings need it.

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
are `population`, `built` (building count) or `stat` (a counter in
`Simulation.stats`). Gate content by setting `unlock: '<milestoneId>'` on crops or
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
