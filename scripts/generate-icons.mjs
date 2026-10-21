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
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await page.screenshot({ path: fileURLToPath(new URL(file, folder)) });
    console.log(`${file}: ${size}×${size}`);
  }
} finally { await browser.close(); }
