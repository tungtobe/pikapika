import { getGame } from './games.js';
import { readSaves, writeSlot, toBase64, fromBase64 } from './storage.js';

const game = getGame(new URLSearchParams(location.search).get('game'));
// 4.2.3 hard-codes its update metadata URL. Keep that one fetch local too,
// without changing the vendored runtime or its pinned checksums.
const originalFetch = window.fetch.bind(window);
window.fetch = (input, options) => originalFetch(
  input === 'https://cdn.emulatorjs.org/stable/data/version.json' ? '/emulatorjs/version.json' : input,
  options,
);
let ready = false;
let saving;
let restoring = false;
let audioReady;
const notify = (type, data = {}) => parent.postMessage({ app: 'pokered-player', type, game: game.id, ...data }, location.origin);
const manager = () => {
  if (!ready) throw new Error('Trò chơi chưa sẵn sàng.');
  return window.EJS_emulator.gameManager;
};
async function digest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
function flushBattery(gm) {
  gm.saveSaveFiles();
  return new Promise((resolve, reject) => gm.FS.syncfs(false, error => error ? reject(error) : resolve()));
}
function save(slot = 'auto') {
  // Capture synchronously on visibilitychange, before iOS suspends this page.
  // Commit our snapshot first; a slow battery filesystem flush must not delay it.
  const gm = manager();
  const snapshot = { state: gm.getState().slice(), updatedAt: Date.now() };
  const persist = async () => {
    await writeSlot(game, slot, snapshot);
    notify('saved', { slot, updatedAt: snapshot.updatedAt });
    await flushBattery(gm);
    return snapshot;
  };
  const pending = saving ? saving.catch(() => {}).then(persist) : persist();
  saving = pending;
  pending.finally(() => { if (saving === pending) saving = undefined; }).catch(() => {});
  return pending;
}
let backgrounded = false;
const heldTouch = new Set();
function releaseInputs() {
  if (!ready) return;
  for (const button of [0, 2, 3, 4, 5, 6, 7, 8]) manager().simulateInput(0, button, 0);
  heldTouch.clear();
}
async function unlockAudio() {
  const ctx = window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx;
  if (ctx && ctx.state !== 'running') await ctx.resume();
  const active = ctx?.state === 'running';
  if (active) audioReady?.();
  return active;
}
function suspend() {
  if (!ready || backgrounded) return;
  backgrounded = true;
  releaseInputs();
  window.EJS_emulator.pause();
  notify('paused');
  if (!restoring) save().catch(e => notify('error', { message: e.message }));
}
function workRAM(state) {
  // Pinned Gambatte states contain tagged fields: name + NUL + uint24 length.
  const tag = [119, 114, 97, 109, 0]; // wram
  const index = state.findIndex((_, i) => tag.every((v, j) => state[i + j] === v));
  const start = index + tag.length;
  const size = (state[start] << 16) | (state[start + 1] << 8) | state[start + 2];
  if (index < 0 || size !== 8192 || start + 3 + size > state.length) throw new Error('Save không có bộ nhớ Gambatte hợp lệ.');
  return state.subarray(start + 3, start + 3 + size);
}
async function restoreState(state) {
  const emu = window.EJS_emulator, gm = emu.gameManager;
  const expected = workRAM(state);
  const wasPaused = emu.paused;
  restoring = true;
  try {
    // Native load_state queues a RetroArch task. A paused main loop never drains
    // that queue. Run until WRAM has actually been restored at a frame boundary.
    gm.loadState(state);
    emu.play();
    await new Promise((resolve, reject) => {
      let activeFrames = 0;
      function check() {
        try {
          const actual = workRAM(gm.getState());
          if (expected.every((v, i) => v === actual[i])) { resolve(); return; }
          if (++activeFrames > 300) { reject(new Error('Không khôi phục được save. Bản lưu trên máy vẫn được giữ.')); return; }
          requestAnimationFrame(check);
        } catch (e) { reject(e); }
      }
      requestAnimationFrame(check);
    });
  } finally {
    restoring = false;
    if (wasPaused || backgrounded) emu.pause();
  }
}
async function loadQuick() {
  const snapshot = (await readSaves(game)).quick;
  if (!snapshot) throw new Error('Chưa có bản lưu nhanh cho phiên bản này.');
  await restoreState(snapshot.state);
  await save();
  notify('message', { message: 'Đã tải bản lưu nhanh.' });
}
async function exportBackup() {
  const snapshot = await save();
  const battery = manager().getSaveFile(false);
  return JSON.stringify({ format: 'pokered-player', version: 1, emulator: '4.2.3', core: 'gambatte',
    game: game.id, sha1: game.sha1, savedAt: snapshot.updatedAt,
    state: toBase64(snapshot.state), stateSha256: await digest(snapshot.state),
    battery: battery ? toBase64(battery) : null, batterySha256: battery ? await digest(battery) : null });
}
async function importBackup(text) {
  const data = JSON.parse(text);
  if (data.format !== 'pokered-player' || data.version !== 1 || data.sha1 !== game.sha1 ||
      data.game !== game.id || data.core !== 'gambatte' || data.emulator !== '4.2.3') {
    throw new Error('File save không đúng phiên bản game hoặc EmulatorJS.');
  }
  const state = fromBase64(data.state);
  if (!state.length || state.length !== manager().getState().length) throw new Error('Save state có kích thước không hợp lệ.');
  if (await digest(state) !== data.stateSha256) throw new Error('Checksum save state không hợp lệ.');
  const battery = data.battery === null ? null : fromBase64(data.battery);
  if (battery && battery.length !== 32768 && battery.length !== 32768 + 48) throw new Error('Battery save có kích thước không hợp lệ.');
  if (battery && await digest(battery) !== data.batterySha256) throw new Error('Checksum battery save không hợp lệ.');
  // Validate the entire file before changing emulator memory or persisted saves.
  if (saving) await saving;
  const gm = manager();
  workRAM(state);
  await restoreState(state);
  if (battery) {
    const path = gm.getSaveFilePath();
    gm.FS.writeFile(path, battery);
    gm.loadSaveFiles();
  }
  await save('quick');
  await save('auto');
}
window.player = {
  save, loadQuick, exportBackup, importBackup, unlockAudio, suspend,
  input(button, pressed) {
    if (![0, 2, 3, 4, 5, 6, 7, 8].includes(button) || !ready) return;
    if (pressed) { heldTouch.add(button); unlockAudio().catch(() => {}); }
    else heldTouch.delete(button);
    manager().simulateInput(0, button, pressed ? 1 : 0);
  },
  pause() {
    releaseInputs(); window.EJS_emulator.pause();
    // RetroArch stops at the next frame boundary. Let that frame finish before
    // an explicit checkpoint; the background path still captures immediately.
    return new Promise(resolve => setTimeout(resolve, 50));
  },
  resume() { backgrounded = false; unlockAudio().catch(() => {}); window.EJS_emulator.play(); },
  focus() { window.focus(); window.EJS_emulator.elements.parent.focus(); },
  get ready() { return ready; },
};

