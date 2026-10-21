import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.locator('#play').click();
  await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 30_000 });
  return page.frames().find(frame => frame.url().includes('emulator.html'));
}
test('ROMs boot locally; keyboard and gamepad inputs reach the core', async ({ page }) => {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://localhost:5173/')) external.push(request.url()); });
  await page.addInitScript(() => {
    window.testPad = { id: 'Test Standard Controller', index: 0, connected: true, mapping: 'standard', timestamp: 1, axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [structuredClone(window.testPad), null, null, null] });
  });
  await page.goto('/?game=red');
  const frame = await boot(page);
  await expect(frame.locator('canvas')).toBeVisible();
  await frame.evaluate(() => {
    const gm = window.EJS_emulator.gameManager, original = gm.simulateInput.bind(gm);
    window.inputs = [];
    gm.simulateInput = (...args) => { window.inputs.push(args); return original(...args); };
    window.focus();
  });
  await page.keyboard.press('z');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => frame.evaluate(() => window.inputs.some(v => v[1] === 8 && v[2] === 1))).toBe(true);
  await expect.poll(() => frame.evaluate(() => window.inputs.some(v => v[1] === 4 && v[2] === 1))).toBe(true);
  await frame.evaluate(() => { window.inputs = []; window.testPad.buttons[0] = { pressed: true, touched: true, value: 1 }; });
  await expect.poll(() => frame.evaluate(() => window.inputs.some(v => v[1] === 8 && v[2] === 1))).toBe(true);
  await frame.evaluate(() => { window.testPad.buttons[0] = { pressed: false, touched: false, value: 0 }; window.testPad.axes[0] = 1; });
  await expect.poll(() => frame.evaluate(() => window.inputs.some(v => v[1] === 7 && v[2] === 1))).toBe(true);
  await frame.evaluate(() => { window.testPad.axes[0] = 0; });
  await expect.poll(() => frame.evaluate(() => window.inputs.some(v => v[1] === 7 && v[2] === 0))).toBe(true);
  await page.locator('[data-game="blue"]').click();
  await expect(page.locator('#game-title')).toHaveText('Pokémon Blue');
  await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 30_000 });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('quick save, reload, backup round-trip, corruption rejection and per-ROM isolation', async ({ page }) => {
  await page.goto('/?game=red');
  let frame = await boot(page);
  await page.locator('#pause').click();
  await expect(page.locator('#status')).toContainText('Đã tạm dừng');
  await page.locator('#quick-save').click();
  await expect(page.locator('#status')).toContainText('Đã lưu nhanh');
  const savedState = await frame.evaluate(() => Array.from(window.EJS_emulator.gameManager.getState()));
  await page.locator('#quick-load').click();
  await expect(page.locator('#status')).toContainText('Đã tải bản lưu nhanh');
  // Core-only padding / audio bookkeeping can change on an actual load. Check
  // the complete 8 KiB of game WRAM, rather than relying on a no-op paused load.
  const ram = state => {
    const bytes = Buffer.from(state), start = bytes.indexOf(Buffer.from('wram\0')) + 8;
    expect(start).toBeGreaterThan(8);
    return bytes.subarray(start, start + 8192);
  };
  expect(ram(await frame.evaluate(() => Array.from(window.EJS_emulator.gameManager.getState())))).toEqual(ram(savedState));
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPromise;
  const path = await download.path();
  const { readFile } = await import('node:fs/promises');
  const backup = JSON.parse(await readFile(path, 'utf8'));
  expect(backup.sha1).toBe('ea9bcae617fdf159b045185467ae58b2e4a48b9a');
  expect(backup.battery).toBeTruthy();
  await page.locator('#import-file').setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#status')).toContainText('Đã nhập save');
  const corrupted = { ...backup, stateSha256: 'invalid' };
  await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(corrupted)) });
  await expect(page.locator('#status')).toContainText('Checksum save state không hợp lệ');
  await page.reload();
  await expect(page.locator('#quick-time')).not.toHaveText('Chưa có');
  frame = await boot(page);
  await expect(page.locator('#status')).toContainText('Đã tiếp tục');
  const auto = await frame.evaluate(async () => (await (await import('/src/storage.js')).readSaves((await import('/src/games.js')).games.red)).auto.updatedAt);
  await expect.poll(() => frame.evaluate(async () => (await (await import('/src/storage.js')).readSaves((await import('/src/games.js')).games.red)).auto.updatedAt), { timeout: 20_000, intervals: [1000] }).toBeGreaterThan(auto);
  await page.locator('[data-game="blue"]').click();
  await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('#quick-time')).toHaveText('Chưa có');
  await page.locator('#import-file').setInputFiles({ name: 'wrong-game.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#status')).toContainText('không đúng phiên bản game');
  await page.locator('[data-game="red"]').click();
  await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('#quick-time')).not.toHaveText('Chưa có');
  await expect(page.locator('#status')).toContainText('Đã tiếp tục');
});

test('mobile layout stays inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await boot(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
