let connection;
function database() {
  return connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('pokered-player', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
    request.onerror = () => { connection = undefined; reject(request.error); };
  });
}
export async function readSaves(game) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('saves').objectStore('saves').get(game.sha1);
    request.onsuccess = () => resolve(request.result || {});
    request.onerror = () => reject(request.error);
  });
}
export async function writeSlot(game, slot, snapshot) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', 'readwrite');
    const store = tx.objectStore('saves');
    const request = store.get(game.sha1);
    request.onsuccess = () => store.put({ ...request.result, gameId: game.id, saveSchema: game.saveSchema, [slot]: snapshot }, game.sha1);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Không thể lưu dữ liệu.'));
  });
}
export async function readSaveEntries() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const entries = [];
    const request = db.transaction('saves').objectStore('saves').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(entries); return; }
      entries.push({ sha1: cursor.key, ...cursor.value });
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}
// One transaction: an import must never leave only one of the two slots updated.
// The record of the source ROM is deliberately left untouched.
export async function replaceSaves(game, snapshots, migration) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').put({ gameId: game.id, saveSchema: game.saveSchema, ...snapshots, migration }, game.sha1);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Không thể chuyển save.'));
  });
}
export function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function fromBase64(text) {
  if (typeof text !== 'string' || text.length > 16_000_000) throw new Error('Dữ liệu save không hợp lệ.');
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}
