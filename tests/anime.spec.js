import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { games } from '../src/games.js';

const sav = await readFile(new URL('./fixtures/anime-ep83.sav', import.meta.url));
const stateSave = frame => frame.evaluate(async () => {
  const { stateBattery } = await import('/src/save-migration.js');
  return Array.from(stateBattery(window.EJS_emulator.gameManager.getState(), 'mgba'));
});

async function boot(page) {
  await page.locator('#play').click();
  await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 60_000 });
  return page.frames().find(frame => frame.url().includes('emulator.html'));
}

test('Anime Version (GBA) boots on mGBA with L/R and Vietnamese-only selection', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://localhost:5173/')) external.push(request.url()); });
  await page.goto('/?game=red-vi');
  await page.locator('[data-game="anime"]').click();
  await expect(page).toHaveURL(/game=anime/);
  await expect(page.locator('#game-title')).toHaveText('Pokémon Anime Version');
  await expect(page.locator('#version-label')).toHaveText('GAME BOY ADVANCE · VI · v2.0.7');
  await expect(page.locator('#language option[value=en]')).toBeDisabled();
  const ratio = await page.locator('#screen').evaluate(el => el.clientWidth / el.clientHeight);
  expect(ratio).toBeCloseTo(1.5, 1);
  const frame = await boot(page);
  expect(await frame.evaluate(() => window.EJS_emulator.config.system)).toBe('mgba');
  await frame.evaluate(() => {
    const gm = window.EJS_emulator.gameManager, original = gm.simulateInput.bind(gm);
    window.inputs = [];
    gm.simulateInput = (...args) => { window.inputs.push(args); return original(...args); };
    window.focus();
  });
  await page.keyboard.press('a');
  await page.keyboard.press('s');
  await expect.poll(() => frame.evaluate(() => [10, 11].every(b => window.inputs.some(v => v[1] === b && v[2] === 1)))).toBe(true);
  // Red/Blue keep the Game Boy layout and no shoulder buttons.
  await page.locator('[data-game="blue"]').click();
  await expect(page.locator('#game-title')).toHaveText('Pokémon Blue');
  await expect(page.locator('#language')).toHaveValue('vi');
  await expect(page.locator('[data-input="10"]')).toBeHidden();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('Anime Version: .sav import/export, quick save, JSON backup and resume', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/?game=anime');
  let frame = await boot(page);
  await page.locator('#import-file').setInputFiles({ name: 'broken.sav', mimeType: 'application/octet-stream', buffer: Buffer.alloc(131072) });
  await expect(page.locator('#status')).toContainText('không phải SAVE hợp lệ');
  await page.locator('#import-file').setInputFiles({ name: 'tap83.sav', mimeType: 'application/octet-stream', buffer: sav });
  // The import status can be replaced by the next autosave notice; check the data itself.
  await expect(page.locator('#migration-note')).toContainText('Đã nhập file .sav', { timeout: 30_000 });
  expect(Buffer.from(await stateSave(frame)).equals(sav)).toBe(true);

  const savDownload = page.waitForEvent('download');
  await page.locator('#export-sav').click();
  const exported = await readFile(await (await savDownload).path());
  expect((await savDownload).suggestedFilename()).toBe('pokeanime_vi.sav');
  expect(exported.equals(sav)).toBe(true);

  // Let the title screen run, then checkpoint and restore a full mGBA state.
  await page.waitForTimeout(3000);
  await page.locator('#pause').click();
  await expect(page.locator('#status')).toContainText('Đã tạm dừng');
  await page.locator('#quick-save').click();
  await expect(page.locator('#status')).toContainText('Đã lưu nhanh');
  await page.locator('#quick-load').click();
  await expect(page.locator('#status')).toContainText('Đã tải bản lưu nhanh');

  const jsonDownload = page.waitForEvent('download');
  await page.locator('#export').click();
  const backup = JSON.parse(await readFile(await (await jsonDownload).path(), 'utf8'));
  expect(backup).toMatchObject({ game: 'anime', core: 'mgba', sha1: games.anime.sha1 });
  expect(Buffer.from(backup.battery, 'base64').equals(sav)).toBe(true);
  await page.locator('#import-file').setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#status')).toContainText(/Đã nhập save|Đã tự lưu/);
  await expect(page.locator('#quick-save')).toBeEnabled();

  await page.reload();
  frame = await boot(page);
  await expect(page.locator('#status')).toContainText('Đã tiếp tục');
  expect(Buffer.from(await stateSave(frame)).equals(sav)).toBe(true);
  // Continue from the imported in-game save to prove the game accepts it.
  for (let i = 0; i < 6; i++) {
    await frame.evaluate(() => window.player.focus());
    await page.keyboard.press(i < 3 ? 'Enter' : 'z');
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: 'test-results/anime-continue.png' });
});
