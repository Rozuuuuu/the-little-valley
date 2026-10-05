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

## Simulation in GDScript (the slice)

`godot/tools/bench_sim.gd N ticks` runs the browser profiler's village where the slice allows:
generator 3, seed 777001, 16 cottages, 3 storehouses, about 120 fields, construction sites, and
a 61×61 marked area. Not included yet: the mill, bakery, workshop and the four work areas.
Daytime ticks, in ms:

| Settlers | avg | p50 | p95 | p99 | max | Node (browser game) p50 / p95 |
| --- | --- | --- | --- | --- | --- | --- |
| 25 | 1.8 | 1.2 | 5.7 | 6.8 | 13.9 | 0.10 / 0.85 |
| 100 | 4.1 | 3.7 | 7.7 | 9.8 | 15.8 | 0.36 / 1.56 |
| 300 | 9.0 | 8.5 | 13.8 | 16.4 | 23.2 | 0.96 / 2.24 |
| 1,000 (600 ticks) | 27.3 | 26.4 | 37.7 | 51.1 | 57.4 | not measured |

At 300, nights spike to p95 35 ms and max 51 ms. That is the bedtime rush of 226 homeless
settlers looking for spots by the hall, an artefact of the scenario (too few beds).

How we got there, at 100 settlers:

| Change | avg | p95 |
| --- | --- | --- |
| Straight port | 48.5 | 92 |
| Cached content lookups and season; lists of sites, fields and stores | 10.6 | 24 |
| Harvest marks in a spatial index | 7.5 | 15 |
| Harvestable objects in a resource index, searched within the gather radius | 4.0 | 7.7 |

Section profiles come from `PROF=1` (see `Prof`). The biggest single cost was gatherers
scanning a 37×37 square tile by tile: 3.1 ms per decision.

**Supported scale, from this evidence (reference machine, desktop, 1× speed):**
- **Up to about 300 settlers**, a tick fits inside one 60 FPS frame on average (p99 16 ms).
- **1,000 settlers do not:** about 27 ms per tick means a dropped frame on every tick.

Next step (Phase 3): run the simulation on its own thread. It has no nodes, so this is safe,
and frames would then never wait for a tick. Where threads are unavailable, ticks are
time-sliced. Pathfinding is not the bottleneck: 1.3–4.6 native searches per tick at about
0.15 ms each.

## Frames (the illustrated Godot version)

Capture-mode benchmark: `godot --path . --resolution 1600x900 -- --shot=out.png --settlers=N --frames=900`.
It runs a new valley with extra settlers, fields, a house, a storehouse and marks, plays at 1×
with vsync off while the camera pans continuously, and prints frame percentiles. Reference
machine (Xeon E5-2680 v3, RX 580), Compatibility renderer, Godot 4.7.2, ticks run in slices
across frames:

| Settlers | avg ms | FPS | p50 | p95 | p99 | max | Draw calls | Sim ms/frame | View ms/frame | Render CPU / GPU ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 25 | 7.6 | 132 | 7.4 | 12.9 | 17.7 | 27.8 | 343 | 0.17 | 1.13 | 1.3 / 3.0 |
| 100 | 8.5 | 117 | 8.0 | 17.0 | 22.0 | 46.7 | 483 | 0.62 | 2.15 | 1.7 / 3.3 |
| 300 | 13.5 | 74 | 11.9 | 26.3 | 39.6 | 49.4 | 922 | 2.84 | 4.25 | 2.5 / 4.6 |
| 1,000 | 49.9 | 20 | 22.4 | 189 | 344 | 717 | 1,134 | 37.1 | 7.09 | 2.7 / 5.3 |

What changed the numbers:
- Turning off per-sprite clipping on atlas textures cut draw calls by about a third.
- Building at most two chunks' sprites per frame, nearest first, removed most panning hitches.
- Off-screen settlers skip their per-frame update.
- The HUD updates text in place instead of rebuilding widgets.
- **Ticks run in slices across the frames each tick lasts** (`Simulation.begin_tick`,
  `update_settlers`, `end_tick`). A test proves the results are identical to whole ticks.
  At 300 settlers this took p95 from 41 to 26 ms and p99 from 59 to 40 ms.

**Supported scale today (desktop reference machine): up to about 300 settlers at 60+ FPS
average.** Hitches above 16 ms remain in about 5% of frames at 300.
- **1,000 settlers are not supported yet:** the simulation needs about 37 ms per frame.
- **Next steps:** move the simulation to a worker thread where threads are available, and
  index the remaining linear scans (haul needs, storage search) where profiles show them.
- The ground shader is not the bottleneck: hiding it changed the frame time by less than
  the run-to-run noise.

## Web build (the installable version)

Exported with the standard Godot 4.7.2 editor and the official templates: single-threaded
(`web_nothreads`, no special server headers needed), PWA enabled, landscape.

| File | Size (uncompressed) |
| --- | --- |
| `index.wasm` (the engine) | 39.5 MB |
| `index.pck` (the game) | 0.9 MB |

Servers compress the engine to roughly a quarter (an estimate; measure on the real host), and the
service worker caches it after the first visit.

`npx tsx scripts/godot-web-bench.ts N frames desktop|phone` runs the build in headless Chrome on
this machine. **Headless Chrome has no real display, so frame times are indicative only;** for
example 25 settlers measured slower than 100 in two runs.

