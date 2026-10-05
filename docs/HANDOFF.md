# Little Valley migration handoff

Updated **2026-10-05 (evening), Asia/Manila**. Read this before continuing in Claude Code or Codex,
then verify `git status`, recent commits and the referenced code. Repository files are shared;
assistant conversations are separate. Keep only one assistant editing at a time.

## Decisions and authorization

- Work on `godot-migration`. Automatically commit verified checkpoints. **Never push**:
  pushing the deployment branch can deploy to Vercel. No deployment or cut-over is authorized here.
- Preserve the browser game. The Godot project is separated in `godot/`.
- Godot **4.7.2-stable**, standard edition, typed GDScript, Compatibility renderer. The editor
  and export templates already exist in Downloads; do not install additional software/services.
- Distribution is an installable web app for desktop/mobile, without store fees. Eventual
  same-origin cut-over must bring browser saves across. Current web exports are local previews.
- Saves stay on the device, with versioned history and downloadable/importable files.
  Do not silently discard unsupported state. Time does not advance while the game is closed.
- Keep top-down farming/settlement gameplay and authoritative simulation rules. Art is painterly
  storybook 2D (see `docs/reference/` and `docs/godot/ART_STYLE.md`), at least as rich as the
  pixel original; current generated SVG assets are **provisional**.
- Asset Studio is for players: upload/edit/assign art locally on their device, with no changes
  to other players' devices. No paid AI services for settler decisions.
- Long-play scalability remains a priority, not a completed claim. Existing code has a 5,000
  population safety limit; this is not evidence of supported performance or unlimited scale.

## Latest completed work

**Latest code checkpoints (2026-10-05 evening): the storybook art pass, wells and the save audit.**

The owner judged the earlier Godot look a downgrade from the pixel original. The references are
in `docs/reference/`: two screenshots of the browser game (the bar for density and charm) and a
painted landscape (the target finish). `docs/godot/ART_STYLE.md` now records this direction.

| Commit | Work |
| --- | --- |
| `d28c06e` | Storybook palette; painted ground shader (brush-stroke grass, sun/shade areas, clumps, flowers, faceted rock, water deepening from turquoise shallows, bank shadow, foam, cloud shadows; 3-tile chunk border so effects cross chunk edges); layered-cluster oaks, birches, pines, bushes, rocks; textured roofs (tile, thatch, slate, shingle), framed/plank/stone/brick walls, shuttered windows, plank doors, taller roofs; sites, soil, crops; walnut-and-gold plank UI; moonlit night |
| `d1c4748` | Wells water fields within reach (cistern 10 tiles), as in the browser. `SaveCodec.unsupported()` no longer reports kingdoms, a crown, diplomacy, war, merchants, claims, soldiers or implemented buildings; `UNSIMULATED_BUILDINGS` (empty) keeps the path for future types. Regression: a crowned realm at war with merchants, claims and soldiers round-trips with an empty report |
| `1e6a94f` | Art for the 15 building types that kept their scaffold sprite once built: Royal Hall, Council Hall, armory, camp, Grand Market, fence and stone wall (join across tiles), flowerbed, lamp (night glow), haystack, barrels, signpost, garden, statue, bench |
| `b2f902e` | Title over a living backdrop hamlet with a slow camera drift; two-tone logo, tagline and a compact left panel; `--title=1` capture |

Review captures: `godot --path godot --resolution 1600x900 -- --shot=<png> --ticks=600 [--zoom=0.5|1.6] [--animals=1] [--title=1]`
and `godot --headless --path godot -s res://tools/art_sheet.gd -- <png> "<filters>" <scale>`.

**Previous code checkpoint: `a37f6fe` — keyboard remapping and startup lifecycle fixes.**

- `src/ui/key_bindings.gd`: centralized physical-key controls, conflict checks, clear/reset,
  validation of saved layouts and preservation of valid swapped bindings.
- `src/ui/key_bindings_panel.gd`: Menu settings editor, device-local persistence. Escape stays
  reserved; standalone modifier keys are refused. Captured keys do not issue game orders.
