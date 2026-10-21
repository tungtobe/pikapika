import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { games } from '../src/games.js';
import { stateField, validBattery } from '../src/save-migration.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/red-bedroom.save.json', import.meta.url), 'utf8'));
const state = new Uint8Array(Buffer.from(fixture.state, 'base64'));
const battery = stateField(state, 'sram', 32768);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const timestamp = 1700000000000;

async function revisions(page, id) {
  const original = await readFile(new URL(`../public/roms/${games[id].file}`, import.meta.url));
  let rom, sha1, schema;
  const update = (number, saveSchema = 'pokered-sram-v1') => {
    schema = saveSchema;
    rom = Buffer.from(original);
    // Change only the unused global checksum byte in the header. The game and
    // its SRAM layout remain identical, while the app sees a genuine new ROM.
    rom[0x14f] ^= number;
    sha1 = createHash('sha1').update(rom).digest('hex');
    return sha1;
  };
  await page.route('**/src/games.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\ngames[${JSON.stringify(id)}].sha1 = ${JSON.stringify(sha1)}; games[${JSON.stringify(id)}].saveSchema = ${JSON.stringify(schema)};\n` });
  });
  await page.route(`**/roms/${games[id].file}`, route => route.fulfill({ contentType: 'application/octet-stream', body: rom }));
  return update;
}

