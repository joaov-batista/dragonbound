import Phaser from 'phaser';
import { hud } from '../core/hud';
import { saveSettings, settings } from '../core/settings';
import type { Action } from '../input/actions';
import { input } from '../input/InputManager';

type Mode = typeof hud.mode;
interface Widget { id: string; action: Action | 'stick'; frame: string; glyph?: string; r: number; small?: boolean; modes: Mode[]; def: (W: number, H: number) => [number, number]; img: Phaser.GameObjects.Image; icon?: Phaser.GameObjects.Image; knob?: Phaser.GameObjects.Image; pointer: number; x: number; y: number }

const ALL: Mode[] = ['ground', 'flight', 'boat', 'oceanFlight'];
const DEFS: Omit<Widget, 'img' | 'icon' | 'knob' | 'pointer' | 'x' | 'y'>[] = [
  { id: 'stick', action: 'stick', frame: 'stick_base', r: 34, modes: ALL, def: (_W, H) => [56, H - 54] },
  { id: 'jump', action: 'jump', frame: 'tb_a', glyph: 'g_jump', r: 16, modes: ALL, def: (W, H) => [W - 60, H - 28] },
  { id: 'attack', action: 'attack', frame: 'tb_x', glyph: 'g_attack', r: 16, modes: ALL, def: (W, H) => [W - 92, H - 56] },
  { id: 'dash', action: 'dash', frame: 'tb_b', glyph: 'g_dash', r: 16, modes: ['ground', 'flight', 'oceanFlight'], def: (W, H) => [W - 28, H - 56] },
  { id: 'interact', action: 'interact', frame: 'tb_y', glyph: 'g_interact', r: 16, modes: ['ground', 'boat', 'oceanFlight'], def: (W, H) => [W - 60, H - 84] },
  { id: 'ability', action: 'ability', frame: 'tb_n', glyph: 'g_ability', r: 13, small: true, modes: ['ground', 'flight', 'oceanFlight'], def: (W, H) => [W - 124, H - 84] },
  { id: 'mount', action: 'mount', frame: 'tb_n', glyph: 'g_mount', r: 13, small: true, modes: ['ground', 'flight', 'boat'], def: (W, H) => [W - 26, H - 110] },
  { id: 'parry', action: 'parry', frame: 'tb_n', glyph: 'g_parry', r: 13, small: true, modes: ['ground'], def: (W, H) => [W - 128, H - 26] },
  { id: 'item', action: 'item', frame: 'tb_n', glyph: 'g_item', r: 13, small: true, modes: ['ground'], def: (W, H) => [W - 92, H - 112] },
  { id: 'sneak', action: 'sneak', frame: 'tb_n', glyph: 'g_sneak', r: 13, small: true, modes: ['ground'], def: (_W, H) => [118, H - 24] },
  { id: 'gesture', action: 'gesture', frame: 'tb_n', glyph: 'g_gesture', r: 13, small: true, modes: ['ground'], def: (_W, H) => [150, H - 24] },
  { id: 'call', action: 'call', frame: 'tb_n', glyph: 'g_call', r: 13, small: true, modes: ['ground', 'boat'], def: (_W, H) => [122, H - 58] },
  { id: 'laneBack', action: 'laneBack', frame: 'tb_n', glyph: 'g_laneback', r: 12, small: true, modes: ['ground', 'flight'], def: (_W, H) => [22, H - 140] },
  { id: 'laneFront', action: 'laneFront', frame: 'tb_n', glyph: 'g_lanefront', r: 12, small: true, modes: ['ground', 'flight'], def: (_W, H) => [22, H - 112] },
  { id: 'pause', action: 'pause', frame: 'tb_n', glyph: 'g_pause', r: 12, small: true, modes: [...ALL, 'title'], def: (W) => [W - 18, 16] },
];

/**
 * On-screen controls: analogue stick + action buttons, multitouch, safe-area aware,
 * per-mode layouts (exploration / flight / boat) and a drag-to-arrange editor.
 */
export class TouchControls {
  private widgets: Widget[] = [];
  private safe = { l: 0, r: 0, t: 0, b: 0 };
  visible = false; editing = false;
  private drag: Widget | null = null;

