import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.locator('#play').click();
  await expect.poll(async () => await page.locator('#quick-save').isEnabled() || await page.locator('#resume-overlay').isVisible(), { timeout: 40_000 }).toBe(true);
  if (await page.locator('#resume-overlay').isVisible()) await page.locator('#resume-overlay').click();
  await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 40_000 });
  return page.frames().find(f => f.url().includes('/emulator.html'));
}
function workRAM(state) {
  // Gambatte serializes tagged fields: NUL-terminated name, 24-bit length, data.
  // Compare the game's WRAM, not core bookkeeping / uninitialized padding.
  const bytes = Buffer.from(state);
  const header = bytes.indexOf(Buffer.from('wram\0')) + 5;
  expect(header).toBeGreaterThan(5);
  const length = bytes.readUIntBE(header, 3);
  expect(length).toBe(8192);
  return bytes.subarray(header + 3, header + 3 + length);
}
const readAuto = page => page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('pokered-player', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  const save = await new Promise((resolve, reject) => {
    const r = db.transaction('saves').objectStore('saves').get('3df77b1e955a53788f96249bc7309a23b020ca7f');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  db.close();
  return save?.auto?.updatedAt || 0;
});

test('all four ROMs and the engine boot offline; device saves survive reopening', async ({ page, context, browser }) => {
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url()); });
  await page.goto('/?game=red-vi');
  await expect(page.locator('#offline-status')).toContainText('4 ROM', { timeout: 40_000 });
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  expect(manifest.display).toBe('standalone');
  expect(manifest.id).toBe('/');
  expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true);
  await context.setOffline(true);
  await page.reload();
  let frame = await boot(page);
  await expect(frame.locator('canvas')).toBeVisible();
  await page.locator('#pause').click();
  await expect(page.locator('#status')).toContainText('Đã tạm dừng');
  await expect.poll(() => readAuto(page)).toBeGreaterThan(0);
  const state = await frame.evaluate(() => Array.from(window.EJS_emulator.gameManager.getState()));
  await page.locator('#quick-save').click();
  await expect(page.locator('#status')).toContainText('Đã lưu nhanh');
  await page.close();
  page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#language')).toHaveValue('vi');
  frame = await boot(page);
  await expect(page.locator('#status')).toContainText('Đã tiếp tục');
  // Stop time, then load the saved checkpoint and compare the actual core memory.
  await page.locator('#pause').click();
  await expect(page.locator('#status')).toContainText('Đã tạm dừng');
  await page.locator('#quick-load').click();
  await expect(page.locator('#status')).toContainText('Đã tải bản lưu nhanh');
  expect(workRAM(await frame.evaluate(() => Array.from(window.EJS_emulator.gameManager.getState())))).toEqual(workRAM(state));
  for (const [language, base] of [['vi', 'blue'], ['en', 'blue'], ['en', 'red']]) {
    if (await page.locator('#language').inputValue() !== language) await page.locator('#language').selectOption(language);
    await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 40_000 });
    await page.locator(`button[data-game="${base}"]`).click();
    await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 40_000 });
    await expect(page.frames().find(f => f.url().includes('/emulator.html')).locator('canvas')).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  // A separate device/browser context has no access to this device's saves.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto('/?game=red-vi');
  await expect(otherPage.locator('#quick-time')).toHaveText('Chưa có');
  await other.close();
});