async function seed(page, sha1, options = {}) {
  await page.evaluate(async ({ sha1, data, options, timestamp }) => {
    const { fromBase64, readSaves } = await import('/src/storage.js');
    await readSaves({ sha1 });
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pokered-player', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const snapshot = { state: fromBase64(data), updatedAt: timestamp };
    if (options.corrupt) snapshot.state.fill(0);
    const record = { auto: snapshot, ...options.metadata };
    if (options.validQuick) record.quick = { state: fromBase64(data), updatedAt: timestamp - 1000 };
    await new Promise((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite'); tx.objectStore('saves').put(record, sha1);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { sha1, data: fixture.state, options, timestamp });
}

async function boot(page) {
  await page.locator('#play').click();
  await expect.poll(async () => await page.locator('#quick-save').isEnabled() || await page.locator('#resume-overlay').isVisible(), { timeout: 30_000 }).toBe(true);
  if (await page.locator('#resume-overlay').isVisible()) await page.locator('#resume-overlay').click();
  await expect(page.locator('#quick-save')).toBeEnabled({ timeout: 30_000 });
  return page.frames().find(f => f.url().includes('emulator.html'));
}
async function saves(page, sha1, ignoreAutoTime = false) {
  return page.evaluate(async ({ sha1, ignoreAutoTime }) => {
    const { readSaves } = await import('/src/storage.js');
    const record = await readSaves({ sha1 });
    const digest = async bytes => bytes && Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    const summarize = async (snapshot, slot) => snapshot && { stateSha256: await digest(snapshot.state), batterySha256: await digest(snapshot.battery), updatedAt: slot === 'auto' && ignoreAutoTime ? 0 : snapshot.updatedAt };
    return { ...record, auto: await summarize(record.auto, 'auto'), quick: await summarize(record.quick, 'quick') };
  }, { sha1, ignoreAutoTime });
}
async function live(frame, field) {
  return frame.evaluate(async field => Array.from((await import('/src/save-migration.js')).stateField(EJS_emulator.gameManager.getState(), field, field === 'sram' ? 32768 : 8192)), field);
}
async function coreROM(frame) {
  return frame.evaluate(async () => {
    const emu = EJS_emulator, gm = emu.gameManager;
    const bytes = gm.FS.readFile(`/${emu.fileName}`);
    return { hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', bytes)), b => b.toString(16).padStart(2, '0')).join(''), path: gm.getSaveFilePath() };
  });
}
async function press(frame, input) {
  await frame.evaluate(async input => {
    const gm = EJS_emulator.gameManager, n = gm.getFrameNum();
    player.input(input, true);
    await new Promise(resolve => {
      const check = () => gm.getFrameNum() > n + 3 ? resolve() : requestAnimationFrame(check);
      requestAnimationFrame(check);
    });
    player.input(input, false);
  }, input);
  await expect.poll(() => frame.evaluate(() => EJS_emulator.gameManager.getFrameNum())).toBeGreaterThan(10);
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function continueGame(frame) {
  const n = await frame.evaluate(() => {
    const gm = EJS_emulator.gameManager; gm.setFastForwardRatio(10); gm.toggleFastForward(1); return gm.getFrameNum();
  });
  await expect.poll(() => frame.evaluate(() => EJS_emulator.gameManager.getFrameNum()), { timeout: 15_000 }).toBeGreaterThan(n + 1700);
  for (let attempt = 0; attempt < 5 && (await live(frame, 'wram'))[0x1088] !== 2; attempt++) {
    await press(frame, 3);
    try { await expect.poll(async () => (await live(frame, 'wram'))[0x1088], { timeout: 1000 }).toBe(2); } catch {}
  }
  await expect.poll(async () => (await live(frame, 'wram'))[0x1088]).toBe(2);
  // The ROM's own loader verifies the save and copies the trainer name to WRAM.
  expect((await live(frame, 'wram')).slice(0x1158, 0x1163)).toEqual(Array.from(stateField(state, 'wram', 8192).slice(0x1158, 0x1163)));
  await press(frame, 8);
  await press(frame, 8);
  await expect.poll(async () => (await live(frame, 'wram'))[0x135e]).toBe(stateField(state, 'wram', 8192)[0x135e]);
  await frame.evaluate(() => EJS_emulator.gameManager.toggleFastForward(0));
}

for (const id of ['red', 'red-vi']) {
  test(`${id}: migrate a legacy checkpoint to two ROM revisions without deleting old saves`, async ({ page }) => {
    const revision = await revisions(page, id), firstHash = revision(1);
    // The untagged Vietnamese checkpoint came from the previous public ROM.
    const legacySha1 = id === 'red-vi' ? '3df77b1e955a53788f96249bc7309a23b020ca7f' : games[id].sha1;
    await page.goto(`/?game=${id}`);
    // No metadata/battery existed in the original app. A damaged newer auto
    // must not hide an older, valid quick checkpoint.
    await seed(page, legacySha1, { corrupt: true, validQuick: true });
    const original = await saves(page, legacySha1);
    let frame = await boot(page);
    expect((await coreROM(frame)).hash).toBe(firstHash);
    expect((await coreROM(frame)).path).toContain(firstHash);
    await expect(page.locator('#migration-note')).toContainText('Đã chuyển SAVE');
    expect(Buffer.from((await live(frame, 'sram')).slice(0x2000))).toEqual(Buffer.from(battery.slice(0x2000)));
    const first = await saves(page, firstHash);
    expect(first.gameId).toBe(id);
    expect(first.migration.fromSha1).toBe(legacySha1);
    expect(first.auto.stateSha256).not.toBe(fixture.stateSha256); // no old CPU state restored
    expect(await saves(page, legacySha1)).toEqual(original);
    await continueGame(frame);
    await page.locator('#pause').click();
    await expect(page.locator('#status')).toContainText('Đã tạm dừng');
    const beforeUpdate = await saves(page, firstHash);
    const secondHash = revision(2);
    await page.reload();
    frame = await boot(page);
    expect((await coreROM(frame)).hash).toBe(secondHash);
    expect((await coreROM(frame)).path).toContain(secondHash);
    expect((await saves(page, secondHash)).migration.fromSha1).toBe(firstHash);
    expect(await saves(page, firstHash)).toEqual(beforeUpdate);
    await continueGame(frame);
    const migratedAt = (await saves(page, secondHash)).migration.at;
    await page.reload();
    await boot(page);
    expect((await saves(page, secondHash)).migration.at).toBe(migratedAt);
    expect(await saves(page, legacySha1)).toEqual(original);
  });
}

test('old backup files transfer only compatible, intact in-game saves', async ({ page }) => {
  const revision = await revisions(page, 'red'), newHash = revision(1);
  await page.goto('/?game=red');
  const frame = await boot(page);
  const upload = async data => page.locator('#import-file').setInputFiles({ name: 'old.save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  const legacy = { ...fixture, version: 1, saveSchema: undefined };
  await upload(legacy);
  await expect(page.locator('#status')).toContainText('Đã chuyển SAVE');
  expect((await saves(page, newHash)).migration.fromSha1).toBe(games.red.sha1);
  await continueGame(frame);
  await page.locator('#pause').click();
  await expect(page.locator('#status')).toContainText('Đã tạm dừng');
  // A paused game's periodic autosave may still update its timestamp. Rejected
  // imports must preserve the checkpoint bytes, quick-save time and metadata.
  const baseline = await saves(page, newHash, true);
  for (const data of [
    { ...fixture, game: 'blue' },
    { ...fixture, game: 'red-vi' },
    { ...fixture, saveSchema: 'incompatible-layout-v2' },
    { ...legacy, sha1: '1111111111111111111111111111111111111111' },
  ]) {
    await upload(data);
    await expect(page.locator('#status')).toContainText('không đúng phiên bản game');
    expect(await saves(page, newHash, true)).toEqual(baseline);
  }
  await upload({ ...legacy, batterySha256: 'broken' });
  await expect(page.locator('#status')).toContainText('Checksum battery');
  const emptyState = Buffer.from(state);
  stateField(emptyState, 'sram', 32768).fill(0);
  const noGameSave = { ...legacy, state: emptyState.toString('base64'), stateSha256: sha256(emptyState), battery: Buffer.alloc(32768).toString('base64'), batterySha256: sha256(Buffer.alloc(32768)) };
  await upload(noGameSave);
  await expect(page.locator('#status')).toContainText('chưa có SAVE trong game');
  expect(await saves(page, newHash, true)).toEqual(baseline);
});

test('automatic migration never crosses games/languages/layouts or replaces an existing checkpoint', async ({ page }) => {
  const revision = await revisions(page, 'red'), hash = revision(1);
  await page.goto('/?game=red');
  await seed(page, games.blue.sha1);
  await seed(page, games['red-vi'].sha1);
  await seed(page, '2222222222222222222222222222222222222222', { metadata: { gameId: 'red', saveSchema: 'other-layout' } });
  let frame = await boot(page);
  expect((await saves(page, hash)).migration).toBeUndefined();
  expect(validBattery(new Uint8Array(await live(frame, 'sram')))).toBe(false);
  // Once a valid current-ROM state exists it wins, even if an old ROM's save
  // is newer. A plain redeploy must preserve the exact current checkpoint.
  await page.locator('#pause').click();
  await expect(page.locator('#status')).toContainText('Đã tạm dừng');
  await seed(page, games.red.sha1);
  await page.reload();
  frame = await boot(page);
  expect((await saves(page, hash)).migration).toBeUndefined();
  expect(validBattery(new Uint8Array(await live(frame, 'sram')))).toBe(false);
});

test('a failed native transfer rolls back without replacing the current save', async ({ page }) => {
  const revision = await revisions(page, 'red'), hash = revision(1);
  await page.goto('/?game=red');
  const frame = await boot(page);
  await page.locator('#pause').click();
  await expect(page.locator('#status')).toContainText('Đã tạm dừng');
  const before = await saves(page, hash), ram = await live(frame, 'wram');
  await frame.evaluate(() => { EJS_emulator.gameManager.loadSaveFiles = () => {}; });
  await page.locator('#import-file').setInputFiles({ name: 'old.save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.locator('#status')).toContainText('Chưa chuyển được SAVE', { timeout: 15_000 });
  expect(await saves(page, hash)).toEqual(before);
  expect(await live(frame, 'wram')).toEqual(ram);
});

test('legacy checkpoints without a valid in-game SAVE show a recovery hint', async ({ page }) => {
  const revision = await revisions(page, 'red'), hash = revision(1);
  await page.goto('/?game=red');
  await seed(page, games.red.sha1, { corrupt: true });
  const original = await saves(page, games.red.sha1);
  await boot(page);
  await expect(page.locator('#migration-note')).toContainText('chưa tìm thấy SAVE');
  expect((await saves(page, hash)).migration).toBeUndefined();
  expect(await saves(page, games.red.sha1)).toEqual(original);
});

test('native SRAM files cannot bypass an incompatible save schema after deployment', async ({ page }) => {
  const revision = await revisions(page, 'red'), firstHash = revision(1);
  await page.goto('/?game=red');
  let frame = await boot(page);
  await page.locator('#import-file').setInputFiles({ name: 'old.save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.locator('#status')).toContainText('Đã chuyển SAVE');
  expect(validBattery(new Uint8Array(await live(frame, 'sram')))).toBe(true);
  await page.locator('#pause').click();
  await expect(page.locator('#status')).toContainText('Đã tạm dừng');
  const original = await saves(page, firstHash);
  const secondHash = revision(2, 'pokered-sram-v2');
  await page.reload();
  frame = await boot(page);
  expect((await coreROM(frame)).hash).toBe(secondHash);
  expect((await coreROM(frame)).path).toContain(secondHash);
  expect(validBattery(new Uint8Array(await live(frame, 'sram')))).toBe(false);
  expect((await saves(page, secondHash)).migration).toBeUndefined();
  expect(await saves(page, firstHash)).toEqual(original);
});
