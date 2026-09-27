# Little Valley

A cosy, top-down pixel-art farming and settlement game for the browser. Direct a
small band of settlers, farm, gather, build, and grow a camp into a village that
keeps expanding. There is no final screen and nothing to lose: shortages only slow
growth, and time stands still while the game is closed.

All art and sound are generated in code; the game loads no image or audio files.

## Running it

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # simulation, persistence and migration tests (Vitest)
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
```

Handy scripts:

- `npx tsx scripts/preview-map.ts <seed> <radius>` prints an ASCII map of a seed.
- `npx tsx scripts/terrain-stats.ts <seed>` shows the terrain mix.
- `npx tsx scripts/bench-gen.ts` / `scripts/bench-paint.ts` time world generation and ground painting.

## Controls

| Action | Default |
| --- | --- |
| Select settler / building | Left-click |
| Select a group (or fields, if no settlers are in the box) | Left-drag |
| Add to selection | Shift + click / drag |
| Contextual order (move, chop, mine, pick, farm, build, deliver, craft, move in) | Right-click |
| Pan | W A S D / arrow keys, middle-drag, optional screen-edge panning |
| Zoom | Mouse wheel, `=` / `-` |
| Pause / speeds 1×, 2×, 4× | Space, 1, 2, 3 |
| Build menu | B |
| Mark / unmark resources for harvest | H / U, then drag |
| Demolish or cancel selected building | Delete or X |
| Next idle settler / select everyone | `.` / E |
| Save | F5 or Ctrl+S |
| Cancel, deselect, then open the menu | Esc |
| Controls help | F1 |
| Draw a work area | Areas tab → + Farm area / Woodlot / Quarry / Building area, then drag |
| Plan a stone bridge | Build → Projects → Stone Bridge, then drag across the water from bank to bank |
| Valley today (issues and ideas) | **Today** button, top right |
| Jump to idle settlers, waiting buildings, sites, the bridge, home | Buttons under the minimap; click the minimap to move there |

Every keyboard action can be remapped in **Settings → Keys**. Bindings are stored
in `localStorage`.

## How to play

1. Select settlers and right-click trees, rocks and berry bushes. They gather, carry
   goods to storage and keep working nearby resources of the same kind.
2. Open **Build → Field** and drag across fertile meadow. Farmers (and laborers)
   till, plant, water and harvest on their own. Rain waters fields too.
3. Build a **House**. A free bed plus 20 food in storage attracts a newcomer.
4. Build a **Workshop** and make a settler a **Crafter** (right-click the workshop
   with them selected). Wood becomes planks, and planks and stone become tools.
5. Explore by ordering settlers into the fog. Bridges (unlocked at Hamlet) cross
   shallow water.
6. Milestones (Camp → Hamlet → Village → Town …) unlock new crops and buildings.
   The **Goals** tab shows what comes next.
7. After Hamlet, organise instead of micromanaging:
   - **Work areas** (Areas tab): draw a farm area over your fields, a woodlot or a
     quarry, then assign settlers. They work there first. Woodlots and quarries
     need no harvest marks.
   - **Work order** (settler inspector): reorder Build, Haul, Farm, Gather and
     Craft, or switch kinds off.
   - **Bread:** wheat → **mill** (3 wheat → 2 flour) → **bakery** (2 flour + 1 wood →
     5 food). Right-click a mill or bakery with a settler to make them its worker.
     A wheat field feeds more than any other crop, but only with the extra buildings
     and workers.
   - **Great river:** new valleys have a deep river east of the camp. Walk a settler
     to the bank to see the far side, then drag a **stone bridge** across it to reach
     fertile, stony riverlands.
   - **Village** needs 10 settlers, 8 beds in houses or cottages, and any **2** of:
     bake 30 food, run 2 staffed work areas, finish a stone bridge, lay 25 path tiles.
8. **Beds:** houses have 2, cottages 4, and the camp has 5 temporary bedrolls.
   Newcomers need a free bed and 20 stored food. The Settlers tab shows
   "Home beds x/y · camp bedrolls x/y" and exactly what is holding growth back.

Settlers say why they are idle: the Settlers tab lists each reason (marked ⚠), and
the inspector shows it when you select them. Buildings explain what they're waiting
for, and **Valley today** gathers the most important issues when you return.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): modules, the fixed-step loop, rendering and data flow.
- [Save format](docs/SAVE_FORMAT.md): versioning, migrations, backups and emergency saves.
- [Adding content](docs/ADDING_CONTENT.md): new crops, buildings, recipes and milestones.
- [Art guide](docs/ART_GUIDE.md): tile size, palette, outline and lighting rules.
- [Asset manifest](docs/ASSET_MANIFEST.md): every sprite and sound and where it is generated.
- [Milestones](docs/MILESTONES.md): what's playable, what was tested, known limits, what's next.
- [Playtest script](docs/PLAYTEST.md): a no-coaching session plan and feedback form (not yet run).

More scripts: `npx tsx scripts/profile-village.ts 100` profiles a 100-settler
village, and `npx tsx scripts/check-gen-fingerprint.ts` confirms generator 1 output is
unchanged.