try {
  // Fail early instead of accidentally feeding Vite's HTML fallback to the core.
  const response = await fetch(`/roms/${game.file}`);
  if (!response.ok) throw new Error('Không tải được ROM. Hãy kiểm tra kết nối hoặc tải lại trang.');
  const rom = await response.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', rom)), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== game.sha1) throw new Error('Dữ liệu game không toàn vẹn. Hãy kết nối mạng và cập nhật ứng dụng.');
  const saves = await readSaves(game);
  const snapshot = saves.auto || saves.quick;
  Object.assign(window, {
    EJS_player: '#game', EJS_core: 'gambatte', EJS_gameUrl: `/roms/${game.file}`,
    EJS_gameName: game.file.replace('.gbc', ''), EJS_pathtodata: '/emulatorjs/',
    EJS_startOnLoaded: true, EJS_language: 'en-US', EJS_disableAutoLang: false,
    EJS_color: game.color, EJS_backgroundColor: '#10191b', EJS_threads: false,
    EJS_volume: 0.55,
    EJS_defaultOptions: { 'save-state-location': 'browser', 'virtual-gamepad': 'disabled' },
    EJS_defaultControls: { 0: {
      0: { value: 'x', value2: 'BUTTON_2' },
      2: { value: 'shift', value2: 'SELECT' },
      3: { value: 'enter', value2: 'START' },
      4: { value: 'up arrow', value2: 'DPAD_UP' },
      5: { value: 'down arrow', value2: 'DPAD_DOWN' },
      6: { value: 'left arrow', value2: 'DPAD_LEFT' },
      7: { value: 'right arrow', value2: 'DPAD_RIGHT' },
      8: { value: 'z', value2: 'BUTTON_1' },
    }, 1: {}, 2: {}, 3: {} },
    EJS_Buttons: { saveState: false, loadState: false, quickSave: false, quickLoad: false, cheat: false, netplay: false, playPause: false, exitEmulation: false },
    EJS_onGameStart: () => {
      setTimeout(async () => {
        try {
          const audio = window.EJS_emulator.Module.AL?.currentCtx?.audioCtx;
          if (audio && audio.state !== 'running') {
            notify('gesture');
            await new Promise(resolve => {
              const check = () => {
                if (audio.state !== 'running') return;
                audio.removeEventListener('statechange', check);
                audioReady = undefined;
                resolve();
              };
              audioReady = check;
              audio.addEventListener('statechange', check);
              check();
            });
          }
          if (snapshot) await restoreState(snapshot.state);
          ready = true;
          // 4.2.3 polls once in its constructor before registering its connected
          // listener. Assign a controller that was already connected at boot.
          const emu = window.EJS_emulator;
          const connected = emu.gamepad.gamepads[0];
          if (connected && !emu.gamepadSelection[0]) {
            emu.gamepadSelection[0] = `${connected.id}_${connected.index}`;
            emu.updateGamepadLabels();
          }
          notify('ready', { resumed: Boolean(snapshot) });
          if (document.hidden) suspend();
          window.focus();
          requestAnimationFrame(pollStick);
          setInterval(() => { if (!restoring) save().catch(e => notify('error', { message: e.message })); }, 5_000);
        } catch (e) { notify('error', { message: e.message }); }
      }, 100);
    },
  });
  const script = document.createElement('script');
  script.src = '/emulatorjs/loader.js';
  script.onerror = () => notify('error', { message: 'Không tải được trình giả lập. Hãy kết nối mạng và tải lại trang.' });
  document.body.append(script);
} catch (error) { notify('error', { message: error.message }); }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspend();
});
// Gambatte expects digital directions; translate the left stick with a dead zone.
let previousStick = [false, false, false, false];
function pollStick() {
  const emu = window.EJS_emulator;
  const selection = emu.gamepadSelection?.[0];
  let pad;
  try { pad = Array.from(navigator.getGamepads?.() || []).find(p => p && `${p.id}_${p.index}` === selection); } catch { /* Gamepad is optional. */ }
  const x = pad?.axes[0] || 0, y = pad?.axes[1] || 0;
  const active = [y < -0.45, y > 0.45, x < -0.45, x > 0.45];
  active.forEach((pressed, i) => {
    if (pressed !== previousStick[i]) emu.gameManager.simulateInput(0, i + 4, pressed || heldTouch.has(i + 4) || pad?.buttons[i + 12]?.pressed ? 1 : 0);
  });
  previousStick = active;
  requestAnimationFrame(pollStick);
}
window.addEventListener('keydown', event => {
  if (ready && (event.key === 'F6' || event.key === 'F8')) {
    event.preventDefault();
    (event.key === 'F6' ? save('quick') : loadQuick()).catch(e => notify('error', { message: e.message }));
  }
});

// Also works when Safari requires a fresh gesture after returning to the app.
window.addEventListener('pointerdown', () => unlockAudio().catch(() => {}), { passive: true });
window.addEventListener('keydown', () => unlockAudio().catch(() => {}));
