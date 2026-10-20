import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const allowPartial = process.argv.includes('--allow-partial');
const refs = await readFile(new URL('../pokered/roms.sha1', root), 'utf8');
await mkdir(new URL('public/roms/', root), { recursive: true });
for (const name of ['pokered.gbc', 'pokeblue.gbc']) {
  const data = await readFile(new URL(`../pokered/${name}`, root));
  const sha1 = createHash('sha1').update(data).digest('hex');
  const expected = refs.split('\n').find(line => line.endsWith(`*${name}`))?.split(/\s/)[0];
  if (sha1 !== expected) throw new Error(`${name}: checksum does not match pokered/roms.sha1`);
  const dest = new URL(`public/roms/${name}`, root);
  await writeFile(dest, data);
  console.log(`${fileURLToPath(dest)}  SHA-1 ${sha1}`);
}

let translated;
try { translated = JSON.parse(await readFile(new URL('../pokered/vi-roms.json', root), 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
const variants = {};
if (translated && (!translated.partial || allowPartial)) {
  for (const [version, info] of Object.entries(translated.roms)) {
    const data = await readFile(new URL(`../pokered/${info.file}`, root));
    const sha1 = createHash('sha1').update(data).digest('hex');
    if (sha1 !== info.sha1) throw new Error(`${info.file}: invalid Vietnamese ROM checksum`);
    await writeFile(new URL(`public/roms/${info.file}`, root), data);
    variants[version === 'pokered' ? 'red-vi' : 'blue-vi'] = { file: info.file, sha1 };
    console.log(`${info.file}  SHA-1 ${sha1}`);
  }
}
await writeFile(new URL('src/vi-roms.json', root), JSON.stringify(variants, null, 2) + '\n');
