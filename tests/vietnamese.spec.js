import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const encoding = JSON.parse(await readFile(new URL('../../pokered/locale/vi/encoding.json', import.meta.url), 'utf8'));
const bytes = text => [...text].map(c => encoding[c] ?? (c === ' ' ? 0x7f : c === '!' ? 0xe7 : 0x80 + c.charCodeAt(0) - 65));
async function hasText(frame, text) {
  return frame.evaluate(pattern => {
    const state = window.EJS_emulator.gameManager.getState();
    return state.some((_, i) => pattern.every((v,j) => state[i+j] === v));
  }, bytes(text));
}
async function press(page, frame, key) {
  const n = await frame.evaluate(() => window.EJS_emulator.gameManager.functions.getFrameNum());
  await frame.evaluate(() => window.player.focus());
  await page.keyboard.down(key);
  await expect.poll(() => frame.evaluate(() => window.EJS_emulator.gameManager.functions.getFrameNum())).toBeGreaterThan(n + 3);
  await page.keyboard.up(key);
}
for (const game of ['red-vi', 'blue-vi']) {
  test(`${game}: Vietnamese menu and accented Oak dialogue execute inside the ROM`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`/?game=${game}`);
    await expect(page.locator('#language')).toHaveValue('vi');
    await page.locator('#play').click();
    await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 30_000 });
    const frame = page.frames().find(f => f.url().includes('emulator.html'));
    // The serialized emulation state includes WRAM / tile maps, not ROM text.
    // Detect glyph bytes in live memory to verify the actual translated game,
    // independently of the surrounding website's Vietnamese labels.
    await expect.poll(() => frame.evaluate(() => window.EJS_emulator.gameManager.functions.getFrameNum()), { timeout: 35_000 }).toBeGreaterThan(1500);
    for (let attempt = 0; attempt < 4 && !await hasText(frame, 'CHƠI MỚI'); attempt++) {
      await press(page, frame, 'Enter');
      try { await expect.poll(() => hasText(frame, 'CHƠI MỚI'), { timeout: 1500, intervals: [100] }).toBe(true); } catch {}
    }
    await expect.poll(() => hasText(frame, 'CHƠI MỚI')).toBe(true);
    await page.screenshot({ path: `test-results/${game}-menu.png`, fullPage: true });
    await press(page, frame, 'z');
    await expect.poll(() => hasText(frame, 'CHÀO CHÁU!'), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => hasText(frame, 'CHÀO MỪNG ĐẾN'), { timeout: 5000 }).toBe(true);
    await page.locator('#pause').click();
    await expect(page.locator('#status')).toContainText('Đã tạm dừng');
    await page.screenshot({ path: `test-results/${game}-oak.png`, fullPage: true });
    const saving = await frame.evaluate(() => window.player.exportBackup());
    expect(JSON.parse(saving).game).toBe(game);
    expect(errors).toEqual([]);
  });
}