  constructor(private scene: Phaser.Scene) {
    scene.input.addPointer(3);
    for (const d of DEFS) {
      const img = scene.add.image(0, 0, 'ui', d.frame).setDepth(900);
      const w: Widget = { ...d, img, pointer: -1, x: 0, y: 0 };
      if (d.glyph) w.icon = scene.add.image(0, 0, 'ui', d.glyph).setDepth(901);
      if (d.action === 'stick') w.knob = scene.add.image(0, 0, 'ui', 'stick_knob').setDepth(901);
      this.widgets.push(w);
    }
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.down(p));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.move(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.up(p));
    scene.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.up(p));
    this.readSafeArea(); this.layout();
    scene.scale.on('resize', () => { this.readSafeArea(); this.layout(); });
  }

  /** CSS safe-area insets (notches, home indicator) converted to game pixels. */
  private readSafeArea(): void {
    const probe = document.getElementById('safe-probe');
    if (!probe) return;
    const cs = getComputedStyle(probe), k = this.scene.scale.displayScale.x || 1;
    this.safe = { l: parseFloat(cs.paddingLeft) * k || 0, r: parseFloat(cs.paddingRight) * k || 0, t: parseFloat(cs.paddingTop) * k || 0, b: parseFloat(cs.paddingBottom) * k || 0 };
  }

  private key(w: Widget): string { return `${w.id}`; }
  layout(): void {
    const W = this.scene.scale.width, H = this.scene.scale.height, s = this.safe, k = settings.touchScale;
    for (const w of this.widgets) {
      const custom = settings.touchLayout[this.key(w)];
      let [x, y] = w.def(W, H);
      x = x < W / 2 ? x + s.l : x - s.r; y = y < H / 2 ? y + s.t : y - s.b;
      if (custom) { x = s.l + custom.x * (W - s.l - s.r); y = s.t + custom.y * (H - s.t - s.b); }
      w.x = x; w.y = y;
      w.img.setPosition(x, y).setScale((w.small ? 0.86 : 1) * k); w.icon?.setPosition(x, y - 1).setScale(k); w.knob?.setPosition(x, y).setScale(k);
    }
  }

  private shown(w: Widget): boolean { return this.editing || w.modes.includes(hud.mode); }

  setVisible(v: boolean): void {
    this.visible = v;
    if (!v) { for (const w of this.widgets) this.release(w); input.clearVirtual(); }
  }

  update(): void {
    const a = settings.touchOpacity;
    for (const w of this.widgets) {
      const on = this.visible && this.shown(w) && (!hud.inMenu || this.editing || w.id === 'pause');
      w.img.setVisible(on).setAlpha(a * (w.pointer >= 0 ? 1 : 0.8)); w.icon?.setVisible(on).setAlpha(Math.min(1, a + 0.2)); w.knob?.setVisible(on).setAlpha(a);
      if (!on && w.pointer >= 0) this.release(w);
    }
  }

  private hit(p: Phaser.Input.Pointer): Widget | null {
    let best: Widget | null = null, bd = 1e9;
    for (const w of this.widgets) {
      if (!this.shown(w) || (hud.inMenu && !this.editing && w.id !== 'pause')) continue;
      const d = Math.hypot(p.x - w.x, p.y - w.y), reach = w.r * settings.touchScale * (w.action === 'stick' ? 1.7 : 1.45);
      if (d < reach && d < bd) { bd = d; best = w; }
    }
    return best;
  }
  /** True when the pointer was consumed by a control (so menus ignore it). */
  private down(p: Phaser.Input.Pointer): void {
    if (!this.visible) return;
    const w = this.hit(p);
    if (!w) return;
    if (this.editing) { this.drag = w; return; }
    if (w.pointer >= 0) return;
    w.pointer = p.id;
    if (w.action === 'stick') this.stick(w, p); else input.setVirtual(w.action, true);
    if (navigator.vibrate && w.action !== 'stick') navigator.vibrate(8);
  }
  private move(p: Phaser.Input.Pointer): void {
    if (this.editing && this.drag && p.isDown) {
      const W = this.scene.scale.width, H = this.scene.scale.height, s = this.safe;
      settings.touchLayout[this.key(this.drag)] = { x: Phaser.Math.Clamp((p.x - s.l) / (W - s.l - s.r), 0.03, 0.97), y: Phaser.Math.Clamp((p.y - s.t) / (H - s.t - s.b), 0.05, 0.95) };
      this.layout(); return;
    }
    for (const w of this.widgets) if (w.pointer === p.id) {
      if (w.action === 'stick') this.stick(w, p);
      else if (Math.hypot(p.x - w.x, p.y - w.y) > w.r * settings.touchScale * 2.2) this.release(w); // slid off
    }
  }
  private up(p: Phaser.Input.Pointer): void {
    if (this.drag) { this.drag = null; saveSettings(); }
    for (const w of this.widgets) if (w.pointer === p.id) this.release(w);
  }
  private release(w: Widget): void {
    if (w.pointer < 0) return;
    w.pointer = -1;
    if (w.action === 'stick') { input.setVirtualAxis(0, 0, false); w.knob?.setPosition(w.x, w.y); } else input.setVirtual(w.action, false);
  }
  private stick(w: Widget, p: Phaser.Input.Pointer): void {
    const R = 24 * settings.touchScale; let dx = p.x - w.x, dy = p.y - w.y; const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    w.knob?.setPosition(w.x + dx, w.y + dy);
    const nx = dx / R, ny = dy / R, m = Math.hypot(nx, ny);
    if (m < 0.18) input.setVirtualAxis(0, 0, true); else input.setVirtualAxis(nx, ny, true);
  }
  /** Is this pointer currently driving a control? */
  owns(p: Phaser.Input.Pointer): boolean { return this.visible && (this.widgets.some((w) => w.pointer === p.id) || !!this.hit(p)); }
  resetLayout(): void { settings.touchLayout = {}; saveSettings(); this.layout(); }
}
