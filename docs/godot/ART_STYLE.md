# Art style: Little Valley pixel art in Godot

**Decision (2026-10-05):** the Godot version uses the browser game's own **2D pixel art**. The
owner rejected both the earlier smooth "illustrated" look and the later painterly storybook pass
as a downgrade from the pixel original. The rules for drawing pixel art are in
[`docs/ART_GUIDE.md`](../ART_GUIDE.md) (16 px tiles, 1 px plum-black outline, light from the upper
left, the shared palette); this page covers how that art reaches Godot.

References in `docs/reference/`: the two screenshots of the browser game are the target look.
`2d pixel.png` (a PixelLab web page) is a **style reference only**: it is third-party artwork, so
nothing is copied or traced from it.

## One source of truth: the browser's generators

- Every sprite is drawn by the browser game's code in `src/render/sprites/*` and painted on
  canvases. `npx tsx scripts/pixel-art/export.ts` runs those generators in headless Chrome and
  writes `godot/art/sprites.json`: each sprite as an embedded PNG scaled **6× nearest-neighbour**
  (16 art px per tile become the Godot pipeline's 96), with size, anchor and kind. Review copies
  go to `godot/art_src/pixel/`.
- It also writes `godot/art/palette.json`: the browser palette (`src/render/palette.ts`), people's
  colours, and the pixel interface colours from `src/ui/pixel.css`.
- Change a sprite in `src/render/sprites/`, re-run the exporter, and both games stay identical.

## Anchors (converted by the exporter)

| Kind | Godot anchor | Browser equivalent |
| --- | --- | --- |
| Trees, bushes, rocks | foot of the tile, `(tx + 0.5, ty + 1)` tiles | `drawObject` (stumps and saplings 2 px up) |
| Buildings, pens, fields, sites | bottom-left of the footprint | top-left blit, plus the footprint height |
| Animals | their position, facing right | browser frames face left, so they are mirrored |
| Tools | the hand, offset as `drawSettler` does | same |
| Icons | centre | |

Night overlays (`<name>_lit`) hold only the pixels that differ between the browser's night and day
sprites (lit windows, glowing furnaces). They are drawn as they are above the night tint.

## In the game

- **Filtering:** the project's default canvas filter is nearest and 2D transforms snap to pixels.
  Pixel bundles get no mipmaps (`Art.pixel`). One art pixel is 4 world px.
- **Zoom** settles on steps of 0.25 (`CameraRig.PIXEL_STEPS`), so an art pixel is always a whole
  number of screen pixels. The game starts at 0.75 (3 screen px per art pixel).
- **Ground:** `src/presentation/shaders/ground.gdshader` is a GPU port of the browser's
  `terrainPainter.ts`: the same 32-bit hashes, border creep by priority and reach, colour patches,
  water foam and bank shadow, cliff rims and strata, road edges, bridges, and per-tile tufts,
  flowers, pebbles, berries and shells. Seasonal colours come from `PixelGround` (a palette texture
  per season). Fog of war is the browser's `#17131f` with a soft edge.
- **Settlers:** `PixelPeople` ports `characters.ts` (drawFront, drawSide, 13 poses, outline) to
  GDScript and paints one sheet per appearance at runtime, cached. `SettlerView` picks frames as
  `drawSettler` does (walk, carry, work, idle breathing, sleep), with the tool at the hand, goods
  overhead, the ruler's crown, sleep and hunger marks. Role hats were dropped: the original has none.
- **Buildings:** fence and stone wall pieces join by neighbour mask; the Town Hall and mines show
  their level; the camp becomes the village hall at Village; the mill's sails turn. Unfinished
  buildings show a faint ghost of the finished building, revealed from the ground up as work
  progresses, as in the browser.
- **No smooth sway:** sub-pixel wind bending blurs pixel art, so it is off for pixel bundles.

## Interface

`hud.gd` rebuilds the browser's pixel HUD skin (`src/ui/pixel.css`): dirt panels in a 12×12 grass
frame with blades along the top (a 2× nine-patch), soil buttons with a turf edge, the green primary
button (`PrimaryButton` type variation) and **Pixelify Sans** (SIL Open Font License,
`godot/fonts/OFL-PixelifySans.txt`) with Atkinson Hyperlegible as the bundled fallback for any
character the pixel font lacks (`UiFonts`).

## Players' own art (Asset Studio)

Uploads are baked to each sprite's canvas and anchor as before. With the pixel bundle, sizes are
fitted with nearest-neighbour, and "match the palette" pulls colours toward the pixel palette.

## Retired

`scripts/art/make-svgs.ts` (the smooth/storybook generator) and its palette
(`scripts/art/storybook-palette.json`) are kept for reference only. Its bundle goes to
`godot/art_src/storybook-sprites.json`, which the game does not load.
