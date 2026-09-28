# Asset manifest

The game ships **no image or audio files**. Every asset below is generated at
startup from original code written for this project. Nothing is copied or traced
from other games. Fonts are loaded from Google Fonts (SIL Open Font License).

## Sprites (`src/render/sprites/*`, built by `SpriteBank`)

| Asset | Generator | Notes |
| --- | --- | --- |
| Town Hall, Keep and Castle (day + lit night) | `buildings.ts` `makeTownHallSprites` | one per level |
| Hunter's lodge, fisher's hut, well, granary, tannery, weaver's cottage, watchtower (day + night) | `buildings.ts` | Town Hall update |
| Pen yards and front rails ×6 (coop, sty, sheep, goat, cattle, horses) | `buildings.ts` `makePenSprites` | animals walk between the two layers |
| Stone wall ×16 join masks | `buildings.ts` `makeStoneWallSprites` | joins like fences |
| Animals ×19 species, 2 walking frames each | `animals.ts` `makeAnimalSprites` | mirrored to face right |
| Crown icon, crowned portrait | `icons.ts`, `index.ts` `portrait` | the ruler |
| Hides, wool, leather, cloth icons | `icons.ts` | new goods |
| Oak trees ×3 variants (trunk + canopy) | `props.ts` `makeOak` | canopy sways separately |
| Pine trees ×2 | `props.ts` `makePine` | four stacked tiers |
| Berry bush (full/picked) ×2 | `props.ts` `makeBerryBush` | |
| Rock ×3, boulder ×2 | `props.ts` `makeRock`, `makeBoulder` | boulders carry moss |
| Stump, sapling | `props.ts` | regrowth stages |
| Camp, house, storehouse, workshop, grand market, flower bed, lantern post, bench (day + lit night) | `buildings.ts` | footprint-relative drawings |
| Mill, bakery, cottage (day + lit night) | `buildings.ts` | Milestone 2 |
| Family home (day + lit night: porch swing, washing line) | `buildings.ts` `familyHome` | Families |
| Royal Hall, barracks, archery range, armory, stable, council hall (day + lit night) | `buildings.ts` | Crown and army |
| Company squads (settler sheets + sword/bow icons, knights on horses) with banner and health bar | `Renderer.drawCompany`, `drawForeignCompany` | war |
| Borders, claim tint and hatched occupation | `Renderer.drawLand` | territory |
| Inn (day + lit night, hanging sign), caravan depot, crate, caravan cart with pony | `buildings.ts` `inn`, `depot`, `crate`, `makeCartSprite` | Travellers |
| Charcoal kiln, smelter, forge (day + lit night) | `buildings.ts` | Mountains and mining |
| Quarry pit ×4 excavation stages, mine entrance ×3 shaft levels (day + night) | `buildings.ts` `makeQuarrySprites`, `makeMineSprites` | chosen by `Renderer.spriteFor` |
| Hill slopes and mountain faces (lit rim, strata, cast shadow, winter snow) | `terrainPainter.ts` | generator 3 |
| Orchard: saplings, bare, leafy, 3 fruit levels, autumn, winter | `buildings.ts` `makeOrchardSprites` | chosen by `Renderer.orchardLook` |
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
| Resource icons: food, wood, stone, planks, tools, wheat, flour, apples, coal, charcoal, copper/iron ore, copper/iron ingots, silver/gold ore, diamonds, swords, bows, armour, horses | `icons.ts` | shared by HUD and world |
| UI icons: people, house, sun, moon, rain, star, storage, idle, hungry, warning, drop, axe, pick, basket, zzz, heart | `icons.ts` | |
| Ground (all terrain, shores, paths, bridges, decorations) | `render/terrainPainter.ts` | painted per chunk in a worker |
| Favicon | inline SVG in `index.html` | |

Art can be checked without a browser: `npx tsx scripts/render-preview.ts sprites out.png`
renders a sheet of the newer sprites, and `... terrain out.png <seed> <gen> <cx> <cy> <n>`
renders ground, through a minimal canvas stand-in.

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


## Seasons and settlements continuation

Seasonal variants live in `render/sprites/index.ts`, bare oaks in `render/sprites/props.ts`, and terrain palettes in `render/terrainPainter.ts`. `pixel.recolor` substitutes exact palette colours without resampling. Waystation uses the existing original village hall artwork, including lit windows. No external assets added.
