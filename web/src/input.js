// Keyboard + pointer-lock mouse + touch, collapsed into one per-frame command:
//   forward -1..1, strafe -1..1, turn -1..1 (left positive), mouseYaw/mousePitch (radians)

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.touch = { move: 0, strafe: 0, turn: 0 };
    this.locked = false;
    this.onEscape = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { if (this.onEscape) this.onEscape(); return; }
      if (RELEVANT.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && this.onEscape) this.onEscape();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    this.initTouch();
  }

  requestLock() {
    if (!this.locked && this.canvas.requestPointerLock) this.canvas.requestPointerLock();
  }
  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  initTouch() {
    // Left half of the screen = virtual stick, right half = look.
    this.touches = new Map();
    const c = this.canvas;
    const start = (t) => {
      const left = t.clientX < window.innerWidth / 2;
      this.touches.set(t.identifier, { left, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY });
    };
    c.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) start(t); e.preventDefault(); }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        if (s.left) {
          this.touch.move = clamp((s.y0 - t.clientY) / 60, -1, 1);
          this.touch.strafe = clamp((t.clientX - s.x0) / 60, -1, 1);
        } else {
          this.mouseDX += t.clientX - s.x;
          this.mouseDY += t.clientY - s.y;
        }
        s.x = t.clientX; s.y = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (s && s.left) { this.touch.move = 0; this.touch.strafe = 0; }
        this.touches.delete(t.identifier);
      }
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);
  }

  sample(classic) {
    const k = this.keys;
    let forward = 0, strafe = 0, turn = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) forward += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) forward -= 1;
    if (classic) {
      if (k.has('KeyA') || k.has('ArrowLeft')) turn += 1;
      if (k.has('KeyD') || k.has('ArrowRight')) turn -= 1;
    } else {
      if (k.has('KeyA')) strafe -= 1;
      if (k.has('KeyD')) strafe += 1;
      if (k.has('ArrowLeft')) turn += 1;
      if (k.has('ArrowRight')) turn -= 1;
    }
    forward = clamp(forward + this.touch.move, -1, 1);
    strafe = clamp(strafe + this.touch.strafe, -1, 1);

    const sens = 0.0022 * this.settings.mouseSensitivity;
    const mouseYaw = classic ? 0 : -this.mouseDX * sens;
    const mousePitch = classic ? 0 : -this.mouseDY * sens * (this.settings.invertY ? -1 : 1);
    this.mouseDX = 0; this.mouseDY = 0;

    return { forward, strafe, turn, mouseYaw, mousePitch };
  }
}

const RELEVANT = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
