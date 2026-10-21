import './style.css';
import { games, getGame } from './games.js';
import { readSaves } from './storage.js';
import { setupPWA } from './pwa.js';
import { setupTouch } from './touch.js';
const $ = id => document.getElementById(id);
let previousGame;
try { previousGame = localStorage.getItem('pokered-player:last-game'); } catch { /* Storage may be restricted. */ }
// Home opens the Vietnamese edition of the last Red/Blue choice. Explicit
// ROM links and the language selector still allow the English editions.
const requestedGame = new URLSearchParams(location.search).get('game');
let game = getGame(requestedGame || `${getGame(previousGame).base}-vi`);
let ready = false;
let paused = false;
let busy = false;
let migrationWarning = '';
let bootTimeout;
let releaseTouch = () => {};
function showPause(value) {
  paused = value;
  releaseTouch();
  $('pause').textContent = value ? '▶ Tiếp tục' : 'Ⅱ Tạm dừng';
  $('runtime-status').textContent = value ? 'TẠM DỪNG' : 'ĐANG CHƠI';
  $('resume-overlay').hidden = !value;
}
const frame = $('emulator');
const runtime = () => frame.contentWindow.player;
function status(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}
async function updateTimes() {
  const id = game.id;
  const saves = await readSaves(game);
  if (game.id !== id) return;
  for (const slot of ['auto', 'quick']) {
    $(`${slot}-time`).textContent = saves[slot]
      ? new Date(saves[slot].updatedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Chưa có';
  }
  $('migration-note').textContent = migrationWarning || (saves.migration
    ? 'Đã chuyển SAVE từ ROM cũ. Sau khi khởi động lại game, chọn TIẾP TỤC / CONTINUE để chơi từ mốc SAVE trong game.'
    : 'Trước khi cập nhật ROM, hãy dùng START → SAVE trong game. Web tự chuyển mốc SAVE sang bản ROM tương thích mới; lưu nhanh vẫn thuộc ROM cũ.');
}
function setControls() {
  document.querySelectorAll('[data-runtime]').forEach(button => button.disabled = !ready || busy);
  document.querySelectorAll('button[data-game]').forEach(button => button.disabled = busy);
  $('language').disabled = busy;
}
function selectGame(id) {
  game = getGame(id);
  migrationWarning = '';
  try { localStorage.setItem('pokered-player:last-game', game.id); } catch { /* IndexedDB saves report their own errors. */ }
  document.documentElement.dataset.game = game.base;
  $('language').value = game.language;
  $('version-label').textContent = game.language === 'vi' ? 'GAME BOY · VI' : 'GAME BOY';
  $('game-title').textContent = game.name;
  document.title = `${game.name} · Pokémon Pocket`;
  document.querySelectorAll('button[data-game]').forEach(button => {
    const selected = button.dataset.game === game.base;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const url = new URL(location.href);
  url.searchParams.set('game', game.id);
  history.replaceState(null, '', url);
  updateTimes().catch(e => status(`Không truy cập được bộ nhớ trình duyệt: ${e.message}`, true));
}
async function action(fn, message, focus = true) {
  if (!ready || busy) return;
  busy = true;
  setControls();
  try { await fn(); if (message) status(message); if (focus) runtime().focus(); }
  catch (error) { status(error.message, true); }
  finally { busy = false; setControls(); }
}
function start() {
  ready = false;
  showPause(false);
  setControls();
  $('welcome').hidden = true;
  frame.hidden = false;
  frame.src = `/emulator.html?game=${game.id}`;
  $('runtime-status').textContent = 'ĐANG KHỞI ĐỘNG';
  status(`Đang tải ${game.name}…`);
  clearTimeout(bootTimeout);
  bootTimeout = setTimeout(() => {
    if (!ready && $('resume-overlay').hidden) { status('Khởi động lâu hơn dự kiến. Hãy kiểm tra kết nối mạng rồi tải lại trang.', true); }
  }, 45_000);
}
$('play').addEventListener('click', start);
async function switchGame(id) {
  if (id === game.id || busy) return;
  busy = true;
  setControls();
  try {
    releaseTouch();
    if (ready) await runtime().save();
    const playing = Boolean(frame.getAttribute('src'));
    ready = false;
    selectGame(id);
    if (playing) start();
  } catch (e) { status(`Không thể lưu trước khi đổi game: ${e.message}`, true); }
  finally { busy = false; setControls(); $('language').value = game.language; }
}
document.querySelectorAll('button[data-game]').forEach(button => button.addEventListener('click', () => {
  const id = button.dataset.game + (game.language === 'vi' ? '-vi' : '');
  switchGame(id);
}));
$('language').addEventListener('change', () => switchGame(game.base + ($('language').value === 'vi' ? '-vi' : '')));
$('language-vi').disabled = !games['red-vi'];
$('quick-save').addEventListener('click', () => action(() => runtime().save('quick'), 'Đã lưu nhanh. F8 để quay lại mốc này.'));
$('quick-load').addEventListener('click', () => action(() => runtime().loadQuick()));
function resume() {
  if (!ready) {
    runtime()?.unlockAudio().catch(e => status(`Hãy chạm lại để bật âm thanh: ${e.message}`, true));
    return;
  }
  if (busy) return;
  runtime().resume();
  showPause(false);
  runtime().focus();
}
$('pause').addEventListener('click', () => {
  if (!ready || busy) return;
  if (paused) { resume(); return; }
  showPause(true);
  action(async () => { await runtime().pause(); await runtime().save(); }, 'Đã tạm dừng và lưu tiến trình.', false);
});
$('resume-overlay').addEventListener('click', resume);
$('sound').addEventListener('click', () => {
  if (!ready) return;
  runtime().unlockAudio().then(active => status(active ? 'Đã bật âm thanh.' : 'Chạm vào màn hình game hoặc nút A để bật âm thanh.')).catch(e => status(e.message, true));
});
$('fullscreen').addEventListener('click', async () => {
  const area = document.querySelector('.play-area');
  if (document.fullscreenElement) { await document.exitFullscreen(); return; }
  if (document.body.classList.contains('focus-mode')) {
    document.body.classList.remove('focus-mode'); $('fullscreen').setAttribute('aria-label', 'Toàn màn hình'); return;
  }
  // iPhone uses a safe-area-aware play view when element fullscreen is absent.
  if (area.requestFullscreen) {
    try { await area.requestFullscreen(); return; } catch { /* use the same fallback */ }
  }
  document.body.classList.add('focus-mode');
  $('fullscreen').setAttribute('aria-label', 'Thoát toàn màn hình');
});
window.addEventListener('keydown', e => { if (e.key === 'Escape') document.body.classList.remove('focus-mode'); });
$('export').addEventListener('click', () => action(async () => {
  const json = await runtime().exportBackup();
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${game.file.replace('.gbc', '')}-${new Date().toISOString().replace(/[:.]/g, '-')}.save.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}, 'Đã xuất bản sao lưu gồm save state và battery save.'));
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', () => {
  const file = $('import-file').files[0];
  if (!file) return;
  action(async () => {
    if (file.size > 20_000_000) throw new Error('File save quá lớn.');
    const result = await runtime().importBackup(await file.text());
    migrationWarning = '';
    await updateTimes();
    status(result.migrated ? 'Đã chuyển SAVE từ ROM cũ. Chọn TIẾP TỤC / CONTINUE trong game.' : 'Đã nhập save và tiếp tục cuộc phiêu lưu.');
  });
  $('import-file').value = '';
});
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow ||
      event.data?.app !== 'pokered-player' || event.data.game !== game.id) return;
  const message = event.data;
  if (message.type === 'gesture') {
    $('resume-overlay').hidden = false;
    $('runtime-status').textContent = 'CHẠM ĐỂ CHƠI';
    status('Chạm Tiếp tục chơi để bật âm thanh và khởi động game.');
  } else if (message.type === 'ready') {
    ready = true;
    migrationWarning = message.migrationUnavailable ? 'Có save ROM cũ nhưng chưa tìm thấy SAVE trong game hợp lệ. Bản cũ vẫn được giữ; mở lại ROM cũ, dùng START → SAVE rồi xuất file để nhập vào bản mới.' : '';
    updateTimes().catch(e => status(e.message, true));
    showPause(false);
    if (matchMedia('(pointer: coarse)').matches) document.querySelector('.play-area').scrollIntoView({ block: 'start' });
    clearTimeout(bootTimeout);
    setControls();
    $('runtime-status').textContent = 'ĐANG CHƠI';
    status(message.migrated ? 'Đã chuyển SAVE từ ROM cũ. Chọn TIẾP TỤC / CONTINUE trong game.' : message.resumed ? 'Đã tiếp tục từ tiến trình gần nhất. Tự lưu mỗi 5 giây.' : 'Đang chơi. Tiến trình được tự lưu mỗi 5 giây.');
  } else if (message.type === 'paused') {
    showPause(true);
    status('Đã tạm dừng khi chuyển ứng dụng. Chạm Tiếp tục để chơi.');
  } else if (message.type === 'saved') {
    updateTimes().catch(e => status(e.message, true));
    if (!busy && !paused) status(message.slot === 'quick' ? 'Đã lưu nhanh. F8 để quay lại mốc này.' : 'Đã tự lưu tiến trình vào trình duyệt.');
  } else if (message.type === 'error') status(message.message, true);
  else if (message.type === 'message') status(message.message);
});
window.addEventListener('keydown', event => {
  if ((event.key === 'F6' || event.key === 'F8') && ready) {
    event.preventDefault();
    $(event.key === 'F6' ? 'quick-save' : 'quick-load').click();
  }
});
function updateGamepads() {
  let connected = [];
  try { connected = Array.from(navigator.getGamepads?.() || []).filter(Boolean); } catch { /* Optional on unsupported browsers. */ }
  $('gamepad-status').textContent = connected.length ? `Đã kết nối: ${connected[0].id}` : 'Gamepad sẵn sàng kết nối';
}
window.addEventListener('gamepadconnected', updateGamepads);
window.addEventListener('gamepaddisconnected', updateGamepads);
setInterval(updateGamepads, 2000);
selectGame(game.id);
updateGamepads();

releaseTouch = setupTouch({ runtime, playable: () => ready && !paused && !busy, onError: status });
setupPWA({ report: status, saveBeforeUpdate: async () => {
  if (busy) throw new Error('Đang xử lý save. Hãy thử lại sau khi hoàn tất.');
  if (ready) { showPause(true); await runtime().pause(); await runtime().save(); }
} });
