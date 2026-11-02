// One pointer per finger; releasing one finger must not release another's button.
export function setupTouch({ runtime, playable, onError }) {
  const controls = document.getElementById('touch-controls');
  const fingers = new Map();
  const send = (button, pressed) => {
    try { runtime()?.input(Number(button.dataset.input), pressed); }
    catch (e) { onError(e.message, true); }
    button.classList.toggle('pressed', pressed);
  };
  function release(pointerId) {
    const button = fingers.get(pointerId);
    if (!button) return;
    fingers.delete(pointerId);
    if (![...fingers.values()].includes(button)) send(button, false);
  }
  function releaseAll() { for (const id of [...fingers.keys()]) release(id); }
  controls.addEventListener('pointerdown', event => {
    const button = event.target.closest('[data-input]');
    if (!button || button.disabled || !playable()) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    fingers.set(event.pointerId, button);
    send(button, true);
  });
  // Slide between D-pad directions without lifting the finger.
  controls.addEventListener('pointermove', event => {
    const old = fingers.get(event.pointerId);
    if (!old?.closest('.dpad')) return;
    const next = document.elementFromPoint(event.clientX, event.clientY)?.closest('.dpad [data-input]');
    if (old === next) return;
    release(event.pointerId);
    if (next && playable()) { fingers.set(event.pointerId, next); send(next, true); }
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) controls.addEventListener(event, e => release(e.pointerId));
  // iOS starts its long-press selection/callout from touchstart, which preventDefault on pointerdown does not cancel.
  controls.addEventListener('touchstart', e => {
    if (e.target.closest('[data-input]')) e.preventDefault();
  }, { passive: false });
  // Keep the toolbar/status text below the pad from being selected or showing the callout menu.
  const playArea = controls.closest('.play-area') ?? controls;
  for (const type of ['contextmenu', 'selectstart']) playArea.addEventListener(type, e => e.preventDefault());
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  return releaseAll;
}
