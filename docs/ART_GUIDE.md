# Art guide

Little Valley's look is original and generated in code. These rules keep new art
consistent.

## Grid and scale

- **Tile:** 16×16 art pixels. Chunks are 32×32 tiles (512×512 art pixels).
- **Screen scale:** whole-number device pixels per art pixel (2, 3, 4, 5, 6, 8).
  The default is about 3× CSS pixels. Never draw art at fractional scales. Zoom only
  eases between whole levels.
- **Positions** may be fractional: sprites are placed at rounded device pixels, so
  motion is smooth while the pixels themselves stay square.

## Perspective and depth

- Top-down with a slight three-quarter tilt: roofs and canopies rise above their
  footprint, and you see the front walls of buildings.
- Every object has an **anchor** at the bottom of its footprint. Draw order is sorted
  by that anchor's y, so a settler north of a tree is hidden by its canopy.
- Buildings are authored in footprint coordinates. `(0,0)` is the footprint's
  top-left corner, walls fill the footprint, and roofs extend upward.

## Light and outline

- **Light comes from the upper left.** Shade the lower right. `Painter.blob()` does
  this for foliage and rocks.
- **Outline:** a 1px `#2b2033` (plum-black) outline around every sprite, added
  automatically by `Painter.outline()`. Leave a 1px transparent margin. Crops use a
  softer green-black outline (`#2e3a24`) so fields stay calm.
- No anti-aliasing, gradients or sub-pixel detail inside sprites. Night lighting and
  fog are the only smooth gradients, and they sit above the art.

## Palette

Defined once in `src/render/palette.ts`. Groups of 3–5 tones, darkest first:

| Group | Use |
| --- | --- |
| grass, meadow, forest | ground greens: grass neutral, meadow brighter and fertile, forest shaded |
| sand, rock, dirt | banks, hillsides, paths |
| water, deep, foam | shallows, deep water, shore foam |
| soil, soilWet | tilled fields, dry and watered |
| wood 0–4 | trunks, planks, frames |
| stone 0–3 | rocks, foundations, chimneys |
| leaf 0–4, pine 0–3 | broadleaf and conifer canopies |
| roof, slate | house roofs (warm red), storehouse (slate blue); workshop uses wood shingles |
| wall, canvas | plaster walls, tents |
| fire, glass/glassLit | campfire and lamps, window glass by day and night |
| berry, flowers | small accents only |
| skin, hair, shirt, pants | settler variation (by index) |

Use accents sparingly. Most of the screen should be greens and earth tones, so
settlers (warm shirts) and interface markers stand out.

## Ground

- Terrain is painted per pixel, not from a tile atlas. Borders between terrains
  are dithered with 2×2 and 8×8 noise, and higher-priority terrain creeps up to
  about 5px into its neighbour. This hides the grid without blurring it.
- Colour patches vary over about 28px to break up repetition. Tufts, flowers,
  pebbles and mushrooms are placed per tile by hash, so they never repeat on a
  fixed pattern.
- Water has a 1px foam edge, a 2px shadow under banks, and moving ripple highlights.

## Characters

- Frames are 18×22, and the figure is 8px wide by about 16px tall.
- Directions are down, up and left. Right is mirrored from left.
- Poses: idle (2 frames), walk (4), carry-walk (4, arms up), work (2: raise and strike),
  sleep (1).
- Tools are separate 12×12 sprites drawn at the hand. Carried goods are the
  resource icon above the head.
- Faces are two dark eye pixels and blush pixels. Keep them simple and readable at 2×.

## Motion and ambience

Keep ambient motion subtle: tree canopies sway by at most 1px, grain sways when
ripe, water ripples drift, chimney smoke rises, the campfire flickers, and there are
fireflies at night and pollen by day. Nothing should compete with settlers for
attention.

## UI

- The UI uses dark moss panels (`#1f2b25`) with hard, stepped borders and offset
  shadows, matching the sprite outlines.
- Pixelify Sans is for headings and buttons. Atkinson Hyperlegible is for body text,
  **all numbers** and key labels. Pixel fonts blur 5/S and 8/B at small sizes.
- Accents: wheat `#e9c65a` for focus and highlights, leaf `#8ee07a` for progress,
  berry `#e0584a` for problems.
