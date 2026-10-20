import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { games } from '../src/games.js';
const root = new URL('../', import.meta.url);
const hash = (data, algorithm) => createHash(algorithm).update(data).digest('hex');
for (const game of Object.values(games)) {
  const bytes = await readFile(new URL(`public/roms/${game.file}`, root));
  if (hash(bytes, 'sha1') !== game.sha1) throw new Error(`ROM checksum mismatch: ${game.file}`);
  console.log(`ROM verified: ${game.file}`);
}
const manifest = JSON.parse(await readFile(new URL('emulator-assets.json', root)));
for (const asset of manifest.assets) {
  const bytes = await readFile(new URL(`public/emulatorjs/${asset.path}`, root));
  if (hash(bytes, 'sha256') !== asset.sha256) throw new Error(`Runtime checksum mismatch: ${asset.path}`);
}
console.log(`Runtime verified: EmulatorJS ${manifest.version}, ${manifest.assets.length} files`);
