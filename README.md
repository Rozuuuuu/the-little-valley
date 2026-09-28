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
3. Build a **House** or **Family Home** and plant an **Orchard**. New valleys grow
   deliberately: a visitor comes by early on and settles for **50 apples** and a free
   bed (welcome them in the **Families** tab). One traveller settles every two game
   days. Two adults can start a **household** and ask for a child once there is a free
   bed in a real home and 20 food in store; the baby arrives after two steady game
   days and grows up after twelve. Children eat and sleep but don't work.
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
   - **Mountains and ore:** new valleys have hills and mountains to the north and two
     small rocky outcrops near camp. Select an adult, press **Survey** and click rocky
     ground or a hill at a cliff's foot: they survey the 16×16 area for coal, copper,
     iron, silver, gold or diamonds. Build a **Mine** over a found deposit, a **Quarry**
     on rocky ground for endless stone, a **Charcoal Kiln**, a **Smelter** (ore + coal or
     charcoal → ingot) and a **Forge** (ingot + plank → tools; iron makes two).
     Right-click these with settlers to make them their workers. Deepen a mine's shaft
     from its inspector for bigger loads.
   - **Caravans and trade** (after Village): build a **Caravan Depot** where goods come
     from and right-click it with a settler to make them a teamster. In **Towns →
     Supply routes**, pick a store in each settlement, the goods and how much to keep
     there; carts follow roads and bridges over explored land (they can't cross an
     unbridged river). Build an **Inn** and merchants from distant towns come to
     barter: open the inn to trade.
   - **The crown** (Realm tab): at **Region** (two settlements of 4+ joined by a route,
     plus two of 10 forged metal tools, 3 trades or a Royal Hall) you can crown a ruler,
     name the kingdom and choose a banner. Crowning fixes your protected homeland. Sell
     goods to merchants for coins; taxes take a share of each trade but cost public
     trust. Appoint a Steward, Envoy and Marshal from your adults. **Claim land** mode
     shows each sector's owner and cost before you click.
   - **Village** needs 10 adults, 8 beds in real homes, and any **2** of:
     bake 30 food, run 2 staffed work areas, finish a stone bridge, lay 25 path tiles.
8. **Beds:** houses have 2, family homes 3, cottages 4, and the camp has 5 temporary
   bedrolls. A bed promised to an expected child or a traveller on the way is held
   and shown in the home's inspector. The Families tab shows bed use and exactly
   what a visitor or household is still waiting for. Valleys saved before this
   update keep automatic newcomer arrivals until you choose **Adopt deliberate
   growth** in the Families tab.

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
