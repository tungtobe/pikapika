// Build the Pokémon Anime Version ROM: FireRed (USA) 1.0 + the TekCafe BPS patch.
// Usage: npm run patch:anime -- <pokefirered.gba> <Pokemon Anime Version ... (FireRed).bps>
// Defaults: ../firered-build/pokefirered/pokefirered.gba (pret/pokefirered build)
// and the newest "*Anime*FireRed*.bps" path passed in ANIME_BPS.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { games } from '../src/games.js';

const root = new URL('../', import.meta.url);
const [sourcePath = fileURLToPath(new URL('../firered-build/pokefirered/pokefirered.gba', root)),
  patchPath = process.env.ANIME_BPS] = process.argv.slice(2);
if (!patchPath) throw new Error('Thiếu đường dẫn file .bps (tham số thứ 2 hoặc biến ANIME_BPS).');
const game = games.anime;

function applyBPS(source, patch) {
  if (patch.subarray(0, 4).toString('latin1') !== 'BPS1') throw new Error('Không phải file BPS.');
  const footer = patch.length - 12;
  const [sourceCrc, targetCrc, patchCrc] = [0, 4, 8].map(o => patch.readUInt32LE(footer + o));
  if (crc32(patch.subarray(0, footer + 8)) !== patchCrc) throw new Error('File BPS bị hỏng (CRC patch sai).');
  if (crc32(source) !== sourceCrc) {
    throw new Error(`ROM gốc sai: CRC32 ${crc32(source).toString(16).toUpperCase()}, cần ${sourceCrc.toString(16).toUpperCase()} (FireRed USA 1.0).`);
  }
  let p = 4;
  const number = () => {
    let value = 0, shift = 1;
    for (;;) {
      const x = patch[p++];
      value += (x & 0x7f) * shift;
      if (x & 0x80) return value;
      shift *= 128;
      value += shift;
    }
  };
  const sourceSize = number(), targetSize = number();
  const metadata = number(); // skip metadata (read first: `p += number()` uses the old p)
  p += metadata;
  if (sourceSize !== source.length) throw new Error('Kích thước ROM gốc không khớp patch.');
  const target = Buffer.alloc(targetSize);
  let out = 0, sourceRel = 0, targetRel = 0;
  while (p < footer) {
    const data = number(), command = data & 3, length = Math.floor(data / 4) + 1;
    if (command === 0) { source.copy(target, out, out, out + length); out += length; }
    else if (command === 1) { patch.copy(target, out, p, p + length); p += length; out += length; }
    else {
      const offset = number(), delta = (offset & 1 ? -1 : 1) * Math.floor(offset / 2);
      if (command === 2) { sourceRel += delta; source.copy(target, out, sourceRel, sourceRel + length); sourceRel += length; out += length; }
      else { targetRel += delta; for (let i = 0; i < length; i++) target[out++] = target[targetRel++]; }
    }
  }
  if (out !== targetSize || crc32(target) !== targetCrc) throw new Error('ROM sau khi patch sai CRC.');
  return target;
}

const rom = applyBPS(await readFile(sourcePath), await readFile(patchPath));
const sha1 = createHash('sha1').update(rom).digest('hex');
if (sha1 !== game.sha1) throw new Error(`${game.file}: SHA-1 ${sha1} khác giá trị ghim trong src/games.js`);
await mkdir(new URL('public/roms/', root), { recursive: true });
const dest = new URL(`public/roms/${game.file}`, root);
await writeFile(dest, rom);
console.log(`${fileURLToPath(dest)}  ${rom.length} bytes  SHA-1 ${sha1}`);
