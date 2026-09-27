# Save format

Saves are JSON documents described by `src/game/save/format.ts`. The current version
is **2** (`SAVE_VERSION`).

```jsonc
{
  "version": 2,
  "meta":  { "name", "seed", "createdAt", "savedAt", "day", "population", "milestone" },
  "sim": {
    "tick", "nextId", "rngState", "lastArrival",
    "settlers":  [{ "id", "name", "x", "y", "facing", "job", "carrying", "hunger", "energy", "homeId", "appearance", "focus" }],
    "buildings": [{ "id", "type", "x", "y", "built", "progress", "delivered", "inventory", "field?", "workshop?", "placedTick" }],
    "designations": [[x, y], ...],          // tiles marked for harvest
    "regrowth":     [[x, y, objectId, atTick], ...],
    "stats":   { "woodGathered", "stoneGathered", "foodGathered", "harvested", "planksCrafted", "toolsCrafted", "arrivals" },
    "reached": ["camp", "hamlet", ...],
    "weather": { "raining", "nextChange" }
  },
  "world": {
    "chunks": [{ "cx", "cy", "explored": "<base64 bitset>", "terrain?": "<base64>", "obj?": "<base64>", "amt?": "<base64>" }]
  },
  "view":     { "camX", "camY", "zoom" },
  "tutorial": { "step", "done" }
}
```

- Only chunks that were **explored** or **modified** are stored. Explored-only chunks
  keep just a 128-byte bitset; everything else regenerates from the seed.
  Modified chunks (chopped trees, roads, bridges) store their full 1 KB arrays.
- **Not saved:** settler tasks, paths and reservations, goods in transit to storage,
  and the derived occupancy map. After a load, settlers choose work again. Carried
  goods are saved, so totals are exact.

## Where saves live

`IndexedDB` database `little-valley`:

- `meta` store: one small record per slot, for the load menu.
- `data` store: `{ current, backup }` per slot. Each write moves the previous `current`
  to `backup` inside a single transaction.

Before writing, `SaveManager.save` serialises the world and parses its own output back
through migration, validation and deserialisation. A save that can't be read back is
never written.

When the page is hidden or closed, the controller also writes a synchronous
**emergency copy** to `localStorage` (`little-valley:emergency:<slot>`), because the
browser may kill an asynchronous IndexedDB write during unload. On load, a newer
emergency copy wins over `current`. The next regular save clears it.

## Loading and recovery

`SaveManager.load(slot)` tries, in order:

1. The emergency copy, if newer than `current`.
2. `current` → `JSON.parse` → `migrate` → `validateSave` → `deserializeSim`.
3. `backup`, if `current` fails. The player is told which problem occurred.

A save from a newer game version is refused rather than guessed at.

## Migrations

`MIGRATIONS[n]` in `migrations.ts` converts version *n* to *n + 1*, and `migrate()`
applies them in sequence. Version 1 was the prototype layout: flat top-level fields,
the job called `worker`, no crafting stats or weather. The v1→v2 migration is covered
by `tests/save.test.ts`.

To change the format:

1. Update the types in `format.ts` and bump `SAVE_VERSION`.
2. Add `MIGRATIONS[oldVersion]` that transforms the old shape. Never edit a shipped migration.
3. Update `serialize.ts` and `validateSave`.
4. Add a test that loads a hand-written old-version save.
