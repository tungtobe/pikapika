import { legacySaveGames } from './games.js';
import { readSaveEntries } from './storage.js';

// Parse the pinned Gambatte serializer, rather than searching arbitrary SRAM
// payloads for tag strings. This also reads snapshots made by the old web app.
export function stateField(state, name, expectedSize) {
  if (!(state instanceof Uint8Array) || state.length < 21 ||
      new TextDecoder().decode(state.subarray(0, 12)) !== 'RASTATE\x01MEM ') {
    throw new Error('Save state Gambatte không hợp lệ.');
  }
  const end = 16 + new DataView(state.buffer, state.byteOffset, state.byteLength).getUint32(12, true);
  if (end > state.length || state[16] !== 0 || state[17] !== 1) throw new Error('Định dạng save state không được hỗ trợ.');
  let position = 21 + (state[18] * 65536 + state[19] * 256 + state[20]);
  while (position < end) {
    const zero = state.indexOf(0, position);
    if (zero < position || zero - position > 32 || zero + 4 > end) break;
    const tag = new TextDecoder().decode(state.subarray(position, zero));
    const size = state[zero + 1] * 65536 + state[zero + 2] * 256 + state[zero + 3];
    const start = zero + 4;
    if (start + size > end) break;
    if (tag === name && size === expectedSize) return state.subarray(start, start + size);
    position = start + size;
  }
  throw new Error(`Save state thiếu dữ liệu ${name} hợp lệ.`);
}

// RetroArch wraps mGBA's serializer in the same RASTATE MEM block. Layout from
// mGBA include/mgba/internal/gba/serialize.h: a 0x61000-byte state (EWRAM at
// 0x21000), then extdata headers {u32 tag, i32 size, i64 offset}; tag 2 = save data.
function mgbaState(state) {
  if (!(state instanceof Uint8Array) || state.length < 16 + 0x61000 ||
      new TextDecoder().decode(state.subarray(0, 12)) !== 'RASTATE\x01MEM ') {
    throw new Error('Save state mGBA không hợp lệ.');
  }
  const view = new DataView(state.buffer, state.byteOffset, state.byteLength);
  const size = view.getUint32(12, true);
  if (16 + size > state.length || size < 0x61000) throw new Error('Định dạng save state không được hỗ trợ.');
  return { mem: state.subarray(16, 16 + size), view: new DataView(state.buffer, state.byteOffset + 16, size) };
}
function mgbaSaveData(state, expectedSize) {
  const { mem, view } = mgbaState(state);
  for (let p = 0x61000; p + 16 <= mem.length; p += 16) {
    const tag = view.getUint32(p, true), size = view.getInt32(p + 4, true), offset = Number(view.getBigUint64(p + 8, true));
    if (tag === 0) break;
    if (tag === 2 && size === expectedSize && offset + size <= mem.length) return mem.subarray(offset, offset + size);
  }
  throw new Error('Save state thiếu dữ liệu save hợp lệ.');
}
export const batterySize = core => core === 'mgba' ? 131072 : 32768;
// In-game save memory captured inside a full emulator state.
export function stateBattery(state, core) {
  return core === 'mgba' ? mgbaSaveData(state, 131072) : stateField(state, 'sram', 32768);
}
// RAM that changes little between frames; used to detect a finished state load.
export function stateMemory(state, core) {
  return core === 'mgba' ? mgbaState(state).mem.subarray(0x21000, 0x61000) : stateField(state, 'wram', 8192);
}
// Gambatte restores an identical WRAM; FireRed keeps ticking timers/RNG in EWRAM,
// so allow a 1% difference there (an unrelated state differs far more).
export function sameMemory(expected, actual, core) {
  if (core !== 'mgba') return expected.every((v, i) => v === actual[i]);
  let different = 0;
  for (let i = 0; i < expected.length; i++) if (expected[i] !== actual[i] && ++different > expected.length / 100) return false;
  return true;
}

export function validBattery(bytes, core = 'gambatte') {
  if (core === 'mgba') {
    // pokefirered include/save.h: 4 KiB sectors ending in signature 0x08012025.
    if (!(bytes instanceof Uint8Array) || bytes.length !== 131072) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let sector = 0; sector < 32; sector++) if (view.getUint32(sector * 4096 + 0xff8, true) === 0x08012025) return true;
    return false;
  }
  if (!(bytes instanceof Uint8Array) || ![32768, 32816].includes(bytes.length)) return false;
  // pokered/ram/sram.asm: bank 1, sGameData=$a598 .. sMainDataCheckSum=$b523.
  // Exactly the complemented sum checked by the original game's LoadMainData.
  const name = bytes.subarray(0x2598, 0x2598 + 11);
  if ([0, 0x50, 0xff].includes(name[0]) || !name.includes(0x50)) return false;
  let sum = 0;
  for (let i = 0x2598; i < 0x3523; i++) sum = (sum + bytes[i]) & 255;
  return (sum ^ 255) === bytes[0x3523];
}

export function snapshotBattery(snapshot, core = 'gambatte') {
  // SRAM embedded in the state belongs to that precise checkpoint. An old
  // native filesystem copy could be stale, so prefer the captured state.
  if (snapshot?.state) {
    try {
      const battery = stateBattery(snapshot.state, core);
      if (validBattery(battery, core)) return battery.slice();
    } catch { /* Other snapshots may still contain a valid battery. */ }
  }
  return validBattery(snapshot?.battery, core) ? snapshot.battery.slice(0, batterySize(core)) : null;
}

export function compatibleSave(game, source) {
  if (!/^[a-f0-9]{40}$/.test(source.sha1)) return false;
  if (source.gameId || source.saveSchema) return source.gameId === game.id && source.saveSchema === game.saveSchema;
  return game.saveSchema === 'pokered-sram-v1' && legacySaveGames[source.sha1] === game.id;
}

export async function findMigration(game) {
  const candidates = [];
  let previousSave = false;
  for (const entry of await readSaveEntries()) {
    if (entry.sha1 === game.sha1 || !compatibleSave(game, entry)) continue;
    previousSave ||= Boolean(entry.auto || entry.quick);
    for (const slot of ['auto', 'quick']) {
      const snapshot = entry[slot], battery = snapshotBattery(snapshot, game.core);
      if (battery) candidates.push({ battery, fromSha1: entry.sha1, sourceUpdatedAt: snapshot.updatedAt || 0 });
    }
  }
  return candidates.sort((a, b) => b.sourceUpdatedAt - a.sourceUpdatedAt)[0] || (previousSave ? { unavailable: true } : undefined);
}
