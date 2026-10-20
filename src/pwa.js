import { registerSW } from 'virtual:pwa-register';

export function setupPWA({ saveBeforeUpdate, report }) {
  const $ = id => document.getElementById(id);
  let offlineReady = false;
  let updateRequested = false;
  let reloading = false;
  const reloadAfterSave = () => {
    if (updateRequested && !reloading) { reloading = true; location.reload(); }
  };
  navigator.serviceWorker?.addEventListener('controllerchange', reloadAfterSave);
  const connection = () => {
    $('offline-status').textContent = offlineReady
      ? (navigator.onLine ? '✓ Cả 4 ROM đã sẵn sàng chơi offline' : '✓ Đang offline · Có thể tiếp tục chơi')
      : (navigator.onLine ? 'Đang tải dữ liệu để chơi offline…' : 'Chưa tải xong dữ liệu offline. Hãy kết nối mạng.');
  };
  const updateSW = registerSW({
    immediate: true,
    onOfflineReady() { offlineReady = true; connection(); },
    onNeedRefresh() { $('update-app').hidden = false; },
    // Updates triggered in another tab must also wait for this game's save.
    onNeedReload() { if (updateRequested) reloadAfterSave(); else $('update-app').hidden = false; },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      navigator.serviceWorker.ready.then(() => { offlineReady = true; connection(); });
      // Only check; never replace a running game without the user's update action.
      window.addEventListener('online', () => registration.update().catch(() => {}));
    },
    onRegisterError() { $('offline-status').textContent = 'Chưa bật được chế độ offline. Bạn vẫn có thể chơi khi có mạng.'; },
  });
  $('update-app').addEventListener('click', async () => {
    $('update-app').disabled = true;
    try {
      await saveBeforeUpdate();
      updateRequested = true;
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) await updateSW(true);
      else reloadAfterSave();
    }
    catch (e) { report(`Chưa cập nhật: ${e.message}`, true); $('update-app').disabled = false; updateRequested = false; }
  });
  if (import.meta.env.DEV) $('offline-status').textContent = 'Bản phát triển · Offline có trong bản production';
  window.addEventListener('online', connection);
  window.addEventListener('offline', connection);

  let installPrompt;
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const installedHint = () => {
    if (installed()) { $('install-hint').textContent = 'Đã mở dưới dạng ứng dụng. Save được giữ trên thiết bị này.'; $('install').hidden = true; }
  };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event;
    if (!installed()) $('install').hidden = false;
  });
  $('install').addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = undefined; $('install').hidden = true;
  });
  window.addEventListener('appinstalled', installedHint);
  installedHint();
  async function persistence(request = false) {
    try {
      const persistent = request ? await navigator.storage?.persist?.() : await navigator.storage?.persisted?.();
      $('storage-status').textContent = persistent
        ? '✓ Trình duyệt đã cấp chế độ lưu trữ bền vững. Vẫn nên xuất bản sao lưu.'
        : 'Save được lưu trên máy. Hãy xuất bản sao lưu trước khi xóa dữ liệu web hoặc đổi địa chỉ.';
      $('persist-storage').hidden = Boolean(persistent) || !navigator.storage?.persist;
    } catch { $('storage-status').textContent = 'Không kiểm tra được chế độ lưu trữ. Hãy xuất file save để giữ bản sao.'; }
  }
  $('persist-storage').addEventListener('click', () => persistence(true));
  persistence();
}
