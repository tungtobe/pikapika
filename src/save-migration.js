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

export function validBattery(bytes) {
  if (!(bytes instanceof Uint8Array) || ![32768, 32816].includes(bytes.length)) return false;
  // pokered/ram/sram.asm: bank 1, sGameData=$a598 .. sMainDataCheckSum=$b523.
  // Exactly the complemented sum checked by the original game's LoadMainData.
  const name = bytes.subarray(0x2598, 0x2598 + 11);
  if ([0, 0x50, 0xff].includes(name[0]) || !name.includes(0x50)) return false;
  let sum = 0;
  for (let i = 0x2598; i < 0x3523; i++) sum = (sum + bytes[i]) & 255;
  return (sum ^ 255) === bytes[0x3523];
}

export function snapshotBattery(snapshot) {
  // SRAM embedded in the state belongs to that precise checkpoint. An old
  // native filesystem copy could be stale, so prefer the captured state.
  if (snapshot?.state) {
    try {
      const battery = stateField(snapshot.state, 'sram', 32768);
      if (validBattery(battery)) return battery.slice();
    } catch { /* Other snapshots may still contain a valid battery. */ }
  }
  return validBattery(snapshot?.battery) ? snapshot.battery.slice(0, 32768) : null;
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
      const snapshot = entry[slot], battery = snapshotBattery(snapshot);
      if (battery) candidates.push({ battery, fromSha1: entry.sha1, sourceUpdatedAt: snapshot.updatedAt || 0 });
    }
  }
  return candidates.sort((a, b) => b.sourceUpdatedAt - a.sourceUpdatedAt)[0] || (previousSave ? { unavailable: true } : undefined);
}
