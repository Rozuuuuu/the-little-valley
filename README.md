# Little Valley

A cosy, top-down pixel-art farming and settlement game for the browser. You are the
ruler, walking the map beside a small band of settlers: farm, gather, hunt, raise
livestock and grow a Town Hall into a Keep, a Castle and a kingdom. Choose the land you
settle — meadow valley, highlands, deep forest, grassland plains or lakes and marsh.
There is no final screen and nothing to lose: shortages only slow growth, and time
stands still while the game is closed. It plays offline once loaded.

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

The production build works offline: fonts are bundled and a service worker caches every
file on the first visit. `npx tsx scripts/ui-shot.ts <out> [w] [h] [steps]` screenshots the
built game in headless Chrome without starting a server.

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
| Smart order (move, chop, mine, pick, farm, build, deliver, craft, move in, hunt an animal) | Right-click |
| **Orders, like Warcraft III** (people selected) | **M** move, **S** stop, **H** hold position, **A** attack (hunt), **G** gather, **B** build, **C** return goods, **T** train a main job; then click the target (Shift keeps the order) |
| With a building selected | **U** upgrade, **P** pause, **X** demolish |
| Pan | Arrow keys, middle-drag, the screen edge (the letters are commands, as in Warcraft III) |
| Zoom | Mouse wheel, `=` / `-` |
| Pause / speeds 1×, 2×, 4× | Space, 1, 2, 3 |
| Build menu (categories on the command card) | B, then Q W E R / A S D F / Z X C V for a category and a building; Esc goes back |
| Find yourself, the ruler / Rally (ruler selected) | K / R |
| Train a main job at the Town Hall (people selected) | T, then Q W E R / A S D F / Z X C for the role |
| Hear the Assistant Chief's advice (or find them) | O, or click the gold “?” over them |
| Windows: People, Areas, Towns, Families, Realm, Goals | F2, F3, F4, F6, F7, F8 |
| All goods / Valley today / See more about the selection | I / F9 / V |
| Full screen | F (or the Full screen button on the title screen and in the menu) |
| Survey / jump to the Town Hall | Y / Backspace |
| Tile grid / health bars (everyone or only the hurt) | ` / L |
| Scroll the map | Touch any edge of the screen with the mouse (Warcraft-style; speed in Settings), arrows, middle-drag. While playing, the mouse is held inside the game; pause (Space or Esc) to let it go |
| Mark / unmark resources for harvest (nobody selected) | G / U, then drag |
| Demolish or cancel selected building | Delete or X |
| Next idle settler / select everyone | `.` / E |
| Save | F5 or Ctrl+S |
| Cancel, deselect, then open the menu | Esc |
| Controls help | F1 |
| Draw a work area | **Areas** window → + Farm area / Woodlot / Quarry / Forage / Hunting ground / Building area, then drag |
| Plan a stone bridge | Build → Projects → Stone Bridge, then drag across the water from bank to bank |
| Valley today (issues and ideas) | **Today** button, top right |
| Jump to idle settlers, waiting buildings, sites | Command card buttons; click the minimap to move there |
| Upgrade a building | Select it → **Upgrade** on the command card (hover to see what it adds) |
| Everything about the selection | **See more** in the bottom panel |

Every keyboard action can be remapped in **Settings → Keys**. Bindings are stored
in `localStorage`.

## How to play

1. Select settlers and right-click trees, rocks and berry bushes. They gather, carry
   goods to storage and keep working nearby resources of the same kind.
2. Open **Build → Field** and drag across fertile meadow. Farmers (and laborers)
   till, plant, water and harvest on their own. Rain waters fields too.
3. Build a **House** or **Family Home** and lay out **Fields**. New valleys grow
   deliberately: a visitor comes by early on and settles for **40 food** (keeping 20 in
   store) and a free bed — the Town Hall's bunks will do (welcome them in the **Families**
   window). One traveller settles every two game
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
   - **Diplomacy** (Realm → Diplomacy/News/War council): with an Envoy, propose trade,
     passage, non-aggression or alliance treaties; neighbours answer when the letter
     arrives, with their reasons. News arrives as rumours (merchants), sightings
     (borders, allies) or confirmations (your envoy) and says who told you and how old
     it is. Worried neighbours send warnings you can answer. The war council drafts
     private plans and negotiates allied support.
   - **Army** (Realm → Army): forge swords and armour, make bows, buy horses into a
     stable. Select adults, open a Barracks or Archery Range and enlist them. Trained
     companies march where you click, carrying food for the days you choose; hungry
     companies lose readiness and come home. Stand a company down to send everyone back
     to their old work. **Civilization** needs a crown, supply lines and two of 20
     equipment, a trade treaty or a council hall — never a war.
   - **War** (Realm → War), only after Civilization and opening the frontier: the
     declaration preview says what it would break and who might join them. Companies
     defend where you send them, break off when their morale fails, and never fight in
     or from a protected homeland. Holding their frontier land occupies it; a peace
     treaty can make it yours. Captives come home at peace.
   - **Village** needs 10 adults, 8 beds in real homes, and any **2** of:
     bake 30 food, run 2 staffed work areas, finish a stone bridge, lay 25 path tiles.
8. **Beds:** houses have 2, family homes 3, cottages 4 (each gains beds when upgraded),
   and the Town Hall has 10 bunks (14 as a Keep, 20 as a Castle; older worlds' camps have
   5 bedrolls until raised into a Town Hall). A bed promised to an expected child or a traveller on the way is held
   and shown in the home's inspector. The Families tab shows bed use and exactly
   what a visitor or household is still waiting for. Valleys saved before this
   update keep automatic newcomer arrivals until you choose **Adopt deliberate
   growth** in the Families tab.

## What's new in the Warcraft commands update

- **Install it as an app.** On the title screen, **Install app** (when the browser offers it)
  adds Little Valley as an app that opens full screen, so the screen's edges are the map's
  edges. There's also a **Full screen** button (and the F key).
- **The mouse stays in the game** while you play, like Warcraft III: it can't slip off the
  top or bottom of the window, so edge scrolling works on all four sides. Pause (Space), press
  Esc or open a menu and the mouse is free again. You can turn this off in Settings.
- **Warcraft III commands.** With people selected the command card is a unit card: **M**ove,
  **S**top, **H**old position, **A**ttack (click a wild animal to hunt it, bare-handed unless
  they work at a lodge), **G**ather, **B**uild, **C** return goods, **T**rain. Right-clicking an
  animal hunts it. A building's card has **U**pgrade, **P**ause and **X** demolish. The card's
  keys follow what is selected, as in Warcraft. The camera moves with the arrow keys and the
  screen edge. Older key settings are moved to this layout once.
- **Main job and side job.** Pick both on the person's card (See more). A new main job is
  learned at the Town Hall; the **side job** changes at once, and they do it whenever the main
  job has nothing to do. A traveller with nowhere left to explore works at their side job.
- **See more sits inside the bottom panel**, in the free space beside the selection, and
  starts open.
- **Every screen is pixel art:** pixel font everywhere, pixel drop-downs, sliders, check boxes
  and scroll bars. Boxes are edged with grass on all four sides (no dark border lines), and the
  HUD dirt is a warm speckled loam that stands apart from the map's soil.

## What's new in the roles update

- **Everyone has a role**, and you change it by training at the **Town Hall**. Select
  people and press **Train** (J): they walk to the hall and study for about half a minute.
  The Town Hall teaches labourers, farmers, gatherers, builders and haulers with 2 places at
  a time. The **Keep** adds crafters, hunters, herders, **travellers** and **messengers** (3
  places), and the **Castle** adds the **Assistant Chief** (4 places, one chief).
- **Travellers** roam past the edge of the known land and lift the fog, coming home to eat
  and sleep.
- **Messengers**: while you have one, letters and news reach you twice as fast. In between,
  they run errands (hauling).
- **The Assistant Chief** walks among your people and puts idle hands to work at a
  workshop, lodge or pen that has nobody. Every so often they walk up to you. When they are
  close, a gold **?** pops up over them; click it (or press O) to hear their advice about
  food, storage, beds, idle people, roles to train, or what the next milestone still needs.
- **Animal deaths** are animated: the animal flashes, rolls onto its back in a puff of
  dust, and fades away.
- Idle people now show a “…” bubble, so the “?” belongs to the chief alone.

## What's new in the pixel polish update

- **Hunting by damage:** animals have health. Hunters fight bare-handed beside their quarry,
  then with knives, then with bows from five tiles as the Hunter's Lodge is upgraded. Struck
  prey bolts and the hunter gives chase; boar, wolves, bears, moose and bison strike back, and
  a hurt hunter breaks off to heal. Nobody dies.
- **Health bars** over every person and animal (L: only the hurt), red hit flashes, floating
  damage numbers and flying arrows.
- **A pixel HUD:** every box is a slice of ground: Minecraft-style pixel dirt inside, short-to-medium
  grass blades along the top with turf hanging into the soil, grassy sides (painted from the game's
  own palette in `src/ui/hudTextures.ts`). **See more** (V) opens docked on top
  of the bottom panel without changing its size (or as a floating window, in Settings). Pop-ups are bigger and their text fits.
- **Edge scrolling** like Warcraft III over the whole window, a hover **hit box** around the
  tile or building under the pointer, an optional tile grid (G), and hotkeys for everything.
- **Livelier world:** animals walk on four frames and graze; buildings smoke, spark, raise
  dust, fly flags, and draw butterflies and birds. New decorations: haystack, barrels,
  signpost, flower garden and a statue.

## What's new in the Town Hall update

- **You on the map.** Every new world asks for your name; your crowned ruler walks the map
  from the start. People within 8 tiles work 20% faster, and once a day **Rally** (R) makes
  everyone nearby work 30% faster for an hour. The ruler never does chores, enlists or
  fights. Older worlds can **take the throne** from the bottom panel.
- **Town Hall first.** The first building is a Town Hall (10 bunks, 600 goods), upgradable
  to a **Keep** (at Hamlet) and a **Castle** (at Village; its whole town works 10% faster).
  Older worlds' camps upgrade into a Town Hall in place.
- **Building levels.** Homes, storehouses, workshops, mills, bakeries, kilns, smelters,
  forges, quarries, pens, the inn, depot, barracks, range, stable, lodge, well, granary and
  watchtower have upgrades, paid up front and finished on a timer while the building keeps
  working. Cancelling returns everything.
- **Travellers' Camp.** A stop by the road: visitors come more often, and your companies on
  the march rest and restock there once a day.
- **Habitats and mountains.** Pick the land for a new world (the seed is still there for the
  details). Every new world has a mountain range and a peak in view from the start.
- **Animals.** Rabbits, hares, deer, boar, foxes, wolves, bears, mountain goats, bison,
  wild horses, ducks, beavers and moose live where they belong. A **Hunter's Lodge** or a
  **hunting ground** brings in meat and hides; **pens** keep chickens (eggs), pigs, sheep
  (wool), goats and cows (milk) and horses (for the stable), breeding up to their size.
- **More buildings:** fisher's hut, well (fields nearby never need watering), granary,
  tannery (hides → leather), weaver (wool → cloth), watchtower, stone walls.
- **Useful work areas.** Areas staff themselves to the number of workers you want, farm
  areas lay out their own fields, woodlots replant as they cut, and there are forage areas
  and hunting grounds.
- **A command HUD.** Stores along the top (Goods for the rest), windows and the clock; at
  the bottom the minimap, the selection with **See more**, and a Warcraft-style command
  card with build categories.
- **Offline.** Fonts ship with the game and the production build caches itself.

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
- [Kingdom playtest](docs/KINGDOM_PLAYTEST.md): sessions for families, mining, trade, diplomacy and war (not yet run).
- [Implementation plan](docs/superpowers/plans/2026-09-28-families-to-kingdoms.md): the families-to-kingdoms roadmap and what was built.

More scripts: `npx tsx scripts/profile-kingdom.ts` profiles 100 people in two towns,
four rival kingdoms and 64 soldiers in the field; `npx tsx scripts/render-preview.ts`
renders art to PNG without a browser. `npx tsx scripts/profile-village.ts 100` profiles a 100-settler
village, and `npx tsx scripts/check-gen-fingerprint.ts` confirms generator 1 output is
unchanged.
