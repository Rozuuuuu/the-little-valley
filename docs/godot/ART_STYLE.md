# Art style: coloured, illustrated Little Valley

The Godot version replaces the browser game's pixel art with **limited-palette illustrated
2D**: smooth shapes, a soft shadow band, a mint rim light, coloured outlines, and atmospheric
ground. The view stays top-down with the same ¾ tilt. These rules apply to every asset,
whether generated or drawn by hand.

**Status: every asset today is provisional.** They are drawn in code by
`scripts/art/make-svgs.ts`, to fix the style, scale and anchors. Any file can be replaced by
finished art with the same name, size and anchor (see "Replacing art").

## Palette

The single source is `godot/art/palette.json`. The generator, the ground shader and the
interface all read it.

| Role | Colour | Where |
| --- | --- | --- |
| Deep teal | `#173b3d` | Darkest shadows, contact shadows, outlines (mixed), fog, UI panels |
| Forest | `#2f6a4f` | Canopies, forest floor |
| Sage | `#8aab7a` | Grass and secondary surfaces |
| Mint | `#cdeedb` | Rim light, highlights, foam, hover and placement-OK cues |
| Gold | `#e6b65a` | Selection, harvest marks, active work, the hall's flag: kept to about 5% of the screen |

Supporting hues are slightly desaturated toward the teal family so the scene stays unified:
- water `#3d93a6`;
- soil `#7a573c`;
- stone `#8e9b95`;
- wood `#a77446`;
- terracotta roofs `#b8604a`;
- slate roofs `#4f6f7c`;
- crops in their own colours (turnip, wheat, pumpkin);
- clothes from six warm and cool mid-tones.

Problem red `#d9584f` always comes with a word or a symbol.

Never use pure black, pure white or large grey areas. Silhouettes of people, buildings and
resources must never be near-black.

## Shapes and light

- **Shapes** are soft and organic. Canopies, bushes and rocks are wobbly ellipses; buildings are
  rounded rectangles with clear roof silhouettes.
- **Light comes from the upper left.** Each form gets a dark crescent on its lower-right side
  (`shaded()` in `svg-kit.ts`: the base tone shifted up-left over the dark tone), a light patch
  toward the upper left, and a thin mint rim on the lit edge.
- **Outlines** are 3 art px (about 2 screen px at normal zoom), in the object's darkest tone
  mixed with the outline teal, and never black. Crops and ground decals get thin outlines or
  none, so fields stay calm.
- **Every standing object casts a soft teal contact shadow** (an ellipse at 25–35% opacity).
- **Day and night** is a colour grade over the world: warm dusk, deep-teal night. Lit windows
  sit above the grade and add light, so they glow.

## Scale and anchors

- Art is authored at **96 px per tile** and drawn at 64 world px per tile, scaled smoothly. The
  atlas has mipmaps and linear filtering, so nothing snaps to pixels when zooming.
- **Every sprite has an anchor:** the point that touches the ground. It is recorded in
  `godot/art/generated/manifest.json` with the sprite's size.
  - Trees and bushes: the trunk base.
  - Buildings: the bottom-left corner of the footprint.
  - People: the feet.
- **Building footprints** are exactly `w × h` tiles (96 px each) at the bottom of the canvas.
  Walls fill the lower part of the footprint, and roofs rise above it.
- **Depth:** objects, crops, buildings and people are sorted by their anchor's y, so a person
  walks behind a tree north of them.
- Logical tiles, footprints and pathfinding never depend on art size.

## People

- **Proportions:** about 0.6 tiles wide and 1.1 tiles tall. The head is about a third of the
  height, and faces are two dark eyes and soft cheeks.
- **Parts** (legs, body, head, hair, role hat, tool) share one canvas and anchor, so they stack.
  - Legs, body, head and hair are drawn in light greys, and the game tints them with the
    person's pants, shirt, skin and hair colours. Colours are data, so one set of parts serves everyone.
  - Hats and tools keep their own colours.
- **Roles are read from the hat:** straw for farmers, gold cap for builders, green hood for
  gatherers, slate bandana for haulers, wooden cap for crafters, none for labourers.
- **Directions:** down, up and side. Right is the side view mirrored.
- **Animation:**
  - walking: four leg frames by distance moved, plus a small bob;
  - idle: a slow breath;
  - working: the tool swings;
  - carrying: the good's icon over the shoulder;
  - sleeping outdoors: lying down;
  - asleep indoors: hidden, with the window lit.

## Terrain

- Ground is painted by a shader (`src/presentation/shaders/ground.gdshader`), one quad per chunk.
  Nothing is a tile image.
- **Borders** come from blending the four nearest tiles' terrain types and drawing the boundary
  where one outweighs the others. Noise nudges it, which gives curved shorelines and soft
  meadow and forest edges.
- **Water** has slow ripples and glints, a foam band at the shore, and darker sand at the
  waterline. Mountains have a lit rim above and a dark foot below; hills have soft contour lines.
- **Seasons:** autumn warms and dries the grass, and winter lays snow by noise. Oaks have
  autumn and bare winter variants; pines and bushes have snowy ones.
- **Fog of war** is a soft-edged, mottled deep teal.

## Feedback and interface

- **Selection** is a gold ring on the ground (two rings). **Hover** is a thin mint ring.
- **Placement preview:**
  - mint fill and edge when the building fits;
  - red fill with hatching when it doesn't, so colour is never the only cue;
  - the refusal reason in words.
- **Harvest marks** are small gold tags at the object's foot. **Construction progress** is
  two thin bars: materials (gold) and work (green).
- **Interface:**
  - panels are deep teal at 93%, with soft corners and a faint mint edge;
  - the text is Atkinson Hyperlegible, SIL Open Font License, in `godot/fonts`;
  - accents are gold, good news is green, problems are red with words.
- **Motion:** reduced motion stops sway, water movement and idle bobbing.

## Replacing art (the pipeline)

1. Keep the file name, canvas size and anchor from `manifest.json`. A different size is accepted
   and fitted, but finished art should match.
2. **Finished art shipped with the game** goes in `godot/art/final/<name>.png` or `.svg`.
   Record its source and licence in `godot/art/CREDITS.md`. Only CC0, or CC-BY with credit, and
   only art you have a clear right to ship.
3. **Art a player chooses on their own device** goes in `user://art_overrides/<name>.png`. The
   Asset Studio writes there; it stays on that device.
4. Load order: player override, then finished art, then generated. See `Art._load_image`.
5. Review with `godot --headless --path . -s res://tools/art_sheet.gd -- sheet.png`, and in game
   with the capture mode (`-- --shot=out.png`).
6. When mixing art from different sources, recolour it to the palette (the Asset Studio offers
   this), check silhouettes at 50% zoom, and look at a crowded scene before accepting it.