- Game commands and camera panning read the bindings. Text focus and blocking menus prevent
  unintended keyboard commands. Existing Godot defaults are retained; browser shortcut parity
  is still incomplete. Selected toolbar tooltips reflect remapped keys.
- Menu scrolling and resizing keep the settings usable at 150% interface size.
- Fixed HUD sizing warnings: root sizing is owned explicitly instead of conflicting with
  stretched anchors.
- Fixed save-index parse errors when an unfinished/capture folder has no `index.json`.
  No player saves were removed or rewritten by this fix.
- Fixed title-screen shutdown leaks: WorldView owns its five drawing layers immediately,
  even if the player exits without starting a valley.
- Added regression checks and `tools/check_controls.gd`, which isolates settings/save lists
  from real player data and exercises the actual game scene.

Earlier checkpoints already present:

| Commit | Work |
| --- | --- |
| `e234cda` | PWA installation guidance, explicit guarded updates, font checks and local offline check |
| `83d12a7` | Device-local player Asset Studio |
| `c31f57d` | Soldier figures and marching companies |
| `68f9384` | Activity particles and building life |
| `53c6547` | Synthesized audio/music/ambience |
| `2a3d67d` | Introduction and Valley today |
| `d100cdd`, `33b87f2`, `76dd355` | Browser save migration, same-origin import and file transfer |
| `9d064dc`, `acf5eb0`, `262c349` | Realm UI and ported kingdoms, diplomacy, merchants, military and war |

Core world generation, local paths, construction/upgrades, farming/orchards, production,
gathering/hauling, people/families, areas, animals/hunting/herding, mining, roles and settlement
logistics are implemented with ported tests. See `docs/godot/MIGRATION.md` for their evidence;
implemented simulation systems do not mean the entire migration or presentation is finished.

## Fresh verification and engine findings

| Check | Result |
| --- | --- |
| Full Godot suite after all of the above, `build/art-tests2.log` | **235 passed, 0 failed, 491.9 s** (the two "Parse JSON failed" lines are the deliberate damaged-save tests, also present before) |
| Save, farming and migration tests after the audit | test_saves 9, test_sim_slice 22, test_migrations 6: all passed |
| Art/asset/view tests after the new building art | test_asset_studio 6, test_view_lifecycle 1, test_particles 2, test_glyphs 1: all passed |
| Controls, startup and checker after the title backdrop | `build/art-controls.log` 0 failures; `build/art-startup.log` clean; `build/art-checker.log` 0 scripts failed |
| Browser tests and type check | **337 passed**; type check clean |
| Web export after the art pass, `build/art-export.log` | Exported; `godot-web-pwa.ts`: online and offline boot, 9 cached files |
| Web benchmark, 100 settlers, `build/art-web-*.log` | Desktop avg 22.8 ms / p50 17.7 (baseline 21.5 / 16.9); phone emulation avg 86.6 ms, sim-bound (40 ms sim); art rasterising 6.3 s under 4× throttle |
| Full Godot suite, `build/codex-tests-controls.log` | **232 passed, 0 failed, 478.3 s** |
| New lifecycle regression, `build/codex-view-green.log` | **1 passed, 0 failed, 10 assertions**; created after the full run began, so checked separately |
| Rendered scene routing/capture/settings/150% scale, `build/codex-controls-clean.log` | **0 failures; no runtime errors/warnings** |
| Normal game startup/shutdown, `build/codex-engine-clean.log` | Engine banner only; exit 0 |
| Browser tests, `build/codex-browser-tests.log` | **337 passed** |
| Browser type check, `build/codex-typecheck-controls.log` | Passed |
| Latest path checks, `build/path-instance-fixture.log` | **6 passed, 0 failed, 43.7 s**; no golden changes |
| Latest headless controls, `build/checker-fix-controls2.log` | **0 failures**, clean shutdown |
| Latest normal startup, `build/checker-fix-startup.log` | Engine banner only, clean shutdown |
| Latest batch script loader, `build/checker-final.log` | **0 scripts failed**, no warnings/errors, exit 0 |
| Direct `--check-only`, `build/checker-fix-path-compile.log` | Clean compilation and exit |

