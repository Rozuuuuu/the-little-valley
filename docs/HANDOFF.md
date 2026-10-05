# Little Valley migration handoff

Updated **2026-10-05 (night), Asia/Manila**. Read this before continuing in Claude Code or Codex,
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
- Keep top-down farming/settlement gameplay and authoritative simulation rules. **Art is the
  browser game's own 2D pixel art** (owner's decision, 2026-10-05, after rejecting the smooth and
  storybook looks): exported from `src/render/sprites` by `scripts/pixel-art/export.ts`. See
  `docs/godot/ART_STYLE.md`. `docs/reference/2d pixel.png` is third-party (PixelLab) art: a style
  reference only, never copied, and deliberately not committed.
- Asset Studio is for players: upload/edit/assign art locally on their device, with no changes
  to other players' devices. No paid AI services for settler decisions.
- Long-play scalability remains a priority, not a completed claim. Existing code has a 5,000
  population safety limit; this is not evidence of supported performance or unlimited scale.

## Latest completed work

**Latest code checkpoints (2026-10-05 night): pixel art restored and the long-play soak.**

| Commit | Work |
| --- | --- |
| `f20ec3e` | The Godot version uses the browser game's pixel art: exporter (headless Chrome → 6× nearest PNGs, anchors, palette, chimney points); nearest filtering, pixel snapping and 0.25 zoom steps; GPU port of `terrainPainter.ts` for the ground; `PixelPeople` port of `characters.ts` for settlers; joined fences/walls, hall and mine levels, village hall, turning mill sails, lit-window overlays, rising construction ghosts; the browser's pixel HUD skin and Pixelify Sans |
| `03ea750` | `tools/soak.gd`: 120 days with production, animals, merchants and a crowned realm, careful-player autopilot, JSON save/reload every 10 days. 0 failures; memory flat; valley 9 → 16 settlers |

Earlier the same day (now superseded in look, kept in history): `d28c06e` storybook art pass,
`1e6a94f` art for 15 missing building types, `b2f902e` living title backdrop (kept, now pixel),
and `d1c4748` wells plus the corrected unsupported-save report (still current).

Review captures: `godot --path godot --resolution 1600x900 -- --shot=<png> --ticks=600 [--zoom=0.75|1.5] [--animals=1] [--title=1]`
and `godot --headless --path godot -s res://tools/art_sheet.gd -- <png> "<filters>" <scale>`.
Re-export art after changing any browser sprite: `npx tsx scripts/pixel-art/export.ts`.

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
| Full Godot suite after the pixel switch, `build/px-tests.log` | 234 passed, 1 failed (chimney points); fixed by exporting `BUILDING_LIFE` points, then test_particles, test_asset_studio, test_glyphs, test_view_lifecycle, test_saves all passed |
| Controls, startup, checker after the pixel switch | `build/px-controls.log` 0 failures; `build/px-startup.log` clean; `build/px-checker.log` 0 scripts failed |
| Browser tests and type check after the pixel switch | **337 passed**; type check clean |
| 120-day soak, `build/soak-120d.json` | **0 failures**; see `docs/godot/BASELINE.md` (Long-play soak and pixel art) |
| Web export and benchmark after the pixel switch | Desktop avg 24.2 ms / p50 19.3; phone emulation avg 100 ms (sim 49 ms); art load 0.40 s / 2.95 s; measured while the soak ran |
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
- Pixel parity still to port from `src/render/Renderer.ts`: campfire and fountain animation,
  the browser's sway (whole-pixel), placement ghost tinting, idle/advice marks, the bottom
  console layout and minimap styling, and per-unit soldier headgear (none in the browser art).
- Soak observations: the bakery stopped after day 50 and food then declined; no births (the
  player must start households). Investigate the bakery stall first.
- Browser-only shortcut actions/default-layout parity, real-device touch and phone measurements.
- Longer soaks (300+ days, several seeds, 100+ settlers) and war/caravans in the soak.
- Long-distance routing and bounded backing storage for modified chunks. Current eviction
  retains modified chunks in memory, so persistent growth is not fully bounded.
- Renew benchmarks at 25/100/300/1,000 with proportionate content. Earlier slice measurements
  are historical: roughly 300 settlers at 60+ average desktop FPS with hitches; 1,000 was not
  supported. Do not transfer that supported-scale claim to the expanded game without measuring.
- Remaining animation details, audio comparison, UI/gameplay parity and release review.
- No final cut-over, deployment, real-device sign-off or complete migration claim.

## Exact next task

**Find why the bakery stops after about 50 days in the soak, then finish pixel presentation parity.**

1. Run `godot --headless --path godot -s res://tools/soak.gd -- 60 5` and inspect the mill,
   bakery and granary around day 45–55 (flour, wheat, workers, idle reasons). Compare with the
   browser rules in `src/game/sim/production.ts`; fix only a real divergence, with a test.
2. Port the remaining browser renderer touches listed above (campfire/fountain animation,
   whole-pixel sway, marks), checking each against the browser side by side.
3. Rerun the full suite, controls, checker, the 120-day soak and the web benchmark (without the
   soak running at the same time). Update this file, `MIGRATION.md`, `BASELINE.md`; commit;
   **do not push**.

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

`docs/reference/2d pixel.png` is intentionally untracked (third-party art). Verify any other
new changes before editing.
This handoff is committed separately from the code checkpoint named above.
