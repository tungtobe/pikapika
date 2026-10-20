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
    request.onsuccess = () => store.put({ ...request.result, [slot]: snapshot }, game.sha1);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Không thể lưu dữ liệu.'));
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
