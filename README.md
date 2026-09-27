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

Settlers show why they are idle: hover the settler list or select them. Buildings
explain what they are waiting for.

## Documentation

- [Architecture](docs/ARCHITECTURE.md): modules, the fixed-step loop, rendering and data flow.
- [Save format](docs/SAVE_FORMAT.md): versioning, migrations, backups and emergency saves.
- [Adding content](docs/ADDING_CONTENT.md): new crops, buildings, recipes and milestones.
- [Art guide](docs/ART_GUIDE.md): tile size, palette, outline and lighting rules.
- [Asset manifest](docs/ASSET_MANIFEST.md): every sprite and sound and where it is generated.
- [Milestones](docs/MILESTONES.md): what's playable, what was tested, known limits, what's next.