The layout warning, missing-index parse error, title-screen orphan-node leak and batch checker's
**138-instance / 79-resource** shutdown diagnostic were reproduced before their fixes. The
checker diagnostic is now resolved by test-local fixture ownership, without filtering stderr
or changing load order. Full Godot/browser suite results above are from the previous checkpoint;
this test-only checkpoint reran the affected path checks and engine/scene checks. A clean
startup/shutdown is not a long-play leak test.

The web export was rebuilt and checked after the art pass (rows above). Earlier note:
`scripts/godot-web-pwa.ts` verified nine cached files and offline title startup at the normal
installed entry address after two online launches. Arbitrary benchmark query addresses were
not cached. Real install prompts, version replacement, multi-tab update safety and persistence
across an immediate web update still need testing. Rebuild the web export before testing controls.

## Unfinished work and risks

- Script-checker shutdown diagnostic: resolved in `b09a070`; keep the clean checker as a gate.
- Save audit: done in `d1c4748` (wells were the one genuine gap, now ported).
- Art: every asset is still generated and provisional, but now storybook-styled. Next art steps:
  painted title/marketing illustration, building-specific silhouettes for workshops (forge
  glow, mill sails turning), animated water edges and fireflies at night, and a final
  painted-asset pass (hand-made or licensed) through `godot/art/final/`.
- Fence and stone wall pieces join only horizontally (one sprite); the browser chooses
  connected pieces by neighbours. Add neighbour-aware variants.
- Browser-only shortcut actions/default-layout parity, real-device touch and phone measurements.
- New representative long-play Godot soak, with production/areas/realm systems, conservation,
  stale reservations, queue/chunk/object/memory growth and save round trips.
- Long-distance routing and bounded backing storage for modified chunks. Current eviction
  retains modified chunks in memory, so persistent growth is not fully bounded.
- Renew benchmarks at 25/100/300/1,000 with proportionate content. Earlier slice measurements
  are historical: roughly 300 settlers at 60+ average desktop FPS with hitches; 1,000 was not
  supported. Do not transfer that supported-scale claim to the expanded game without measuring.
- Final illustrated assets and building-level silhouettes, remaining animation details,
  licensed internet art-source research, audio comparison, UI/gameplay parity and release review.
- No final cut-over, deployment, real-device sign-off or complete migration claim.

## Exact next task

**Create the representative long-play Godot soak** before any further scalability promises.

1. A headless tool (`tools/soak.gd`) that runs a valley for many in-game days with production,
   areas, animals, realm and merchants active, saving and reloading every few days.
2. Check conservation of goods, stale reservations, queue/chunk/object/memory growth and
   that each save round-trips exactly; print a compact summary per checkpoint.
3. Then: cache the rasterised art atlas per version for phones (6.3 s under 4× throttle),
   neighbour-aware fence/wall pieces, and a real-device check of the web build (title
   backdrop, plank UI at 150%, touch).
4. Update this file and `docs/godot/MIGRATION.md`, commit; **do not push**.

## Commands and local state

From the repository root in PowerShell:

```powershell
$godotExe = 'C:/Users/Home/Downloads/Godot_v4.7.2-stable/Godot_v4.7.2-stable_win64_console.exe'
& $godotExe --headless --path godot --import --quit
& $godotExe --headless --path godot -s res://tools/run_tests.gd
& $godotExe --headless --path godot -s res://tools/check_controls.gd
& $godotExe --headless --path godot --quit-after 60
& $godotExe --headless --path godot -s res://tools/check_scripts.gd
npm test
npm run typecheck
```

Export instructions and template placeholders: `godot/README.md` and `scripts/godot-export.sh`.
Rendered control capture: `dist-godot/keyboard-menu.png` (ignored local artifact). Test logs in
`build/*.log` are ignored and local, not portable evidence; rerun the commands on another device.

The earlier unstaged scenery experiment (palette, shader, SVGs) was folded into `d28c06e`.
Verify any other new changes before editing.
This handoff is committed separately from the code checkpoint named above.
