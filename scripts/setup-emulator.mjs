import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const manifestUrl = new URL('emulator-assets.json', root);
const version = '4.2.3';
const paths = ['loader.js', 'emulator.min.js', 'emulator.min.css', 'version.json',
  'compression/extract7z.js', 'compression/extractzip.js', 'compression/libunrar.js', 'compression/libunrar.wasm',
  'cores/gambatte-legacy-wasm.data', 'cores/gambatte-wasm.data', 'cores/reports/gambatte.json'];
let previous;
try { previous = JSON.parse(await readFile(manifestUrl, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const assets = [];
for (const path of [...paths, 'LICENSE']) {
  const url = path === 'LICENSE'
    ? `https://raw.githubusercontent.com/EmulatorJS/EmulatorJS/v${version}/LICENSE`
    : `https://cdn.emulatorjs.org/${version}/data/${path}`;
  const target = new URL(`public/emulatorjs/${path}`, root);
  const prior = previous?.assets.find(a => a.path === path);
  const digest = data => createHash('sha256').update(data).digest('hex');
  let data;
  try { data = await readFile(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!data || !prior || digest(data) !== prior.sha256) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    data = Buffer.from(await response.arrayBuffer());
    if (prior && digest(data) !== prior.sha256) throw new Error(`Upstream asset changed: ${path}; refusing to replace the pinned version.`);
    await mkdir(new URL('./', target), { recursive: true });
    await writeFile(target, data);
  }
  assets.push({ path, url, bytes: data.length, sha256: digest(data) });
  console.log(`Verified ${path} (${data.length} bytes)`);
}
await writeFile(manifestUrl, JSON.stringify({ version, core: 'gambatte', assets }, null, 2) + '\n');
