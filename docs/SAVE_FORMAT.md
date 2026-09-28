# Save format

Saves are JSON documents described by `src/game/save/format.ts`. The current version
is **9** (`SAVE_VERSION`).

## Version history

| Version | Game | What changed |
| --- | --- | --- |
| 1 | prototype | Flat layout; the generic job was called `worker`. |
| 2 | Milestone 1 | `meta` / `sim` / `world` sections, crafting stats, weather. |
| 3 | Milestone 2 (Village) | World generator version, work areas, personal work orders, production workers, span building sizes, the chronicle and session marks, new stats. |
| 4 | Seasons and settlements | `settlements`, settler `settlementId`, storage `wants` (stock targets). |
| 9 | Diplomacy, concern and news | `sim.diplomacy`: world events (internal truth), news reports (pending and delivered, with source, certainty, times, supersession and relay chain), summarised counts, stances, directional trust, wars, treaty offers (with escrow and reasons), incidents, warnings, concern states (band, score, warning dedupe, reassurance), war plans, coalition commitments (escrow, reserved company ids); kingdoms gain a temperament and companies. |
| 8 | Crown, government and land | `kingdoms` (the player's kingdom first: crown, ruler, banner, treasury, tax policy, trust, council, frozen homeland, conflict setting; then known rivals), `claims` (frontier sectors), settler `kingdomId`, merchant `coins`. |
| 7 | Travellers and connected settlements | `routes`, `manifests` (carts on the road with their cargo), `parties` (merchants, without walking paths), `knownRegions`, `nextMerchant`, settler `awayOn`, trade and caravan stats. |
| 6 | Mountains and mining | `geology` (surveyed cells and ore left), building `mine` (deposit, shaft level) and `quarry` (stone cut), mining and smelting stats. New worlds use generator 3. |
| 5 | Families and orchards | `growthMode`, settler `lifeStage` / `ageTicks` / `householdId`, `households`, `bedClaims`, visitor `offer`, `nextVisitor`, `recruits` (with apple escrow), `lastRecruit`, building `orchard`, stats `births` / `applesPicked` / `driedApples`. |

## Version 3 layout (v4 and v5 add to it, see below)

```jsonc
{
  "version": 3,
  "meta":  { "name", "seed", "createdAt", "savedAt", "day", "population", "milestone" },
  "sim": {
    "tick", "nextId", "rngState", "lastArrival",
    "settlers":  [{ "id", "name", "x", "y", "facing", "job", "carrying", "hunger", "energy",
                    "homeId", "appearance", "focus",
                    "areaId",      // work area or null
                    "priorities"   // personal work order, e.g. ["farm","haul"], or null for the job default
                  }],
    "buildings": [{ "id", "type", "x", "y", "built", "progress", "delivered", "inventory",
                    "field?", "workshop?", "placedTick",
                    "workers",     // settler ids assigned to a production building
                    "w?", "h?"     // only for span buildings (stone bridge), whose size varies
                  }],
    "designations": [[x, y], ...],
    "regrowth":     [[x, y, objectId, atTick], ...],
    "stats":   { "woodGathered", "stoneGathered", "foodGathered", "harvested", "planksCrafted",
                 "toolsCrafted", "arrivals", "wheatHarvested", "flourMilled", "bakedFood", "pathsBuilt" },
    "reached": ["camp", "hamlet", ...],
    "weather": { "raining", "nextChange" },
    "workAreas": [{ "id", "name", "kind": "farm|wood|stone|build", "x0", "y0", "x1", "y1" }],
    "chronicle": [{ "tick", "kind": "built|arrival|milestone|bridge|shortage", "text", "x?", "y?" }],
    "session":   { "startTick", "startStats", "startPopulation" } | null
  },
  "world": {
    "genVersion": 2,   // generator that made this world; unexplored land keeps using it
    "chunks": [{ "cx", "cy", "explored": "<base64 bitset>", "terrain?", "obj?", "amt?" }]
  },
  "view":     { "camX", "camY", "zoom" },
  "tutorial": { "step", "done" }
}
```

- Only chunks that were **explored** or **modified** are stored. Explored-only chunks
  keep just a 128-byte bitset; everything else regenerates from the seed **with the
  saved `genVersion`**.
- **Not saved:** settler tasks, paths, reservations, goods promised in transit, the
  occupancy map, idle back-off timers and pathfinding notes. After a load, settlers
  choose work again. Carried goods, home assignments, area assignments and workers are
  saved, so totals and bed counts are exact.
- `chronicle` holds the last 80 notable events. `session` marks where the last play
  session began. Together they let "Valley today" say what happened last time,
  **only from recorded events**. Saves from before v3 have `session: null`, and the
  panel then shows the current situation instead of a made-up history.

## World generator versions

`src/game/world/worldgen.ts` exports `CURRENT_GEN` and `SUPPORTED_GENS`.

- Generator **1** is the Milestone 1 generator, kept byte-for-byte.
  `tests/fixtures/gen-v1-fingerprint.json` holds hashes of 18 chunks across 3 seeds,
  and `npx tsx scripts/check-gen-fingerprint.ts` plus the test suite confirm old worlds
  still generate identical land.
- Generator **2** adds the great river east of the spawn (a deep channel with no fords)
  and the fertile, stony riverlands beyond it. Fingerprinted in
  `tests/fixtures/gen-v2-fingerprint.json` (27 chunks, 3 seeds) before generator 3 was written.
- Generator **3** adds hills (new tile id 10) and mountain faces (id 11): a northern
  ridge with a pass every 48 tiles, lone massifs more than 40 tiles from the camp,
  and two starter outcrops. Existing tile ids are unchanged.

Every v2 save migrates to `genVersion: 1`. New worlds use `CURRENT_GEN`. To change
generation later, add generator 4 alongside the others (never edit an old one), bump
`CURRENT_GEN`, add it to `SUPPORTED_GENS`, and fingerprint it with
`npx tsx scripts/make-gen-fingerprint.ts 4` **before** the next change (the script
refuses to overwrite an existing fingerprint).

## Geology (v6)

`world/geology.ts` is a separate, versioned layer (`GEOLOGY_VERSION`). Deposits are
pure functions of (seed, generator, 16×16 cell). Only cells a settler has surveyed
are saved: `"geology": { "version": 1, "cells": [[cellId, oreLeft | null], ...] }`
(`null` = surveyed, nothing there). The v5 → v6 migration starts with no surveyed
cells, so an old world's ore is discovered by surveying its existing rocky ground;
its land is never regenerated. Ore promised to miners on their way
(`sim.oreReserved`) is transient: tasks aren't saved, so nothing is promised after a load.

## Where saves live

`IndexedDB` database `little-valley`:

- `meta` store: one small record per slot, for the load menu.
- `data` store: `{ current, backup }` per slot. Each write moves the previous `current`
  to `backup` inside one transaction.

`SaveManager.save` parses its own output back (migrate, validate, deserialise) before
writing, so a save that can't be read is never written.

When the page is hidden or closed, the controller also writes a synchronous
**emergency copy** to `localStorage` (`little-valley:emergency:<slot>`). On load, a
newer emergency copy wins. The next regular save clears it.

## Loading and recovery

`SaveManager.load(slot)` tries, in order:

1. The emergency copy, if newer than `current`.
2. `current` → `JSON.parse` → `migrate` → `validateSave` → `deserializeSim`.
3. `backup`, if `current` fails. The player is told what was wrong.

If everything fails, the game shows **"This valley could not be opened"** with the
exact error, and states that nothing was overwritten or deleted. It never quietly
starts a new world in the old one's place. Saves from a newer game version and
unsupported generator versions are refused with a clear message.

## Migrations

`MIGRATIONS[n]` in `migrations.ts` turns version *n* into *n + 1*, and `migrate()`
applies them in sequence (v1 → v2 → v3). Shipped migrations are never edited.

The **v2 → v3** migration adds:

- `world.genVersion = 1`
- `workAreas: []`, `chronicle: []`, `session: null`
- `areaId: null` and `priorities: null` on every settler
- `workers: []` on every building
- missing stats set to 0

Camp sleepers in v2 had `homeId: null`. On load, `assignHomes` gives them explicit
camp bedrolls or free house beds, never more than a building's bed count.

**Behaviour change for old worlds:** wheat now yields *wheat* (for the mill) instead of
food. Existing wheat fields keep growing. Their harvest goes to storage as wheat, and
"Valley today" suggests building a mill.

Tests (`tests/save.test.ts`, `tests/village.test.ts`) cover:

- a hand-written v1 save
- a **genuine v2 save** captured from the Milestone 1 code (`tests/fixtures/v2-save.json`)
- v2 recovered from the backup and from an emergency copy
- an unrecoverable slot
- exact v3 round trips of all new state


## Version 5 additions

```jsonc
"sim": {
  // …everything from v3/v4, plus:
  "settlers": [{ /* … */ "lifeStage": "adult|child", "ageTicks", "householdId" }],
  "buildings": [{ /* … */ "orchard?": { "growth", "fruit", "careUntil" } }],
  "growthMode": "legacy|deliberate",
  "households": [{ "id", "adults": [a, b], "children": [], "cooldownUntil",
                   "pending": { "requestedTick", "stableTicks", "claimId", "blocked" } | null }],
  "bedClaims":  [{ "id", "homeId", "owner": { "kind": "birth|recruit", "id" } }],
  "offer": { "id", "name", "appearance", "arrivedTick", "expiresTick" } | null,
  "nextVisitor", "lastRecruit" /* null if none */,
  "recruits": [{ "id", "name", "appearance", "settlementId", "claimId", "state": "travelling|refunding",
                 "escrow": { "apples": 50 }, "arrivesTick", "blocked" }]
}
```

- Bed claims and apple escrow are **saved**, unlike tasks and reservations: an expected
  child or an accepted traveller keeps their bed and apples across a reload, and a
  reload can't create a second arrival or a second charge. Escrowed apples are in no
  store while held; every unit is still accounted for.
- The **v4 → v5** migration makes every settler an adult with no household (no families
  are invented), sets `growthMode: 'legacy'` (automatic arrivals continue until the
  player adopts deliberate growth) and adds empty households, claims, visitor and
  recruitment state. New worlds start `'deliberate'`.
- On load, households that reference missing adults are dropped, missing children are
  removed from lists, and `validateClaims` drops invalid claims (the owner then waits
  for a bed) before `assignHomes` runs.
- Fixtures: `tests/fixtures/v4-save.json` is a genuine v4 save (two settlements,
  stock target) captured before the v5 change; the v2 and v3 fixtures also migrate
  through v5.

## Diplomacy and news (v9)

Everything that makes a promise is saved: coins in escrow, reserved allied companies,
reports still on the road, warning cooldowns and reassurances. A report on its way
arrives exactly once after a reload. The v8 → v9 migration gives rivals their home
companies and starts with no reports, treaties, wars or plans.

## Kingdoms and land (v8)

The player's kingdom has id 0; a rival's id is its home region's id, so rivals need no
id allocation and are recreated identically. The protected homeland is saved as the
exact list of sectors fixed at coronation. Frontier claims are saved; homeland and
rival lands are derived. The v7 → v8 migration adds an uncrowned kingdom named after
the first settlement, with an empty treasury, and makes every settler loyal to it.

## Caravans and merchants (v7)

Goods on a cart belong to its manifest alone (they left the source when it set off), so
a reload in mid-journey restores the cart with its cargo and the teamster still away
(`awayOn`), and the arrival happens exactly once. Merchants save their stage
(travelling, arriving, lodging, leaving) and position; their walking path is rebuilt.
On load, a settler marked away on a caravan that no longer exists comes home. The
v6 → v7 migration adds empty lists and marks nobody away.

## v3 → v4 (seasons and settlements)

The v3-to-v4 migration establishes the original camp settlement, assigns existing settlers to it and initializes storage targets. Settlers persist `settlementId`, buildings persist `wants`, and simulation state persists `settlements`. Earlier migrations are retained. Seasons derive from saved game time, with no offline progression: an older world can therefore resume in summer, autumn or winter according to its saved day. Generator versions and original chunk generation remain unchanged. The genuine v3 fixture joins existing migration coverage.
