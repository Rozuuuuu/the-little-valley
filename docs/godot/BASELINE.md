# Baseline: the browser game before the Godot port

Measured 2026-10-04 on branch `godot-migration` (from `master` at `8223339`). These numbers are
the reference the Godot version is compared against. Re-run the commands to refresh them.

## Reference machine

| | |
| --- | --- |
| CPU | Intel Xeon E5-2680 v3, 12 cores / 24 threads, 2.5 GHz |
| RAM | 16 GB |
| GPU | AMD Radeon RX 580 2048SP |
| OS | Windows 11 Pro 10.0.26200 |
| Node | 24.14.1 (simulation timings run in Node, not a browser) |
| Godot | 4.7.2-stable (official, the .NET build; all code is GDScript) |

## Tests

`npx vitest run`: **336 passed** (40 files). These include a new test that pins generator 4 in
every habitat (`tests/fixtures/gen-v4-fingerprint.json`, 135 chunks; before this, the
current generator had no fingerprint).

## Simulation tick (one 100 ms game tick, in milliseconds)

`npx tsx scripts/profile-village.ts N`: a developed village (99 buildings, 4 work areas, mill,
bakery and workshop running), 2 in-game days, generator 3 land, seed 777001. Daytime ticks:

| Settlers | p50 | p95 | p99 | max |
| --- | --- | --- | --- | --- |
| 25 | 0.10 | 0.85 | 1.5 | 5.4 |
| 100 | 0.36 | 1.56 | 10.8 | 20.8 |
| 300 | 0.96 | 2.24 | 4.5 | 17.6 |

**Workload caveat:** the scenario adds settlers but not homes or work for them. At 300, 226
settlers have no bed and only about 31 are busy at a time, so the 300 row understates a real
300-person town. A scenario with homes, fields and jobs scaled to the population is a Phase 1
task (`scripts/soak-village.ts` and the Godot benchmark will share it).

At 1x speed a tick has a 100 ms budget, so the browser simulation has ample headroom at all
three sizes. The ticks that matter are the occasional 17–21 ms spikes.

## Long session (soak)

`NODE_OPTIONS=--expose-gc npx tsx scripts/soak-village.ts 100 20`: the same village for 20
in-game days (about 1.6 hours of play at 1x). Five scouts walk a widening spiral every 400 ticks
so explored land keeps growing, as in a long game. The heap is read after a forced collection.

| Day | p95 ms | p99 ms | Loaded chunks | Explored chunks | Heap MB | Save KB | Load ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1.78 | 11.6 | 49 | 28 | 13.7 | 92 | 98 |
| 5 | 0.62 | 22.5 | 264 | 120 | 14.4 | 110 | 417 |
| 10 | 0.70 | 22.9 | 492 | 143 | 14.8 | 115 | 527 |
| 15 | 0.44 | 22.6 | 727 | 171 | 15.2 | 120 | 593 |
| 20 | 0.58 | 25.0 | 951 | 181 | 15.4 | 122 | 648 |

The 300-settler soak shows the same shape (p99 22–25 ms, 951 loaded and 181 explored chunks
by day 20). Its village goes nearly idle after day 11 (the caveat above).

### Findings

**Measured:**

1. **Loaded chunks grow about 5x faster than explored land:** 951 in memory against 181
   explored by day 20. Any terrain query on an unknown tile generates that chunk. This includes
   a path search expanding into fog, which most often happens on partial-path move orders
   into the unknown. Nothing ever unloads.
2. **Load time grows with exploration, not with save size.** The save stays near 120 KB, but
   loading went from 98 ms to 648 ms, because every explored chunk is regenerated from the
   seed during load (`deserializeSim`).
3. **A steady p99 of about 22–25 ms**, even on days when p95 is under 1 ms. These are the
   frame-visible spikes.
4. **No leaks in transient state.** Reservations, unreachable notes, cached paths and
   regrowth timers rise and fall with activity and keep returning to near zero. The chronicle
   stays within its cap. The heap rises slowly (13.7 to 15.4 MB), tracking the loaded chunks.

**Hypotheses (not yet proven):**

