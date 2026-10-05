# Art style: storybook illustrated Little Valley

The Godot version replaces the browser game's pixel art with **painterly, storybook 2D**:
sunlit yellow-greens, cool blue-green shade, sky-blue water, warm wood, golden thatch and
terracotta. Forms are full and soft, built from overlapping lit clusters rather than flat
shapes. The view stays top-down with the same ¾ tilt. These rules apply to every asset,
whether generated or drawn by hand.

**References** (in `docs/reference/`): the two screenshots of the browser game set the bar for
density and charm (chunky trees, timber town hall, wooden UI). The painted landscape sets the
target finish (lush layered foliage, birches, thatched golden roofs, warm light). The Godot
version must look at least as rich as the pixel original at normal zoom.

**Status: every asset today is provisional.** They are drawn in code by
`scripts/art/make-svgs.ts` (trees and rocks in `environment.ts`, buildings in `buildings.ts`),
to fix the style, scale and anchors. Any file can be replaced by finished art with the same
name, size and anchor (see "Replacing art").

## Palette

The single source is `godot/art/palette.json`. The generator, the ground shader and the
interface all read it.

| Role | Colour | Where |
| --- | --- | --- |
| Shade green | `#1d3a2e` | Contact shadows, the darkest foliage, outlines (mixed) |
| Leaf | `#55912f` → `#bcd85e` | Canopies, from shaded cluster to sunlit highlight |
| Grass | `#4a8432` / `#6a9d3c` / `#94bb4e` | Ground; sunlit areas warm toward yellow, shade toward blue-green |
| Cream | `#f4f0c8` | Highlights, foam, hover cues |
| Gold | `#efc04e` | Selection, harvest marks, active work, the hall's flag: about 5% of the screen |

Supporting materials:
- water `#4fb0d2` over deep `#276e9e`, with turquoise sandy shallows;
- sand `#dcbc80`, dirt road `#b08453`, soil `#86603c`;
- warm stone `#a09a8c`, wood `#a8723e`;
- roofs: clay tile `#c65c32`, golden thatch `#d6a43a`, slate `#557086`;
- plaster `#e2cfa2` with timber framing;
- crops in their own colours (turnip, wheat, pumpkin);
- clothes from six warm and cool mid-tones.

Interface: dark walnut panels `#4a2f1c` with a gold trim `#d9b36a`, plank buttons
`#6e4a2a` with a dark lip, cream text `#f8ecd2`. Problem red `#ec6a56` always comes with a
word or a symbol.

Never use pure black or large flat grey areas.

## Shapes and light

- **Light comes from the upper left**, warm; shade is cool. Every form has a lit side, a mid
  tone and a shadow side, and casts a soft contact shadow (an ellipse at 30–40%).
- **Foliage** (`canopy()` in `environment.ts`): a dome of overlapping leaf clusters. Each
  cluster is a shadow mass, a mid tone shifted toward the light (leaving a cool crescent
  lower-right), a lit cap and a highlight; pointed leaves fringe every edge and dab the lit
  side; a soft radial glow finishes the crown. No outline: the dark mass is the edge.
- **Trees:** round oaks, airy birches with white bark (one variant in three), and pines with
  drooping needled tiers. Trunks taper, flare at the root, and carry bark streaks. Grass
  tufts grow at every foot so objects sit in the meadow.
- **Buildings** (`buildings.ts`): pitched roofs about as tall as the walls, textured by
  material (scalloped clay tiles, golden thatch with stake ridges, slate or shingle courses),
  a ridge cap and sunlight falling off to the right. Walls carry their material (timber
  framing with braces, planks, logs, masonry, brick), a shadow under the eaves and a
  fieldstone plinth. Windows have frames, sills and shutters; doors are planked with a step.
- **Outlines** on buildings, people and props are 2–3 art px in the material's darkest tone
  mixed with the warm outline brown `#2a2318`, never black. Foliage and ground have none.
- **Day and night** is a colour grade over the world: warm dusk, moonlit blue night. Lit
  windows sit above the grade and add light, so they glow.

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
  Nothing is a tile image. Each chunk sees a three-tile border of its neighbours, so depth and
  bank effects cross chunk edges without seams.
- **Borders** come from blending the four nearest tiles' terrain types and drawing the boundary
  where one outweighs the others. Noise nudges it, which gives curved shorelines. Grass types
  (grass, meadow, forest floor, hill) fade broadly into each other; other borders are crisp,
  with a ragged lip of grass hanging over sand, road and rock.
- **Grass** is laid in leaning, softly posterised brush strokes; large sunlit (warm) and
  shaded (cool) areas drift across it; lit grass clumps and blades give texture, with small
  flowers in meadows and dappled light on forest floor.
- **Water** deepens from turquoise sandy shallows to deep blue by distance from land, with
  drifting wave dashes, sky reflections, twinkling sparkles, a shadow under the bank's face
  and a lacy foam band. Sand has ripples, pebbles and reeds; roads have ruts and pebbles.
- **Mountains** are faceted warm stone lit from the upper left, with cracks, moss in the
  hollows, a sunlit rim above and a cliff shadow below.
- **Cloud shadows** drift slowly over everything.
- **Seasons:** autumn warms and dries the grass, and winter lays snow by noise. Oaks have
  autumn and bare winter variants; pines and bushes have snowy ones.
- **Fog of war** is a soft-edged, mottled dark green.

## Feedback and interface

- **Selection** is a gold ring on the ground (two rings). **Hover** is a thin mint ring.
- **Placement preview:**
  - mint fill and edge when the building fits;
  - red fill with hatching when it doesn't, so colour is never the only cue;
  - the refusal reason in words.
- **Harvest marks** are small gold tags at the object's foot. **Construction progress** is
  two thin bars: materials (gold) and work (green).
- **Interface:**
  - panels are dark walnut at 95% with a gold trim; buttons are raised planks with a dark lip;
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