| Run | Startup to first code | Art | New valley | avg ms | p50 | p95 | p99 | Sim / view ms per frame |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Desktop, 100 settlers | ≈6.5 s | 0.45 s | 1.9 s | 21.5 | 16.9 | 36.8 | 48.2 | 2.8 / 1.7 |
| Phone emulation (4× CPU throttle, 915×412), 25 settlers | | | | 58.1 | 42.3 | 144 | 230 | 18.4 / 12.6 |
| Phone emulation, 100 settlers, before the fixes below | | | 139 s total | 177.7 | 132 | 514 | 897 | 101 / 42 |

Findings:
- **GDScript in WebAssembly runs about 3–5x slower than native GDScript** (simulation at 100
  settlers: 2.8 ms per frame on the web against 0.62 natively). One world chunk takes about
  0.7 s to generate on the web.
- **Fixed after measuring:**
  - a tick-catch-up spiral: the simulation now has a hard per-frame budget, and a slow device
    runs game time slower (the clock says so) instead of freezing;
  - chunk generation now runs a few rows at a time across frames (`WorldGen.ChunkJob`), so
    exploring never stalls a frame for a whole chunk;
  - a new valley generates 16 chunks up front instead of 36.
- **Not yet measured: a real phone.** The 4× throttle stands in for a low-end phone, and recent
  phones are likely faster. Run `npx tsx scripts/serve-godot-web.ts` and open the printed address
  on a phone on the same Wi-Fi to measure one.
- **Next for phones:**
  - a lower render resolution option;
  - refreshing distant settlers less often;
  - the threaded web build (needs cross-origin isolation headers on Vercel) to move world
    generation off the main thread.

## Saves

- Godot saves use the browser game's v15 JSON layout. A genuine v15 browser save
  (`tests/fixtures/v15-save.json`) imports with every settler, building, stock count and explored
  tile intact. The 18 wild animals and the ruler are reported as not in this version yet,
  never silently dropped.
- **Godot's JSON reader rounds 17-digit numbers inexactly** (measured: a hunger value of
  57.3333333333274 came back a few units off in the last place). Reloads therefore match to
  about 1e-13, not bit for bit. Gameplay cannot notice this. A binary format for Godot's own
  saves would make them exact; that is planned with the save history UI.
- In the store test each save took about 2 s, which is far too slow. Most of it is the
  read-back check regenerating 36 chunks. The check will validate without rebuilding the world
  (planned; measured again then).

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
godot --headless --path . -s res://tools/bench_sim.gd -- 100 2880        # PROF=1 for sections
```
## Web installation checkpoint (2026-10-05)

Godot 4.7.2 standard Windows release export: local Chrome starts the engine online, loads
the cached installed entry offline, and captures/clears a synthetic install event.
`npx tsx scripts/godot-web-pwa.ts` reports nine cached files. Two online launches are needed
in this check: the initial website visit registers the worker and the next launch caches
the large engine/game files. Offline benchmark query URLs fail; the installed `index.html`
entry works. This is an offline title-screen startup check, not a real device installation
or a service-worker version replacement test.

The full headless suite passed **228 tests, zero failures in 477.1 seconds**. A regression
test first reproduced updates proceeding after a failed save; it now checks refusal on
failure and permission on success. Font coverage scans the source/content string literals
against both bundled fonts. The script-load check reports zero failed scripts, but also
reports ObjectDB/resources retained at checker exit; it is not a gameplay leak measurement.
The browser TypeScript check passed. Web update durability and multi-tab update coordination
remain unverified: players are instructed to save/close other tabs before an update.

## Controls and engine recheck (2026-10-05)

The full headless suite passed **232 tests, zero failures in 478.3 seconds**; an additional
drawing-layer lifecycle regression passed separately (10 checks). The browser suite passed
**337 tests** and its TypeScript check passed. `tools/check_controls.gd` exercised actual
scene routing, focus protection, capture/conflicts, device persistence and a 150% interface
size with zero failures; the rendered run logged no errors or warnings.

Three issues were reproduced and corrected: conflicting HUD root anchors/manual sizing,
attempting to parse a nonexistent save index in an unfinished/capture folder, and five
unowned drawing-layer nodes leaked when exiting before starting a valley. Normal startup
and shutdown (`--headless --quit-after 60`) now log only the engine banner.

The batch script checker reports **zero failed scripts**, but still logs **138 ObjectDB
instances / 79 resources retained at checker exit**. Deferring shutdown did not change
that result and was reverted. This diagnostic remains unresolved; the clean normal-game
exit does not establish that long-play memory behavior is clean. No new long-play soak or
supported-population result was produced in this checkpoint.

## Script-checker ownership fix (2026-10-05)

The retained-resource diagnostic above is now resolved. Source, tool and test groups each
loaded cleanly in isolation. Source-first loading followed by the particles and path tests
reproduced the 138-instance / 79-resource warning; reversing the group order avoided it.
Holding loaded scripts explicitly and deferring shutdown did not fix it.

Removing the two static fixture variables in `tests/test_path.gd` gives the test instance
ownership of its grid/world and golden data. The unchanged batch checker now reports zero
failed scripts and exits without warnings or errors. No stderr filtering or load-order
workaround was added. Godot's direct `--check-only` on that test also exits cleanly.

The focused path run passed six matching tests in 43.7 seconds, including all 80 golden
searches, dense-grid parity, navigation validity and changing obstacles. Normal headless
startup/shutdown and the scene controls check also exited cleanly. The controls check now
compares UI size with the logical viewport, matching HUD sizing; comparing with the OS window
size incorrectly failed in headless mode. The full gameplay suite was not repeated for these
test-only changes; its previous 232-test result remains historical. This fix establishes
clean diagnostic shutdown, not long-play memory behavior.