test('touch is multi-pointer, releases canceled buttons, and saves before background suspension', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?game=red-vi');
  const frame = await boot(page);
  await expect(page.locator('#touch-controls')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await frame.evaluate(() => {
    const gm = window.EJS_emulator.gameManager, original = gm.simulateInput.bind(gm);
    window.inputs = [];
    gm.simulateInput = (...input) => { window.inputs.push(input); return original(...input); };
  });
  await page.evaluate(() => { Element.prototype.setPointerCapture = () => {}; });
  for (const [input, id] of [[4, 21], [8, 22]]) {
    await page.locator(`[data-input="${input}"]`).dispatchEvent('pointerdown', { pointerId: id, pointerType: 'touch', bubbles: true });
  }
  expect(await frame.evaluate(() => window.inputs.filter(v => v[2] === 1).map(v => v[1]))).toEqual([4, 8]);
  await page.locator('[data-input="4"]').dispatchEvent('pointercancel', { pointerId: 21, bubbles: true });
  await expect(page.locator('[data-input="8"]')).toHaveClass(/pressed/);
  await page.locator('[data-input="8"]').dispatchEvent('pointerup', { pointerId: 22, bubbles: true });
  expect(await frame.evaluate(() => window.inputs.slice(-2).map(v => [v[1], v[2]]))).toEqual([[4, 0], [8, 0]]);
  await page.locator('[data-input="8"]').tap();
  expect(await frame.evaluate(() => window.inputs.slice(-2).map(v => [v[1], v[2]]))).toEqual([[8, 1], [8, 0]]);
  const lastSave = await readAuto(page);
  await frame.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#resume-overlay')).toBeVisible();
  await expect(page.locator('#pause')).toContainText('Tiếp tục');
  await expect.poll(() => readAuto(page)).toBeGreaterThan(lastSave);
  await page.locator('#resume-overlay').tap();
  await expect(page.locator('#resume-overlay')).toBeHidden();
  await page.locator('#sound').tap();
  await expect(page.locator('#status')).toContainText('Đã bật âm thanh');
  // Force the iPhone fullscreen fallback even on desktop engines.
  await page.evaluate(() => { document.querySelector('.play-area').requestFullscreen = undefined; });
  await page.locator('#fullscreen').tap();
  await expect(page.locator('body')).toHaveClass(/focus-mode/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(844);
  await page.locator('#fullscreen').tap();
  await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
});


test('a service worker update waits for the user, saves, then reloads', async ({ page }) => {
  const { readFile, writeFile } = await import('node:fs/promises');
  const worker = new URL('../../dist/sw.js', import.meta.url);
  const original = await readFile(worker, 'utf8');
  await page.goto('/?game=red-vi');
  await expect(page.locator('#offline-status')).toContainText('4 ROM', { timeout: 40_000 });
  await boot(page);
  const previousSave = await readAuto(page);
  try {
    await writeFile(worker, original + '\n// Integration test update ' + Date.now() + '\n');
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect(page.locator('#update-app')).toBeVisible({ timeout: 20_000 });
    // A new worker must not interrupt play or automatically reload this page.
    await expect(page.locator('#quick-save')).toBeEnabled();
    const navigated = page.waitForEvent('load');
    await page.locator('#update-app').click();
    await navigated;
    await expect(page.locator('#play')).toBeVisible();
    await expect.poll(() => readAuto(page)).toBeGreaterThan(previousSave);
    await boot(page);
    await expect(page.locator('#status')).toContainText('Đã tiếp tục');
  } finally { await writeFile(worker, original); }
});


test('a required audio gesture can unlock startup and restore an existing save', async ({ page }) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'state');
    const nativeResume = AudioContext.prototype.resume;
    let blocked = true;
    Object.defineProperty(AudioContext.prototype, 'state', { configurable: true, get() { return blocked ? 'suspended' : descriptor.get.call(this); } });
    AudioContext.prototype.resume = function (...args) {
      // Vendor autoplay has no user activation. Only an actual tap may unlock.
      if (window.testAllowAudio) blocked = false;
      return nativeResume.apply(this, args);
    };
  });
  await page.goto('/?game=red-vi');
  await page.locator('#play').click();
  await expect(page.locator('#resume-overlay')).toBeVisible({ timeout: 30_000 });
  await page.frames().find(f => f.url().includes('/emulator.html')).evaluate(() => { window.testAllowAudio = true; });
  await page.locator('#resume-overlay').tap();
  await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#pause').click();
  await expect(page.locator('#status')).toContainText('Đã tạm dừng');
  await expect.poll(() => readAuto(page)).toBeGreaterThan(0);
  await page.reload();
  await page.locator('#play').click();
  await expect(page.locator('#resume-overlay')).toBeVisible({ timeout: 30_000 });
  await page.frames().find(f => f.url().includes('/emulator.html')).evaluate(() => { window.testAllowAudio = true; });
  await page.locator('#resume-overlay').tap();
  await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('#status')).toContainText('Đã tiếp tục');
});