- The 22–25 ms p99 ticks are first-time chunk generation. The count of new chunks per day
  (about 45) is close to the count of p99 ticks per day (about 29). Logging chunk creation
  per tick would confirm it.
- The string keys used for reservations and path goals cause the GC spikes seen in
  `profile-village`'s max column.

## Save size

| Case | Size |
| --- | --- |
| 100 settlers, day 1 | 92 KB |
| 100 settlers, day 20, 181 explored chunks | 122 KB |
| 300 settlers, day 20 | 197 KB |
| Genuine fixtures | v2 18 KB, v4 27 KB, v12 22 KB |

Save size grows with population and modified chunks. Explored-only chunks cost a 128-byte
bitset each (base64 in JSON).

## World generation

`npx tsx scripts/bench-gen.ts` (generator 1): 1.6–2.5 ms per chunk in Node.

The same generators in GDScript (`godot/tools/bench_gen.gd`, same machine, 12 chunks each),
all bit-for-bit identical to the browser game:

| Version | gen 1 | gen 2 | gen 3 | gen 4 |
| --- | --- | --- | --- | --- |
| Straight port | 481 ms | 746 ms | 852 ms | 886 ms |
| Inlined hash | 104 ms | 161 ms | 193 ms | 200 ms |
| + per-chunk row/column/elevation cache | 84 ms | 88 ms | 72 ms | 76 ms |

GDScript generation is still about 30x slower than V8. It is the clearest measured cost of
the port, and it shapes the Godot world design: chunks are generated off the main thread
under a per-frame budget, never as a side effect of pathfinding or queries, and loading does not
regenerate all explored land at once (see `MIGRATION.md`).

## Pathfinding

The golden corpus (`godot/tests/golden/paths.json`) holds 80 recorded searches over real
generator-4 terrain (224×224 tiles), with rectangle and adjacent goals, node caps of 200, 4,000 and
20,000, and some partial paths. 51 of them find a path, and they expand 244,925 nodes in total.

| Solver | Exact match with the browser game | Speed |
| --- | --- | --- |
| Browser A* in Node (`scripts/bench-paths.ts`) | n/a | **2.0 µs per node** (490–540 ms for the corpus) |
| GridAStar: faithful GDScript port | all 80 searches, step for step | 57.7–62 µs per node (29x slower than Node) |
| DenseAStar: same algorithm on flat arrays | all 80 searches, step for step | 10.9–11.7 µs per node (5.5x slower than Node) |
| AStarGrid2D: Godot's native solver (single-tile targets) | same reachability; **equal path cost in 63 of 63** | **0.75 ms per search** vs 39.7 ms for DenseAStar (53x faster) |

`godot/tools/bench_path.gd` runs the last three. The browser game's per-tick budget is 6,000
nodes. In GDScript that would cost 65 ms (DenseAStar) to 350 ms (faithful port) per tick, so
GDScript A* cannot be the game's pathfinder.

AStarGrid2D costs, measured with a 512×512 region:

| What | Cost |
| --- | --- |
| Memory | 22.5 MB (about 90 bytes per tile) |
| `update()` | 21 ms; it also clears every solid tile, so the window is refilled afterwards |
| 1,024 tile updates | 0.18 ms |
| Unreachable target | 55.6 ms (explores everything reachable) |
| Reachable 300-tile route | 25 ms |

**Decision:** `NavWindow` wraps AStarGrid2D for local paths inside a bounded window around each
settlement. Rectangle and adjacent goals try the 4 nearest goal tiles. On the corpus it agrees
with the exact search on reachability in every case, and 49 of 52 paths have exactly the
optimal cost; the other 3 are within 5%.

Two things follow from the measurements:
- long routes need a coarse chunk-level graph;
- callers keep unreachable notes and budget searches by time.

GridAStar and DenseAStar stay in the code as the exact reference for tests.

## Commands

```bash
npx vitest run
npx tsx scripts/profile-village.ts 100
NODE_OPTIONS=--expose-gc npx tsx scripts/soak-village.ts 100 20
npx tsx scripts/bench-gen.ts
npx tsx scripts/bench-paths.ts
# Godot (from godot/):
godot --headless --path . -s res://tools/bench_gen.gd -- 12
godot --headless --path . -s res://tools/bench_path.gd
```
