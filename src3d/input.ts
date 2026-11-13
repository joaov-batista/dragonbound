/**
 * Input for the 3D world: keyboard + mouse (pointer lock for the camera) and a touch layout
 * (left stick, drag to look, action buttons). Exposes a small polled state.
 */
export type Act = 'jump' | 'interact' | 'food' | 'mount' | 'shoot' | 'dash' | 'sneak' | 'melee' | 'up' | 'down' | 'call' | 'block' | 'map' | 'bag' | 'lock';
const KEYS: Record<string, Act> = {
  Space: 'jump', KeyE: 'interact', KeyF: 'food', KeyR: 'mount', KeyI: 'shoot', KeyK: 'dash', ShiftLeft: 'sneak', ShiftRight: 'sneak',
  KeyJ: 'melee', KeyQ: 'up', KeyC: 'down', ControlLeft: 'down', KeyH: 'call', KeyL: 'block', KeyM: 'map', KeyB: 'bag', Tab: 'lock',
};

class Input {
  mx = 0; my = 0;            // move axis (-1..1), y = forward
  lookX = 0; lookY = 0;      // accumulated look delta this frame (radians-ish)
  touch = false;
  private down = new Set<Act>(); private prev = new Set<Act>(); private keys = new Set<string>();
  private stick: { id: number; x: number; y: number; dx: number; dy: number } | null = null;
  private look: { id: number; x: number; y: number } | null = null;
  private btn = new Map<Act, boolean>();

  attach(canvas: HTMLCanvasElement, hud: HTMLElement): void {
    addEventListener('keydown', (e) => { this.keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => { if (!this.touch && document.pointerLockElement !== canvas) void canvas.requestPointerLock?.(); else if (e.button === 0) this.btn.set('shoot', true); else if (e.button === 2) this.btn.set('block', true); });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.btn.set('shoot', false); if (e.button === 2) this.btn.set('block', false); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { this.lookX += e.movementX * 0.0032; this.lookY += e.movementY * 0.0032; } });
    // touch: left half = stick, right half = look; buttons are DOM elements
    canvas.addEventListener('touchstart', (e) => {
      this.touch = true; hud.classList.add('touch');
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < innerWidth * 0.45 && !this.stick) this.stick = { id: t.identifier, x: t.clientX, y: t.clientY, dx: 0, dy: 0 };
        else if (!this.look) this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.stick?.id === t.identifier) { this.stick.dx = t.clientX - this.stick.x; this.stick.dy = t.clientY - this.stick.y; }
        if (this.look?.id === t.identifier) { this.lookX += (t.clientX - this.look.x) * 0.006; this.lookY += (t.clientY - this.look.y) * 0.006; this.look.x = t.clientX; this.look.y = t.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e: TouchEvent): void => { for (const t of Array.from(e.changedTouches)) { if (this.stick?.id === t.identifier) this.stick = null; if (this.look?.id === t.identifier) this.look = null; } };
    canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
  }
  /** Bind a DOM touch button to an action. */
  bindButton(el: HTMLElement, a: Act): void {
    el.addEventListener('touchstart', (e) => { this.btn.set(a, true); e.preventDefault(); e.stopPropagation(); }, { passive: false });
    el.addEventListener('touchend', (e) => { this.btn.set(a, false); e.preventDefault(); }, { passive: false });
  }
  get stickPos(): { x: number; y: number; dx: number; dy: number } | null { return this.stick; }

  update(): void {
    this.prev = this.down; this.down = new Set();
    for (const k of this.keys) { const a = KEYS[k]; if (a) this.down.add(a); }
    for (const [a, v] of this.btn) if (v) this.down.add(a);
    const k = (c: string): number => (this.keys.has(c) ? 1 : 0);
    let mx = k('KeyD') - k('KeyA'), my = k('KeyW') - k('KeyS');
    if (this.stick) { const r = 60; mx = Math.max(-1, Math.min(1, this.stick.dx / r)); my = Math.max(-1, Math.min(1, -this.stick.dy / r)); }
    this.mx = mx; this.my = my;
    // arrow keys turn the camera for keyboard-only play
    this.lookX += (k('ArrowRight') - k('ArrowLeft')) * 0.035; this.lookY += (k('ArrowDown') - k('ArrowUp')) * 0.025;
  }
  consumeLook(): [number, number] { const r: [number, number] = [this.lookX, this.lookY]; this.lookX = this.lookY = 0; return r; }
  is(a: Act): boolean { return this.down.has(a); }
  pressed(a: Act): boolean { return this.down.has(a) && !this.prev.has(a); }
  released(a: Act): boolean { return !this.down.has(a) && this.prev.has(a); }
}
export const input = new Input();
