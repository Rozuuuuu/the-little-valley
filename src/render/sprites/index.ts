import type { BuildingId } from '../../game/data/buildings';
import type { CropId } from '../../game/data/crops';
import type { ResourceId } from '../../game/data/resources';
import type { Appearance, ToolKind } from '../../game/sim/types';
import { makeCanvas, type Sprite } from '../pixel';
import { makeBuildingSprites, makeFenceSprites, makeMillSails, makeVillageHall, type BuildingSprites } from './buildings';
import { appearanceKey, makeSettlerSheet, type SettlerSheet } from './characters';
import { makeCropSprites, makeSoil, type SoilState } from './crops';
import { makeResourceIcons, makeToolSprites, makeUiIcons, type UiIconId } from './icons';
import { makeBerryBush, makeBoulder, makeOak, makePine, makeRock, makeSapling, makeStump, type TreeSprite } from './props';

/**
 * Every sprite in the game, generated once at startup from code. No image
 * files are loaded; see docs/ASSET_MANIFEST.md.
 */
export class SpriteBank {
  readonly oaks: TreeSprite[] = [0, 1, 2].map(makeOak);
  readonly pines: TreeSprite[] = [0, 1].map(makePine);
  readonly berry: Sprite[] = [0, 1].map((v) => makeBerryBush(true, v));
  readonly berryEmpty: Sprite[] = [0, 1].map((v) => makeBerryBush(false, v));
  readonly rocks: Sprite[] = [0, 1, 2].map(makeRock);
  readonly boulders: Sprite[] = [0, 1].map(makeBoulder);
  readonly stump = makeStump();
  readonly sapling = makeSapling();
  readonly buildings: Partial<Record<BuildingId, BuildingSprites>> = makeBuildingSprites();
  readonly fence: Sprite[] = makeFenceSprites();
  readonly millSails: Sprite[] = makeMillSails();
  readonly villageHall: BuildingSprites = makeVillageHall();
  readonly crops: Record<CropId, Sprite[]> = makeCropSprites();
  readonly soil: Record<SoilState, Sprite> = { wild: makeSoil('wild'), tilled: makeSoil('tilled'), wet: makeSoil('wet') };
  readonly resources: Record<ResourceId, Sprite> = makeResourceIcons();
  readonly ui: Record<UiIconId, Sprite> = makeUiIcons();
  readonly tools: Record<ToolKind, Sprite> = makeToolSprites();
  private sheets = new Map<string, SettlerSheet>();
  private urls = new Map<Sprite, string>();

  settler(a: Appearance): SettlerSheet {
    const k = appearanceKey(a);
    let s = this.sheets.get(k);
    if (!s) {
      s = makeSettlerSheet(a);
      this.sheets.set(k, s);
    }
    return s;
  }

  /** Data URL for using a sprite in React UI (scaled with CSS pixelation). */
  url(sprite: Sprite): string {
    let u = this.urls.get(sprite);
    if (!u) {
      u = sprite.canvas.toDataURL();
      this.urls.set(sprite, u);
    }
    return u;
  }

  /** A square preview of a building for the build menu. */
  buildingPreview(id: BuildingId): string {
    const key = `preview:${id}`;
    const cached = this.previewCache.get(key);
    if (cached) return cached;
    const size = 40;
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    let src: HTMLCanvasElement | null = this.buildings[id]?.day.canvas ?? null;
    if (id === 'fence') src = this.fence[2 | 8].canvas;
    if (id === 'field') src = this.cropPreview();
    if (id === 'path' || id === 'bridge') src = this.groundPreview(id);
    if (id === 'stoneBridge') src = this.stoneBridgePreview();
    if (src) {
      const scale = Math.min(size / src.width, size / src.height, 2);
      const w = Math.floor(src.width * scale);
      const h = Math.floor(src.height * scale);
      ctx.drawImage(src, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
    }
    const url = c.toDataURL();
    this.previewCache.set(key, url);
    return url;
  }

  private previewCache = new Map<string, string>();

  private cropPreview(): HTMLCanvasElement {
    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(this.soil.tilled.canvas, 0, 0);
    ctx.drawImage(this.crops.wheat[3].canvas, 0, 0);
    return c;
  }

  private stoneBridgePreview(): HTMLCanvasElement {
    const c = makeCanvas(24, 16);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#3b82b4';
    ctx.fillRect(0, 8, 24, 8);
    ctx.fillStyle = '#a3a8ab';
    ctx.fillRect(0, 3, 24, 6);
    ctx.fillStyle = '#80868c';
    for (const x of [2, 11, 20]) ctx.fillRect(x, 9, 3, 7);
    ctx.fillStyle = '#5f646b';
    ctx.fillRect(0, 2, 24, 1);
    ctx.fillRect(0, 9, 24, 1);
    ctx.fillStyle = '#c8cccc';
    for (let x = 1; x < 24; x += 4) ctx.fillRect(x, 5, 2, 1);
    return c;
  }

  private groundPreview(id: 'path' | 'bridge'): HTMLCanvasElement {
    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d')!;
    if (id === 'path') {
      ctx.fillStyle = '#b18555';
      ctx.fillRect(0, 2, 16, 12);
      ctx.fillStyle = '#c39a66';
      for (let i = 0; i < 6; i++) ctx.fillRect((i * 5) % 14, 4 + ((i * 3) % 8), 2, 1);
    } else {
      ctx.fillStyle = '#3b82b4';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#9a6538';
      ctx.fillRect(0, 3, 16, 10);
      ctx.fillStyle = '#7a4e2c';
      for (let x = 3; x < 16; x += 4) ctx.fillRect(x, 3, 1, 10);
      ctx.fillStyle = '#5c3a22';
      ctx.fillRect(0, 2, 16, 1);
      ctx.fillRect(0, 13, 16, 1);
    }
    return c;
  }
}
