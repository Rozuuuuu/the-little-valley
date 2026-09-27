(globalThis as any).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }),
};
const { World } = await import('../src/game/world/World');
const { paintChunk } = await import('../src/render/terrainPainter');
const w = new World(12345);
for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) w.chunk(x, y);
for (let k = 0; k < 3; k++) {
  const t0 = performance.now();
  paintChunk(w, w.chunk(0, 0));
  console.log('paint ms', (performance.now() - t0).toFixed(1));
}
