import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const target = new URL('artifacts/vercel/', root);
// Only remove this script's generated output; never touch source or browser saves.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of ['index.html', 'emulator.html', 'src', 'public', 'scripts', 'package.json', 'package-lock.json', 'vite.config.js', 'vercel.json', '.vercelignore', 'emulator-assets.json', 'README.md']) {
  await cp(new URL(file, root), new URL(file, target), { recursive: true });
}
await writeFile(new URL('.gitignore', target), 'node_modules/\ndist/\nartifacts/\n.vercel/\n.DS_Store\n');
await writeFile(new URL('DEPLOY.txt', target), 'Self-contained source bundle: all 4 ROMs and pinned EmulatorJS assets included.\nVercel: cd here, then npx vercel --prod\nGit import: use this entire folder (including public/roms and public/emulatorjs).\nBuild: npm ci && npm run build; output: dist\nNo sibling pokered repository or RGBDS required.\n');
console.log('Vercel source bundle ready: artifacts/vercel/');
console.log('Static hosting bundle ready: dist/ (deploy the contents, not its parent).');

// macOS ships zip; archives contain deployment inputs, never node_modules.
for (const [archive, cwd, entry] of [
  ['pokered-player-vercel.zip', new URL('artifacts/', root), 'vercel'],
  ['pokered-player-static.zip', new URL('dist/', root), '.'],
]) {
  const path = new URL(`artifacts/${archive}`, root);
  await rm(path, { force: true });
  execFileSync('zip', ['-qr', fileURLToPath(path), entry], { cwd: fileURLToPath(cwd) });
  console.log(`Archive ready: artifacts/${archive}`);
}
