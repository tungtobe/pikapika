import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Keep all platform icons in sync with the editable vector. The ball fits
// inside the central 80% safe circle required by maskable app icons.
const folder = new URL('../public/icons/', import.meta.url);
const svg = await readFile(new URL('pokeball.svg', folder), 'utf8');
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, size] of [
    ['pokeball-192.png', 192], ['pokeball-512.png', 512],
    ['pokeball-maskable-512.png', 512], ['pokeball-apple-180.png', 180],
  ]) {
    // Fixed pixel size + clip: sizes below Chrome's minimum window width (e.g. 180) otherwise render distorted.
    await page.setViewportSize({ width: Math.max(size, 600), height: Math.max(size, 600) });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: fileURLToPath(new URL(file, folder)), clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`${file}: ${size}×${size}`);
  }
} finally { await browser.close(); }
