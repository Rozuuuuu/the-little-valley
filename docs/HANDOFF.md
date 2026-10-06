# Little Valley migration handoff

Updated **2026-10-06, Asia/Manila**. Read this before continuing in Claude Code or Codex,
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

**Claude, 2026-10-06: monochromatic art style (owner's choice: warm sepia, world and interface).**
`src/presentation/shaders/monochrome.gdshader` on a CanvasLayer (layer 120) above the HUD maps
every screen pixel's brightness onto one sepia ramp (ink #1e140c, #4a3220, #8a6440, #c9a46e,
cream #f2e2bc), 16 steps so the pixel art stays crisp; bluish colours read deeper and warm ones
lighter so water stays apart from land. Every sprite, animation, effect and panel is converted
at once and new art follows automatically. Settings → Art style: Sepia (default) / Full colour
(`settings.art_style`, `game.apply_art_style()`). Colour-coded bars (health red/green) now differ
by brightness only.

**Claude, 2026-10-06, owner's round "guide, HUD, See more, mountains, zzz, camp growth"
(`eee0620`).** Full suite **241 passed**, controls 0. Executables and web export rebuilt.

- **Guide that plays along** (`Tutorial.GUIDE`, new valleys only; older valleys keep the browser's
  9 steps): each step is one line of story + one action + a target. `hud.guide_target` drives a
  bouncing arrow and pulsing brackets on the map (`world_overlay._draw_guide`: settler, nearest
  tree/rock, meadow while placing a field, camp) or a pulsing frame and arrow on the command-card
  button (`console._guide_match`: `command:<action>`, `label:<text>`, and in Build the category
  holding that building). Never pauses (`Tutorial.waiting` is always false now); Skip tutorial.
  The long origin-story window is no longer shown on a new valley. Capture `--guide=N`.
- **HUD in floating corners** (owner's choice): minimap bottom-left, selection card bottom-centre
  (width 380–660), commands bottom-right, each grass-framed, map visible and clickable between.
- **Character card** `console.character_card(s, big)`: portrait, name, job/side-job/training
  badges, task with icon, health/food/rest bars with icons and %, home/load/area chips.
- **See more is a window** (`hud.show_details`, owner's choice), sized to fit with no scrolling at
  1280×720: card, all details, and Main job / Side job / Work order columns side by side;
  buildings and groups: details + actions. `V` and the card button open it.
- **Mountains block by block** (ground shader `mountain_height`/`block_height`): stacked stone
  blocks one level per tile into the range (some tiles one higher), lit tops, coursed front faces,
  shaded sides, joints, snow on the top blocks.
- **Sleep animation**: Z's rise and fade in pairs over sleepers (`SettlerView`) and over homes with
  someone asleep (`WorldLife._Sleep`). Capture `--night=1` now lives into the night.
- **Camp growth order** (`src/sim/campaign.gd`), researched: medieval settlements grew hamlet →
  village → town ([Settlement hierarchy](https://en.wikipedia.org/wiki/Settlement_hierarchy),
  [Hamlet](https://en.wikipedia.org/wiki/Hamlet_(place))) and castles began as timber keeps on a
  motte before stone ([Motte-and-bailey castle](https://en.wikipedia.org/wiki/Motte-and-bailey_castle),
  [Keep](https://en.wikipedia.org/wiki/Keep)). So a founding camp grows:
  **Camp → Longhouse** (a home, 2 fields; beds 8, holds 400; drawn with the village-hall art)
  **→ Town Hall** (2 homes, storehouse, workshop, 3 fields, Hamlet milestone)
  **→ Keep** (Village milestone, a well, a mill or bakery, 4 homes)
  **→ Castle** (Town milestone, a forge or smelter, a barracks or archery range, a market or inn).
  Only centres with `extra.foundingCamp`; save validation allows the camp's third level.
  Test: `test_onboarding.test_new_campaign_grows_camp_longhouse_hall_keep_in_order`.

Next ideas: a dedicated Longhouse sprite (it reuses the village hall), guide steps beyond the
Longhouse (Town Hall, first trade), touch layout for the floating HUD on phones.

**Claude, 2026-10-06 (after Codex hit its limit): reconciled Codex's pending work and finished
the owner's two requests.** Executables rebuilt at `dist-godot/windows/` (game and Asset Studio)
and the web export; `check-web-errors.ts`: no problems. Full suite **241 passed**, controls 0.

| Commit | Work |
| --- | --- |
| `3ead19f` | Save and return to title shows a fresh random world (it showed the village just left); backdrop glides like a menu panorama, animals interpolated |
| `d907ad4` | Parity audit vs `src/ui` and `src/render` (text and command diff): Chief advice window (O, "?"), milestone celebration, tile grid (`), Ctrl+S, side job, work order, field crop, unassign worker, move civilians out. `world_life.gd`: night lights (`night.gdshader`), rain/snow, fireflies/pollen, ruler aura, corpses, merchants and carts in pixel art; water ripples. **Codex's pending work committed here**: founding camp (`NewGame.create_camp`, gated Town Hall), origin story, guided tutorial with Begin step / Skip, main+side job line, command symbols — its file did not compile (untyped loop vars), which broke the whole game including Settings |
| `ea4a6b1` | Mountains redrawn in the ground shader (jagged peaks, lit/shaded faces, snow, ledges, scree); building **detail pass** `scripts/pixel-art/detail.ts` (export only, 2× resolution, materials by palette) |
| `52e727d`, `90aefb8` | Icons that match (Hold shield, Train cap, See more eye, Survey glass, Rally horn, Advice ?), Advice on the card; grain sway, highlight brackets, other kingdoms' soldiers |

Honest limits: the detail pass adds texture but does not reach the hand-painted look of
`docs/reference/2d pixel.png`; that needs buildings redrawn at a higher art resolution (a real
art task). The Settings crash the owner saw could not be reproduced from the logs; the current
code opens Settings cleanly (build checked). Still missing: the phone rotate notice and the
in-game update banner (web only), placement ghost tinting beyond red/clear, sustainable soak.

**Codex checkpoint, 2026-10-06: bakery-stall investigation (separate from Claude's pending UI/visual work).**

- Read the app terminal and the saved Claude session `18a6d14e-d9b5-4da7-b420-8c1add4e4397`.
  Confirmed the owner's pixel-art decision, separate Asset Studio executable and local saves.
  The terminal showed Claude paused at its usage limit, with automatic continuation scheduled.
- Reproduced the baseline soak to day 60, seed 4242, save/load every 10 days: **0 integrity
  failures**, same bread totals as the prior run. At day 50, storage is **5,030 / 5,030**;
  the bakery still has 4 flour and 2 wood. Site 332, a storehouse, has 24 wood and only
  10 of its required 12 stone; stored stone is zero. The bakery plateau is a capacity/supply
  constraint in this scenario, not demonstrated broken crafting. No gameplay rules changed.
- `tools/soak.gd` now records production inventories, delivery promises, workers/reservations,
  total storage usage and pending construction at checkpoints. Workshop explanations are
  captured **before reload**, which deliberately clears derived status. Corrected the misleading
  scenario description: it has no woodlot, orchard or work areas.
- `tests/test_bakery.gd`: two recovery regressions, **21 assertions**, passed. They cover
  full storage and absent wood, recovery after save/load, resource conservation and reservations.
  Existing `test_sim_slice`: **22 passed**. Script checker: **0 scripts failed**.
  Final telemetry smoke: one day, **0 failures**, nonempty workshop explanations.
- Local evidence: `build/bakery-*.log`, `dist-godot/bakery-diagnostic.json` and
  `dist-godot/bakery-telemetry-smoke.json`. The 60-day diagnostic initially captured status after
  decode (empty); its inventories/capacity are valid. The final pre-decode status change was
  verified by the one-day smoke. No complete-suite or new rendering-performance claim.
- Claude's uncommitted work was left untouched: HUD/advice/celebration/work-order controls,
  realm evacuation, grid, pixel cart export, WorldLife, night shader and water animation.
  Do not commit these as part of the bakery checkpoint or rebuild the executables as though
  that pending work were verified. Existing Windows builds predate those changes.

**Latest checkpoints (2026-10-06, after the owner rated the result 4/10, "not like my web game"):
menu/HUD from `docs/reference` screenshots, save folder, fog, animation, 1:1 drawing.**

| Commit | Work |
| --- | --- |
| `091b43d` | Saves in `%APPDATA%\Little Valley` (`user_dir.gd`, copies from Godot's old folder once, never deletes). Title, pause menu, Your valleys (Play/Delete/Open the save folder; uploading is only for a downloaded copy), Settings and New valley as grass-and-dirt modals painted with the browser's `hudTextures.ts` (`hud_textures.gd`, hash verified identical). Trees, rocks and animals hidden on unexplored land. Asset Studio becomes its own program (preset "Asset Studio", `godot-export.sh studio`, `-- --studio-app`) |
| `3b48c4d`, `b3d91d9` | Pixel animation as the browser: trees lean one whole pixel (exported wind frames `_lean_l/_r`, kind `sway`, hidden from the studio), animals use all six frames (walk ×4, stand, graze), campfire flicker, fountain spray, rippling flags (`building_life.gd`). The smooth sway shader is gone |
| `1cfeb1a` | **No window stretch.** The game was laid out for 1280×720 and scaled ×1.37 at 1920×987: oversized HUD and fractional art pixels. Now 1:1 like the browser; the interface follows the display scale (`CameraRig.screen_scale()`); default zoom 0.75 = 3 px per art px. Title backdrop framed as the reference at any width. Edge scroll only while playing and after the mouse moved (on the web the unseen mouse at 0,0 panned the title off the map — that was why the web title showed no valley). "Install app" shell button. Harvest marks are the browser's axe/pick/basket icons |
| `0769fda`, `9972888` | Checklist boxes (`.req` rows, two columns in the console), short key hints ("." not "Period"), Settings keys inline (one scroll) |

| `7966ba3`, `6a79bb2` | Owner's next round: **graded fog** (`fog_view.gd` + `fog.gdshader`: clear near people/buildings, 30% veil over explored land nobody is near, unexplored 50% at the edge to black 7 tiles out; objects now drawn everywhere under it; ground shader fog off). **Random title world** each launch (seed + habitat, wild spot with water, no veil). **Zoom lock** fixed (`CameraRig.step_zoom`, `tests/test_camera.gd`). Edge scroll also with Valley today open and past the window side; scroll speed setting; edge cursor. **Placement preview** of the building sprite (`--place=type`). Next tick computed while the last is shown (`_run_ticks`; `save_now` settles the tick first). "+3 wood" when goods go into store |

Side-by-side captures used for this: `build/cmp*.png` (local) against `docs/reference/Screenshot*.png`.

**Previous checkpoints (2026-10-06): the 401 fix and interface parity with the browser game.**

| Commit | Work |
| --- | --- |
| `5ede054` | **401 errors:** on the Vercel per-deployment address (behind Vercel login) the browser fetched the web app manifest without the login cookie and got 401. `crossorigin="use-credentials"` on the manifest link in `index.html`; `scripts/godot-export.sh` patches Godot's link the same way. Local builds never showed it. New `scripts/check-web-errors.ts` (every HTTP error, failed request and console error of a built game in Chrome) and `scripts/tour-react.ts` (React screenshots for parity) |
| `fe1237b` | **Interface parity** with `src/ui`: bottom console (`console.gd`: minimap `minimap_view.gd`, info panel with portrait and bars, See more with building/job actions, 4×3 command card with the browser's commands, badges, tooltips, hotkeys), click-to-target Move/Attack/Gather, build menu by category with every buildable building (the old list missed realm buildings and decorations), three-box top bar, People/Families/Goals/Goods windows, F1 Controls, "A new world" dialog with land cards, health bars and idle bubbles, browser default keys |
| `f20ec3e` | Pixel art from the browser's own generators (see `docs/godot/ART_STYLE.md`) |
| `03ea750` | `tools/soak.gd`, 120 days: 0 failures, memory flat |

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
| Full Godot suite after the 1:1 change and checklists (2026-10-06) | **235 passed, 0 failed** (an earlier run had test_audio's noise band fail once under load; it passes alone and in later full runs) |
| Controls / checker | 0 failures; 0 scripts failed |
| Web export + `check-web-errors.ts` | No problems; the title shows its valley (it did not before: edge scroll) |
| Full Godot suite after the parity work, `build/parity-tests.log` | **235 passed, 0 failed**; then test_bindings, test_glyphs, test_view_lifecycle rerun after the last edits: passed |
| Controls, checker, startup after the parity work | 0 failures; 0 scripts failed; clean startup |
| Browser tests / type check | **337 passed**; clean |
| Web errors (`check-web-errors.ts`) | React `dist`: none. Godot web: only Chrome's normal "audio waits for a click" notice. PWA check: offline boot, 9 cached files |
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
- Pixel parity still to port from `src/render/Renderer.ts`: placement ghost tinting, grain
  crop sway (crops are now still), deposit marks from surveying, corpses toppling, and per-unit
  soldier headgear (none in the browser art).
- Both of the owner's saves are named "Home"; the list tells them apart only by date.
- Bakery plateau explained by full storage and a storehouse short two stone (see latest
  checkpoint). The baseline is not a sustainable-economy workload. No births: the player must
  start households. Add a separately named sustainable scenario rather than rewriting the
  baseline to conceal its limits.
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

**First reconcile Claude's pending parity/animation work; then add a sustainable soak scenario.**

0. Read the terminal again before editing: Claude was paused with automatic continuation.
   Audit the pending changes named above, run their controls/rendering/web checks, and have
   only one assistant edit those files. Preserve pixel art; the earlier smooth-art direction
   has been superseded by the owner's explicit decision in Claude's conversation.

1. Still missing from the browser UI (compare with `npx tsx scripts/tour-react.ts` screenshots):
   the phone "turn your device sideways" notice (`RotateNotice.tsx`), the in-game update banner
   (`UpdateBanner.tsx`), "Take the throne" for old worlds without a ruler (`Console.tsx`), the
   tile grid toggle (Backquote) and Ctrl+S save, the Assistant Chief advice panel styling
   (`Village.tsx` ChiefAdvice), the browser's settler card details layout in See more, and the
   Load-a-valley list of saves (`LoadModal`). Godot captures: `--window=...`, `--select=...`,
   `--build=...`, `--title=1 --newworld=1` (see `godot/README.md`).
2. Keep the seed-4242 baseline intact. Add a separate scenario with explicit player-equivalent
   stone supply, storage planning, and staffed renewable resource areas; assert production
   continues and resources remain conserved. Compare it with the diagnosed baseline. Do not
   grant free resources or silently change priorities in production game code.
3. Real-device checks: touch on the console, phone layout at 915×412, the 150% interface scale.
4. Rerun the suite, controls, checker, soak and `check-web-errors.ts`; update this file; commit;
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
