# Little Valley migration handoff

Updated **2026-10-05, Asia/Manila**. Read this before continuing in Claude Code or Codex,
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
- Keep top-down farming/settlement gameplay and authoritative simulation rules. Art is smooth,
  illustrated, colored, limited-palette; current SVG assets are **provisional**.
- Asset Studio is for players: upload/edit/assign art locally on their device, with no changes
  to other players' devices. No paid AI services for settler decisions.
- Long-play scalability remains a priority, not a completed claim. Existing code has a 5,000
  population safety limit; this is not evidence of supported performance or unlimited scale.

## Latest completed work

**Latest code checkpoint: `b09a070` — script-checker shutdown diagnostic resolved.**

- Isolated the retained graph to source-first loading followed by the particles/path tests.
  Separate script groups and reversed loading order exited cleanly; explicit script retention
  and deferred shutdown did not help.
- Changed the path tests' grid/data fixtures from static variables to test-instance ownership.
  The unchanged checker now compiles every script and exits with **no warnings or errors**.
- Corrected `check_controls.gd` to compare menu size against the logical viewport used by the
  HUD, rather than the OS window size, which differs in headless mode.
- Six matching path tests passed, including all 80 golden searches. Direct script compilation,
  the final batch checker, normal startup/shutdown and scene controls all exit cleanly.

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

The last checked web export is the installation checkpoint, **before these controls changes**.
`scripts/godot-web-pwa.ts` verified nine cached files and offline title startup at the normal
installed entry address after two online launches. Arbitrary benchmark query addresses were
not cached. Real install prompts, version replacement, multi-tab update safety and persistence
across an immediate web update still need testing. Rebuild the web export before testing controls.

## Unfinished work and risks

- Script-checker shutdown diagnostic: resolved in `b09a070`; keep the clean checker as a gate.
- Audit `SaveCodec.unsupported()`: it still reports kingdoms, soldiers, merchants and some
  building types as unsupported despite later ports. Inspect actual decode/update ownership,
  then remove only false reports; preserve reporting and data for genuinely unsupported state.
- Bring stale matrix comments up to date (for example soldier figures are now drawn).
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

**Audit and correct the stale unsupported-save report in `godot/src/persistence/save_codec.gd`.**

1. Inspect `unsupported()` around line 634, decode/encode ownership and the running realm,
   merchant and military modules. It still flags known kingdoms, crowned kingdoms, diplomatic
   records, soldiers and some implemented buildings as unsupported.
2. Inspect `tests/test_saves.gd`, the real browser v15 fixture and realm/save round-trip tests.
   Add regressions distinguishing implemented state from genuinely unsupported content.
3. Remove only demonstrably false reports. Preserve unknown authoritative data and useful
   compatibility messages; do not replace the report with an unconditional empty result.
4. Run affected save/realm tests and the batch script checker. Update this file and the
   migration matrix, then commit; **do not push**.
5. Rebuild and verify web controls next, then create the representative long-play soak before
   making further scalability promises.

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

An existing unstaged change remains in **`godot/art/palette.json`**: indentation only;
`git diff --ignore-all-space` shows no semantic difference. It predates this checkpoint and
was deliberately not included or reverted. Verify any other new changes before editing.
This handoff is committed separately from the code checkpoint named above.
