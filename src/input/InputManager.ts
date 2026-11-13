import { ACTIONS, defaultBindings, padKind, type Action, type Bindings, type PadBind, type PadKind } from './actions';

const KEY = 'dragonbound.bindings.v1';
export type Device = 'keyboard' | 'gamepad' | 'touch';

/**
 * Central input abstraction. Gameplay code only ever asks about abstract actions;
 * keyboard, Gamepad API and the touch overlay all feed the same action state.
 */
export class InputManager {
  bindings: Bindings;
  lastDevice: Device = 'keyboard';
  padKind: PadKind = 'generic';
  padConnected = false;
  axisX = 0; axisY = 0;

  private keysDown = new Set<string>();
  /** Inputs that went down since the last poll — so taps shorter than one frame are never lost. */
  private keysLatched = new Set<string>();
  private virtLatched = new Set<Action>();
  private virt = new Set<Action>();
  private virtAxis: [number, number] | null = null;
  private cur = new Set<Action>();
  private prev = new Set<Action>();
  private captureKey: ((code: string) => void) | null = null;
  private capturePad: ((b: PadBind) => void) | null = null;
  private padPrev: boolean[] = [];
  private padAxPrev: number[] = [];
  private injected = new Set<Action>();

  constructor(target: Window | null = typeof window !== 'undefined' ? window : null) {
    this.bindings = this.load();
    if (!target) return;
    target.addEventListener('keydown', (e) => {
      if (this.captureKey) { e.preventDefault(); const c = this.captureKey; this.captureKey = null; c(e.code); return; }
      this.keysDown.add(e.code); this.keysLatched.add(e.code); this.lastDevice = 'keyboard';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    target.addEventListener('blur', () => { this.keysDown.clear(); this.virt.clear(); this.virtAxis = null; });
    target.addEventListener('gamepadconnected', (e) => { this.padConnected = true; this.padKind = padKind((e as GamepadEvent).gamepad.id); });
    target.addEventListener('gamepaddisconnected', () => { this.padConnected = this.pads().length > 0; });
  }

  private load(): Bindings {
    const d = defaultBindings();
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
      if (raw) { const p = JSON.parse(raw) as Partial<Bindings>; return { ...d, ...p, keys: { ...d.keys, ...p.keys }, pad: { ...d.pad, ...p.pad } }; }
    } catch { /* ignore */ }
    return d;
  }
  save(): void { try { localStorage.setItem(KEY, JSON.stringify(this.bindings)); } catch { /* ignore */ } }
  resetDefaults(): void { this.bindings = defaultBindings(); this.save(); }

  private pads(): Gamepad[] {
    // Some browsers only expose pads after a button press and may return null slots.
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
    const out: Gamepad[] = [];
    for (const p of navigator.getGamepads()) if (p && p.connected) out.push(p);
    return out;
  }

  private padValue(p: Gamepad, b: PadBind): number {
    if ('b' in b) { const btn = p.buttons[b.b]; return btn ? (btn.pressed ? 1 : btn.value) : 0; }
    const v = (p.axes[b.a] ?? 0) * b.d;
    return v > 0 ? v : 0;
  }

  /** Call once per frame before gameplay reads input. */
  update(): void {
    this.prev = this.cur; this.cur = new Set();
    const B = this.bindings, dz = B.deadzone;
    let ax = 0, ay = 0, padUsed = false;
    const pads = this.pads();
    if (pads.length) { this.padConnected = true; this.padKind = padKind(pads[0].id); }

    for (const a of ACTIONS) {
      let on = this.virt.has(a) || this.virtLatched.has(a) || this.injected.has(a);
      for (const k of B.keys[a]) if (this.keysDown.has(k) || this.keysLatched.has(k)) on = true;
      for (const p of pads) for (const pb of B.pad[a]) {
        const v = this.padValue(p, pb);
        if (v > ('a' in pb ? Math.max(dz, 0.5) : 0.4)) { on = true; padUsed = true; }
      }
      if (on) this.cur.add(a);
    }
    // analogue movement from bound axes (rescaled past the deadzone, with sensitivity curve)
    for (const p of pads) {
      const ex = (act: Action): number => { let m = 0; for (const pb of B.pad[act]) m = Math.max(m, this.padValue(p, pb)); return m; };
      const x = ex('right') - ex('left'), y = ex('down') - ex('up'), mag = Math.hypot(x, y);
      if (mag > dz) { const k = Math.min(1, ((mag - dz) / (1 - dz)) * B.sensitivity) / mag; ax = x * k; ay = y * k; padUsed = true; }
    }
    if (this.virtAxis) { ax = this.virtAxis[0]; ay = this.virtAxis[1]; this.lastDevice = 'touch'; }
    else if (this.virt.size) this.lastDevice = 'touch';
    if (ax === 0 && ay === 0) {
      ax = (this.cur.has('right') ? 1 : 0) - (this.cur.has('left') ? 1 : 0);
      ay = (this.cur.has('down') ? 1 : 0) - (this.cur.has('up') ? 1 : 0);
    } else {
      // analogue sources also drive the digital directions (menus, wall slides…)
      if (ax < -0.45) this.cur.add('left'); if (ax > 0.45) this.cur.add('right');
      if (ay < -0.45) this.cur.add('up'); if (ay > 0.45) this.cur.add('down');
    }
    if (this.virtLatched.size) this.lastDevice = 'touch';
    this.keysLatched.clear(); this.virtLatched.clear();
    if (padUsed) this.lastDevice = 'gamepad';
    this.axisX = ax; this.axisY = ay;

    // binding capture for the remap menu
    if (this.capturePad && pads.length) {
      const p = pads[0];
      for (let i = 0; i < p.buttons.length; i++) { const d = p.buttons[i].pressed; if (d && !this.padPrev[i]) { const c = this.capturePad; this.capturePad = null; c({ b: i }); break; } }
      if (this.capturePad) for (let i = 0; i < p.axes.length; i++) { const v = p.axes[i]; if (Math.abs(v) > 0.7 && Math.abs(this.padAxPrev[i] ?? 0) < 0.4) { const c = this.capturePad; this.capturePad = null; c({ a: i, d: v > 0 ? 1 : -1 }); break; } }
    }
    if (pads.length) { this.padPrev = pads[0].buttons.map((b) => b.pressed); this.padAxPrev = [...pads[0].axes]; }
  }

  down(a: Action): boolean { return this.cur.has(a); }
  pressed(a: Action): boolean { return this.cur.has(a) && !this.prev.has(a); }
  released(a: Action): boolean { return !this.cur.has(a) && this.prev.has(a); }

  // touch overlay API
  setVirtual(a: Action, on: boolean): void { if (on) { this.virt.add(a); this.virtLatched.add(a); } else this.virt.delete(a); }
  setVirtualAxis(x: number, y: number, active: boolean): void { this.virtAxis = active ? [x, y] : null; }
  clearVirtual(): void { this.virt.clear(); this.virtAxis = null; }

  // remap menu API
  captureNextKey(cb: (code: string) => void): void { this.captureKey = cb; }
  captureNextPad(cb: (b: PadBind) => void): void { this.capturePad = cb; }
  cancelCapture(): void { this.captureKey = null; this.capturePad = null; }
  get capturing(): boolean { return !!(this.captureKey || this.capturePad); }

  /** Test hook: hold/release an action programmatically. */
  inject(a: Action, on: boolean): void { if (on) this.injected.add(a); else this.injected.delete(a); }
}

export const input = new InputManager();
