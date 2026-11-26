// Input: keyboard first, mouse second. Arrows or WASD fly the plane,
// Shift / Ctrl work the throttle, Space is the airbrake, P pauses, M mutes.
// Holding the left mouse button and dragging steers too — the pointer's
// offset from where the drag began is the stick.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  // Mouse steering: where the drag started, and where the pointer is now.
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragX = 0;
  let dragY = 0;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    }
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'KeyR') actions |= ACTION_RESTART;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onPointerDown(event) {
    dragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragX = 0;
    dragY = 0;
  }

  function onPointerMove(event) {
    if (!dragging) return;
    dragX = (event.clientX - dragStartX) / 160;
    dragY = (event.clientY - dragStartY) / 160;
  }

  function onPointerUp() {
    dragging = false;
    dragX = 0;
    dragY = 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  /** Stick and throttle for this frame, each in [-1, 1]. */
  function read() {
    let pitch = 0;
    let roll = 0;
    if (keys.has('ArrowUp') || keys.has('KeyW')) pitch -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) pitch += 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (dragging) {
      pitch += clamp(dragY, -1, 1);
      roll += clamp(dragX, -1, 1);
    }
    let throttle = 0;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Equal') || keys.has('NumpadAdd')) throttle += 1;
    if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('Minus') || keys.has('NumpadSubtract')) throttle -= 1;
    return {
      pitch: clamp(pitch, -1, 1),
      roll: clamp(roll, -1, 1),
      throttle,
      brake: keys.has('Space'),
    };
  }

  /** One-shot actions since the last call; reading them clears them. */
  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  function destroy() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  return { read, takeActions, destroy };
}
