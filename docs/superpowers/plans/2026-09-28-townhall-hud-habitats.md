# Town Hall, command HUD, habitats and animals — implementation plan

**Branch:** `townhall-hud-animals` (from `mountains-and-mining`).
**Source:** the player's feedback of 2026-09-28 after the families-to-kingdoms work.

## What the player asked for (verbatim intent)

1. Travellers are welcomed with **food**, not apples.
2. Fix positions; details should collapse behind **"See more"** so the game stays clean.
3. Buildings always in **categories**, never one big "All" grid that blocks the game.
4. **More buildings**, more realistic.
5. **Mountains** that are actually visible.
6. Players **choose the terrain / habitat** of a new world; seeds stay as an option.
7. **Work areas** that are actually useful.
8. The first building is a **Town Hall** (holds many people and lots of goods); the **camp**
   becomes a stop for travellers and marching armies.
9. **Animals** — horses, rabbits, pigs, chickens and more — chosen per terrain/habitat.
10. A **Warcraft III–like HUD**, but distinct.
11. Details that fall **off screen** must fit.
12. **The king — the player — on the map** from the start; ask for the player's name on every new game.
13. **Building levels** with real benefits, upgraded Warcraft III style.
14. Works **offline**.
15. GUI positions generally.
16. (Bug) "Saving failed: … the database connection is closing" — fixed first.

## Rulings

- **R1 Upgrades are paid up front and run on a timer** (Warcraft III style): the building keeps
  working while it upgrades, cancelling refunds everything. No hauling pipeline for upgrades.
- **R2 Town Hall replaces the founding camp in new worlds.** Old worlds keep their camp; its
  inspector offers *Raise a Town Hall* which rebuilds it in place (4×3 footprint, same building id,
  so the settlement, routes and settlers stay attached) once the ground is clear.
- **R3 The Travellers' Camp** is a new buildable building (reusing the camp art): visitors and
  merchants lodge there, and a company that passes within 4 tiles rests and refills its food.
- **R4 Habitats are generator 4.** Generators 1–3 stay byte-identical (fingerprints for 1, 2 and
  now 3). Every generator-4 habitat puts a mountain range inside the first view.
- **R5 The king is a settler with `ruler: true`**: no job, cannot be enlisted, never fights,
  eats and sleeps like anyone. Passive *Royal presence*: adults within 8 tiles work 20% faster.
  Old saves get a *Take the throne* button that brings the ruler to the hall.
- **R6 Animals are cheap entities** (not settlers): wild herds per habitat with a population cap,
  wandering and fleeing; livestock lives inside pens and breeds up to the pen's capacity.
  Predators never attack people (the game stays cozy); hunters hunt them for food and hides.
- **R7 Offline:** fonts are bundled (no Google Fonts), and a service worker precaches the build.
- **R8 Save versions** bump once per phase that adds saved state; old saves always migrate.

## Phases (each ends green: tsc, vitest, build, fingerprints, screenshots where UI changed)

1. **Quick fixes** — food welcome; bundled fonts; service worker + manifest (offline).
2. **HUD** — top resource bar (key goods + "Goods" drawer, clock that always fits), bottom
   console: minimap · portrait & details with *See more* · command card (4×3 hotkeyed grid).
   Build menu = categories on the command card. Panels (People, Areas, Towns, Families, Realm,
   Goals) open as windows that fit above the console. Checked at 1366×768 and 1920×1080.
3. **New world** — ruler name (required), kingdom name, habitat cards, optional seed.
   Generator 4 habitats: Meadow Valley, Highlands, Deep Forest, Grassland Plains, Lakes & Marsh.
4. **Town Hall and levels** — generic `levels` on building definitions; Town Hall → Keep →
   Castle; house, storehouse, workshops, barracks, inn, watchtower levels; Travellers' Camp.
5. **The king** — ruler unit, portrait, aura, command card.
6. **Animals** — wild species per habitat, hunting (Hunter's Lodge), pens (coop, pigsty, sheep,
   goat, cattle, horse paddock) with products (eggs/milk → food, wool, hides, horses).
7. **More buildings** — well, fisher's hut, granary, tannery, weaver, watchtower, stone wall.
8. **Useful work areas** — auto-staffing to a wanted headcount, farm areas that lay out their own
   fields, woodlots that replant, hunting grounds, on-map labels.
9. **Docs** and a final report.

## Animal research (summary)

Wild (Europe-like temperate habitats): rabbits and hares in grass and field edges; roe/red deer,
wild boar, foxes, wolves and brown bears in forests; chamois/ibex (mountain goats), mountain
hares and bears in highlands; hares, wild horses and wisent (bison) on grassland; ducks,
beavers and moose in marshes. Livestock: chickens (eggs), pigs (meat, fattened in oak woods),
sheep (wool, meat), goats (milk, hill grazing), cattle (milk, meat, hides), horses.
