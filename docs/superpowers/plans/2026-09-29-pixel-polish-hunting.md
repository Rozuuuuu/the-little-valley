# Pixel polish, living HP and melee hunting — implementation plan

**Branch:** `pixel-polish-hunting` (from `master`). **Source:** the player's feedback of 2026-09-29.

## Asked for

1. Better 2D pixel graphics; an animation on every building; more assets.
2. An HP bar on every living thing.
3. Hunters fight in melee, by damage: bare hands first (must stand close), then knives
   (the next upgrade), then bows (archers). Attack animations.
4. Bigger "done / complete" pop-ups whose text fits its box.
5. A GUI that is easy to find and navigate; hotkeys for everything.
6. Warcraft III mouse sliding (edge scrolling) — researched.
7. A hit box: a box around every tile / thing under the pointer.
8. Better animal animation.
9. "See more" shown inside the HUD by default (floating stays an option).
10. HUD boxes in 2D pixel style: sand inside, grass outside.

## Research: Warcraft III camera

Warcraft III scrolls when the pointer touches any screen edge (corners scroll diagonally),
with a scroll-speed option; arrow keys scroll; the middle mouse button drags the view; the
minimap jumps. ([Blizzard forums](https://us.forums.blizzard.com/en/warcraft3/t/wasd-screen-scroll-control/15517),
[gamepressure hotkeys](https://www.gamepressure.com/warcraft-iii-reforged/controls-and-hotkeys/z4cf9b)).
Our version: edge scrolling on by default, working over the HUD too (the whole window is
the scroll zone), speed setting, faster the closer to the edge, arrow cursors, off when the
pointer leaves the window or a menu is open.

## Rulings

- **P1** Hunting weapons follow the Hunter's Lodge level: Hunting Camp (bare hands, reach
  1 tile) → Knife (reach 1.3, more damage) → Archery (bows, 5 tiles). Hunting grounds with no
  lodge hunt bare-handed.
- **P2** Animals have HP; hunters strike on a timer; a struck animal runs and the hunter
  chases. Boar, wolves, bears, moose and bison fight back. Settlers have HP too, regain it
  over time and at rest, and a hurt hunter breaks off and goes home — **nobody dies** (cozy).
- **P3** HP bars over every person and animal by default; L (or Settings) switches to
  "only the hurt".
- **P4** Building animation is renderer-only (smoke, flags, sparks, water, turning parts), so
  it never touches the simulation or saves.
- **P5** HP is saved (v13 adds `hp` to settlers and animals, both optional).

## Progress (2026-09-29)

Everything above is built and committed on `pixel-polish-hunting` (299 tests, save v13):
melee hunting with weapons by lodge level, health and healing, health bars, hit flashes,
damage numbers and arrows; four-frame animal walks and grazing; building life for every
kind of building that has something to show (smoke, sparks, work dust, splashes, butterflies,
birds, glints, waving flags); five decorations; settler shading; the sand-and-grass HUD skin;
See more in the HUD (setting for floating); bigger toasts; window-wide edge scrolling with a
speed setting; hover hit box and tile grid; hotkeys for windows, goods, today, see more,
survey, home, grid and health bars (all remappable).

**Checked in the built game (headless Chrome):** the skin at 1366×768 (top bar, console,
command card, tooltips, windows, new-world screen), See more inside the console, the grid and
hit box, health bars over settlers and animals, a hunter at work with damage numbers, and the
lodge and hall smoking. **Not seen in a screenshot:** an arrow in flight and a bear striking
back (both covered by tests of the simulation, not of the drawing). No human playtest.

### Rulings

- **P6** Paths, fences, walls and fields have no animation: nothing about them moves.
- **P7** Development builds (`vite build --mode development`) expose `window.__game` so the
  screenshot script can set up scenes; production builds do not.

### Follow-up (2026-09-29)

The player didn't like the sand boxes: the skin is now **dirt inside, grass outside** (light text
on soil, a grass frame with blades along the top), and **See more** docks on top of the bottom
panel over the selection column instead of growing the panel. Text contrast on dirt: 4.8:1 or
better everywhere.
