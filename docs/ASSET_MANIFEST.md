# Asset manifest

The game ships **no image or audio files**. Every asset below is generated at
startup from original code written for this project. Nothing is copied or traced
from other games. Fonts are loaded from Google Fonts (SIL Open Font License).

## Sprites (`src/render/sprites/*`, built by `SpriteBank`)

| Asset | Generator | Notes |
| --- | --- | --- |
| Oak trees ×3 variants (trunk + canopy) | `props.ts` `makeOak` | canopy sways separately |
| Pine trees ×2 | `props.ts` `makePine` | four stacked tiers |
| Berry bush (full/picked) ×2 | `props.ts` `makeBerryBush` | |
| Rock ×3, boulder ×2 | `props.ts` `makeRock`, `makeBoulder` | boulders carry moss |
| Stump, sapling | `props.ts` | regrowth stages |
| Camp, house, storehouse, workshop, grand market, flower bed, lantern post, bench (day + lit night) | `buildings.ts` | footprint-relative drawings |
| Mill, bakery, cottage (day + lit night) | `buildings.ts` | Milestone 2 |
| Mill sails ×8 rotation frames | `buildings.ts` `makeMillSails` | animated by the renderer |
| Village hall (day + night) | `buildings.ts` `makeVillageHall` | replaces the camp at Village |
| Stone bridge build stages | `Renderer.drawStoneBridgeSite` | drawn procedurally |
| Stone bridge deck | `terrainPainter.ts` (`T.StoneBridge`) | part of the ground |
| Build-menu preview for the stone bridge | `sprites/index.ts` | |
| Fence (16 connection masks) | `buildings.ts` `makeFenceSprites` | |
| Field soil: staked, tilled, watered | `crops.ts` `makeSoil` | |
| Crops: turnip, wheat, pumpkin × 4 stages | `crops.ts` `makeCropSprites` | driven by `CROPS[].art` |
| Settler sheets: 4 directions × 13 poses per appearance | `characters.ts` `makeSettlerSheet` | 4 skins × 6 hair × 3 styles × 6 shirts × 3 trousers |
| Tools: axe, pick, hoe, hammer, watering can, sickle, saw | `icons.ts` `makeToolSprites` | |
| Resource icons: food, wood, stone, planks, tools, wheat, flour | `icons.ts` | shared by HUD and world |
| UI icons: people, house, sun, moon, rain, star, storage, idle, hungry, warning, drop, axe, pick, basket, zzz, heart | `icons.ts` | |
| Ground (all terrain, shores, paths, bridges, decorations) | `render/terrainPainter.ts` | painted per chunk in a worker |
| Favicon | inline SVG in `index.html` | |

## Effects (`src/render/particles.ts`, `Renderer.ts`)

Wood chips, stone chips, soil, falling leaves, sparkles, dust puffs, water splashes,
hearts, chimney smoke, campfire sparks, rain, fireflies, pollen, command markers,
lighting and fog.

## Audio (`src/audio/AudioEngine.ts`, WebAudio synthesis)

| Sound | Built from |
| --- | --- |
| chop, mine, pick, dig, water, saw | filtered noise bursts + short tones |
| plant, harvest, complete, arrival, milestone | sine/triangle arpeggios |
| hammer, drop, place, eat | short pitched knocks |
| mill (creak and grind), bake (oven door and hum) | filtered noise and low tones, rate-limited |
| UI: click, open, close, select, command, error | short tones |
| Ambience: birds (day), crickets (night), rain bed | tones and looping filtered noise |
| Music | generative I–vi–IV–V pads and pentatonic plucks through an echo; sparser at night |

Master, music and effects volumes (plus mute) are independent settings.
