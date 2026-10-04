// Serves the exported Godot web build (dist-godot/web) on this computer's local network, so a
// phone or tablet on the same Wi-Fi can open it. Run it yourself when you want to test on a device:
//   npx tsx scripts/serve-godot-web.ts [port=8735]
// then open the printed address on the phone. Add ?bench=600&settlers=100 to the address to run the
// frame benchmark (results appear in the page console; Chrome's remote debugging shows them).
//
// Plain HTTP on a local network runs the game, but browsers only offer "Install" over HTTPS (or on
// localhost), so installing as an app is tested after deploying. Stop the server with Ctrl+C.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join } from 'node:path';

const port = Number(process.argv[2] ?? 8735);
const ROOT = 'dist-godot/web';
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream',
  '.png': 'image/png', '.json': 'application/json',
};
if (!existsSync(join(ROOT, 'index.html'))) throw new Error('No web build: run scripts/godot-export.sh web first');
createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, '0.0.0.0', () => {
  for (const nets of Object.values(networkInterfaces())) {
    for (const n of nets ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`Open http://${n.address}:${port}/ on your phone`);
  }
});
