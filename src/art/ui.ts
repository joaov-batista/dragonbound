import { Pix, ramp, mix } from './Pix';

const OUT = 0x1a1424;
type F = Record<string, { x: number; y: number; w: number; h: number }>;

/** 16x16 icons: items, emotes, HUD glyphs. */
export const ICONS = ['berry', 'fish', 'meat', 'herb', 'shroom', 'ember', 'shell', 'relic', 'heart', 'heart_empty', 'trust', 'fear', 'hunger', 'energy',
  'e_alert', 'e_question', 'e_heart', 'e_sleep', 'e_anger', 'e_fear', 'e_happy', 'e_hungry', 'e_hurt', 'e_note',
  'el_fire', 'el_water', 'el_nature', 'el_storm', 'el_earth', 'el_ice', 'wing', 'boat', 'lock', 'star', 'paw', 'stamina', 'coin', 'scroll', 'skull', 'sword'] as const;
export type IconId = (typeof ICONS)[number];

function bubble(p: Pix): void { p.ball(8, 7, 7, 6, ramp(0xf4f0e6)); p.poly([[5, 11], [4, 15], [9, 12]], 0xf4f0e6); }
function heart(p: Pix, c: number, cx = 8, cy = 8, s = 1): void {
  const r = ramp(c);
  p.ball(cx - 2.6 * s, cy - 1.5 * s, 3 * s, 3 * s, r); p.ball(cx + 2.6 * s, cy - 1.5 * s, 3 * s, 3 * s, r);
  p.poly([[cx - 5.4 * s, cy - 0.5 * s], [cx + 5.4 * s, cy - 0.5 * s], [cx, cy + 5.5 * s]], r[2]); p.px(cx - 3 * s, cy - 3 * s, 0xffffff);
}

function icon(id: IconId, p: Pix): void {
  const el = (c: number, fn: () => void): void => { p.ball(8, 8, 7, 7, ramp(c)); fn(); p.outline(OUT); };
  switch (id) {
    case 'berry': { const r = ramp(0xd03a6a); p.ball(5, 10, 3.5, 3.5, r); p.ball(10, 9, 3.5, 3.5, r); p.ball(8, 12, 3, 3, r); p.limb(8, 6, 9, 2, 0.8, 0.5, ramp(0x4f9a3c)); p.poly([[9, 3], [14, 2], [11, 6]], 0x4f9a3c); p.outline(OUT); break; }
    case 'fish': { const r = ramp(0x5fa8d0); p.ball(7, 8, 5.5, 3.5, r); p.poly([[11, 8], [15, 4], [15, 12]], r[1]); p.px(4, 7, OUT); p.line(6, 10, 9, 10, r[4]); p.outline(OUT); break; }
    case 'meat': { const r = ramp(0xc85a4a); p.ball(7, 7, 5, 4.5, r); p.limb(10, 10, 14, 14, 1.2, 1, ramp(0xf0e8d8)); p.ball(14, 14, 1.5, 1.5, ramp(0xf0e8d8)); p.px(5, 5, r[4]); p.outline(OUT); break; }
    case 'herb': { const g = ramp(0x4fbf7a); p.limb(8, 14, 8, 6, 0.8, 0.6, g); p.limb(8, 10, 3, 6, 1.6, 0.6, g); p.limb(8, 9, 13, 5, 1.6, 0.6, g); p.limb(8, 6, 8, 1, 1.6, 0.6, g); p.outline(OUT); break; }
    case 'shroom': { p.rect(7, 8, 3, 6, 0xe8e0d0); p.ball(8, 6, 6, 4, ramp(0x5fd6e6)); p.px(5, 5, 0xffffff); p.px(10, 4, 0xffffff); p.outline(OUT); break; }
    case 'ember': { const r = ramp(0xf2742e); p.poly([[8, 1], [13, 7], [10, 14], [5, 14], [3, 8]], r[2]); p.poly([[8, 1], [8, 9], [3, 8]], r[4]); p.poly([[10, 14], [13, 7], [8, 9]], r[1]); p.outline(OUT); break; }
    case 'shell': { const r = ramp(0xf0b8a0); p.ball(8, 9, 6, 5, r); for (let k = -2; k <= 2; k++) p.line(8, 13, 8 + k * 2.6, 5, r[1]); p.px(6, 6, 0xffffff); p.outline(OUT); break; }
    case 'relic': { const r = ramp(0x4fd6c0); p.poly([[8, 1], [13, 7], [9, 15], [4, 11], [3, 5]], r[2]); p.poly([[8, 1], [8, 8], [3, 5]], r[4]); p.poly([[9, 15], [13, 7], [8, 8]], r[1]); p.outline(0x0a3a40); break; }
    case 'heart': heart(p, 0xe4533c); p.outline(OUT); break;
    case 'heart_empty': heart(p, 0x3a3048); p.outline(OUT); break;
    case 'trust': heart(p, 0x4fd6c0); p.outline(OUT); break;
    case 'fear': { p.poly([[8, 1], [15, 14], [1, 14]], 0xf0c040); p.rect(7, 5, 2, 5, OUT); p.rect(7, 11, 2, 2, OUT); p.outline(OUT); break; }
    case 'hunger': { const r = ramp(0xc85a4a); p.ball(8, 8, 6, 5, r); p.poly([[8, 8], [15, 4], [15, 12]], 0); for (let y = 3; y < 13; y++) for (let x = 9; x < 16; x++) if (Math.abs(y - 8) < (x - 8) * 0.6) p.erase(x, y); p.outline(OUT); break; }
    case 'energy': case 'stamina': { const c = id === 'energy' ? 0xf0d040 : 0x7fe0a0; p.poly([[9, 1], [3, 9], [7, 9], [6, 15], [13, 6], [9, 6]], c); p.px(8, 3, 0xffffff); p.outline(OUT); break; }
    case 'e_alert': bubble(p); p.rect(7, 2, 2, 6, 0xe4533c); p.rect(7, 9, 2, 2, 0xe4533c); p.outline(OUT); break;
    case 'e_question': bubble(p); p.line(6, 4, 8, 2, 0x3f55a0); p.line(8, 2, 10, 4, 0x3f55a0); p.line(10, 4, 8, 7, 0x3f55a0); p.rect(8, 9, 1, 2, 0x3f55a0); p.outline(OUT); break;
    case 'e_heart': bubble(p); heart(p, 0xe4533c, 8, 6, 0.65); p.outline(OUT); break;
    case 'e_sleep': bubble(p); p.line(5, 3, 9, 3, 0x3f55a0); p.line(9, 3, 5, 8, 0x3f55a0); p.line(5, 8, 9, 8, 0x3f55a0); p.line(10, 6, 12, 6, 0x3f55a0); p.line(12, 6, 10, 9, 0x3f55a0); p.line(10, 9, 12, 9, 0x3f55a0); p.outline(OUT); break;
    case 'e_anger': bubble(p); p.line(4, 4, 7, 6, 0xc02030); p.line(12, 4, 9, 6, 0xc02030); p.line(5, 10, 11, 10, 0xc02030); p.line(5, 10, 6, 8, 0xc02030); p.line(11, 10, 10, 8, 0xc02030); p.outline(OUT); break;
    case 'e_fear': bubble(p); p.poly([[8, 2], [11, 8], [8, 11], [5, 8]], 0x5fa8e0); p.px(7, 6, 0xffffff); p.outline(OUT); break;
    case 'e_happy': bubble(p); p.line(4, 5, 6, 4, OUT); p.line(6, 4, 7, 5, OUT); p.line(9, 5, 10, 4, OUT); p.line(10, 4, 12, 5, OUT); p.line(5, 8, 8, 10, 0xe4533c); p.line(8, 10, 11, 8, 0xe4533c); p.outline(OUT); break;
    case 'e_hungry': bubble(p); p.ball(8, 6, 3.5, 3, ramp(0xd03a6a)); p.line(8, 3, 10, 1, 0x4f9a3c); p.outline(OUT); break;
    case 'e_hurt': bubble(p); p.line(5, 3, 11, 9, 0xc02030); p.line(11, 3, 5, 9, 0xc02030); p.outline(OUT); break;
    case 'e_note': bubble(p); p.rect(9, 2, 1, 7, 0x3f55a0); p.ball(7.5, 9, 2, 1.5, ramp(0x3f55a0)); p.line(9, 2, 12, 4, 0x3f55a0); p.outline(OUT); break;
    case 'el_fire': el(0x8a2a20, () => { p.poly([[8, 3], [12, 9], [10, 13], [6, 13], [4, 9]], 0xf2742e); p.poly([[8, 7], [10, 11], [8, 13], [6, 11]], 0xffe680); }); break;
    case 'el_water': el(0x1f5f9c, () => { p.poly([[8, 3], [12, 10], [8, 13], [4, 10]], 0x8fd8f0); p.px(7, 8, 0xffffff); }); break;
    case 'el_nature': el(0x2f6a3a, () => { p.poly([[4, 12], [5, 5], [12, 4], [11, 11]], 0x8fe07a); p.line(4, 12, 12, 4, 0x2f6a3a); }); break;
    case 'el_storm': el(0x4a3a8a, () => { p.poly([[9, 2], [4, 9], [8, 9], [6, 14], [12, 7], [8, 7]], 0xfff0a0); }); break;
    case 'el_earth': el(0x6a4a2c, () => { p.poly([[3, 12], [6, 6], [9, 9], [11, 5], [13, 12]], 0xd8b890); }); break;
    case 'el_ice': el(0x3a7a9a, () => { for (let k = 0; k < 3; k++) { const a = (k / 3) * 3.14; p.line(8 - Math.cos(a) * 5, 8 - Math.sin(a) * 5, 8 + Math.cos(a) * 5, 8 + Math.sin(a) * 5, 0xe8ffff); } }); break;
    case 'wing': { const r = ramp(0x6fa8d0); p.poly([[2, 12], [6, 3], [14, 2], [12, 7], [14, 9], [9, 10], [10, 13]], r[2]); p.line(2, 12, 6, 3, r[4]); p.line(6, 3, 14, 2, r[4]); p.outline(OUT); break; }
    case 'boat': { const w = ramp(0x9a6238); p.poly([[1, 10], [15, 10], [12, 14], [3, 14]], w[2]); p.rect(7, 1, 1, 9, w[1]); p.poly([[8, 2], [13, 8], [8, 9]], 0xf0e6d0); p.outline(OUT); break; }
    case 'lock': { const r = ramp(0x8a8a9a); p.rect(3, 7, 10, 8, r[2]); p.rect(3, 7, 10, 1, r[4]); p.ball(8, 6, 3.5, 4, r); p.ball(8, 6, 1.6, 2, [0, 0, 0, 0, 0]); for (let y = 2; y < 8; y++) for (let x = 7; x < 10; x++) p.erase(x, y); p.rect(3, 7, 10, 8, r[2]); p.rect(7, 10, 2, 3, OUT); p.outline(OUT); break; }
    case 'star': { const pts: [number, number][] = []; for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.283 - 1.571, r = k % 2 ? 3 : 7; pts.push([8 + Math.cos(a) * r, 8 + Math.sin(a) * r]); } p.poly(pts, 0xf0d040); p.px(7, 6, 0xffffff); p.outline(OUT); break; }
    case 'coin': { const r = ramp(0xe0b040); p.ball(8, 8, 6, 6, r); p.ball(8, 8, 4, 4, ramp(r[3])); p.line(7, 5, 7, 11, r[1]); p.px(6, 5, 0xffffff); p.outline(OUT); break; }
    case 'scroll': { const r = ramp(0xe8d8a8); p.rect(3, 3, 10, 10, r[2]); p.ball(3, 8, 2, 5, r); p.ball(13, 8, 2, 5, ramp(r[1])); for (let y = 5; y < 12; y += 2) p.line(5, y, 11, y, r[0]); p.px(8, 12, 0xc8463a); p.outline(OUT); break; }
    case 'skull': { const r = ramp(0xe8e0d0); p.ball(8, 7, 6, 5.5, r); p.rect(5, 11, 6, 3, r[2]); p.rect(5, 6, 2, 2, OUT); p.rect(9, 6, 2, 2, OUT); p.px(8, 10, OUT); p.outline(OUT); break; }
    case 'sword': { p.line(3, 13, 12, 4, 0xd8e6dc); p.line(4, 13, 13, 4, 0xa8b6ac); p.line(2, 10, 6, 14, 0xf2c14e); p.line(1, 14, 3, 12, 0x7c4a2e); p.outline(OUT); break; }
    case 'paw': { const r = ramp(0x4fd6c0); p.ball(8, 10, 4, 3.5, r); for (const [x, y] of [[3, 6], [6, 3], [10, 3], [13, 6]] as const) p.ball(x, y, 1.7, 2, r); p.outline(OUT); break; }
  }
}

/** UI atlas: icons, 9-slice panel, buttons, touch controls, bars. */
export function paintUiAtlas(): { pix: Pix; frames: F } {
  const pix = new Pix(256, 208); const frames: F = {};
  ICONS.forEach((id, i) => { const t = new Pix(18, 18), inner = new Pix(16, 16); icon(id, inner); t.blit(inner, 1, 1); const x = (i % 14) * 18, y = Math.floor(i / 14) * 18; pix.blit(t, x, y); frames[id] = { x, y, w: 18, h: 18 }; });
  const put = (name: string, x: number, y: number, w: number, h: number, fn: (p: Pix) => void): void => { const t = new Pix(w, h); fn(t); pix.blit(t, x, y); frames[name] = { x, y, w, h }; };
  const panel = (bg: number, edge: number, hi: number) => (p: Pix): void => {
    p.rect(1, 1, 22, 22, bg); p.rect(2, 0, 20, 1, edge); p.rect(2, 23, 20, 1, edge); p.rect(0, 2, 1, 20, edge); p.rect(23, 2, 1, 20, edge);
    p.px(1, 1, edge); p.px(22, 1, edge); p.px(1, 22, edge); p.px(22, 22, edge);
    p.rect(2, 1, 20, 1, hi); p.rect(1, 2, 1, 20, hi); p.rect(2, 22, 20, 1, mix(bg, 0, 0.35)); p.rect(22, 2, 1, 20, mix(bg, 0, 0.35));
    for (const [x, y] of [[3, 3], [20, 3], [3, 20], [20, 20]] as const) p.px(x, y, 0xf2c14e);
  };
  put('panel', 0, 60, 24, 24, panel(0x1d2238, 0x0c0e1a, 0x3a4468));
  put('panel_light', 26, 60, 24, 24, panel(0x2c3554, 0x0c0e1a, 0x55648f));
  put('btn', 52, 60, 24, 24, panel(0x2f3f6a, 0x0c0e1a, 0x6f86c0));
  put('btn_focus', 78, 60, 24, 24, panel(0xb8552e, 0x2a0e0a, 0xf2c14e));
  put('bar_bg', 104, 60, 8, 6, (p) => { p.rect(0, 0, 8, 6, 0x0c0e1a); p.rect(1, 1, 6, 4, 0x2a2f48); });
  put('white', 114, 60, 4, 4, (p) => p.rect(0, 0, 4, 4, 0xffffff));
  // touch controls
  put('stick_base', 0, 88, 56, 56, (p) => { p.ellipse(28, 28, 27, 27, 0x0c0e1a, 120); p.ellipse(28, 28, 24, 24, 0xffffff, 40); for (let a = 0; a < 360; a += 3) p.px(28 + Math.cos(a / 57.3) * 26.5, 28 + Math.sin(a / 57.3) * 26.5, 0xffffff, 190); for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) p.poly([[28 + dx * 22 - dy * 3, 28 + dy * 22 + dx * 3], [28 + dx * 22 + dy * 3, 28 + dy * 22 - dx * 3], [28 + dx * 25, 28 + dy * 25]], 0xffffff, 150); });
  put('stick_knob', 58, 88, 26, 26, (p) => { p.ball(13, 13, 12, 12, ramp(0xd8dcef)); p.outline(0x0c0e1a); });
  const tb = (c: number) => (p: Pix): void => { p.ellipse(15, 15, 14, 14, 0x0c0e1a, 150); p.ellipse(15, 14, 12, 12, c, 215); p.ellipse(15, 12, 10, 8, mix(c, 0xffffff, 0.25), 215); for (let a = 0; a < 360; a += 4) p.px(15 + Math.cos(a / 57.3) * 14, 15 + Math.sin(a / 57.3) * 14, 0xffffff, 200); };
  ['tb_a:0x3f9a58', 'tb_b:0xc8463a', 'tb_x:0x3f6fc8', 'tb_y:0xd8a030', 'tb_n:0x5a6078'].forEach((s, i) => { const [n, c] = s.split(':'); put(n, 86 + i * 32, 88, 30, 30, tb(Number(c))); });
  // touch glyphs 12x12 (white)
  const W = 0xffffff;
  const glyphs: Record<string, (p: Pix) => void> = {
    g_jump: (p) => { p.poly([[6, 1], [11, 7], [1, 7]], W); p.rect(4, 7, 4, 4, W); },
    g_attack: (p) => { p.line(2, 10, 10, 2, W); p.line(3, 10, 10, 3, W); p.line(1, 7, 5, 11, W); p.px(10, 1, W); },
    g_dash: (p) => { p.poly([[6, 2], [11, 6], [6, 10]], W); p.rect(1, 5, 5, 2, W); p.rect(0, 2, 3, 1, W); p.rect(0, 9, 3, 1, W); },
    g_interact: (p) => { p.ellipse(6, 6, 4.5, 4.5, W); p.ellipse(6, 6, 2, 2, 0, 0); for (let y = 4; y < 9; y++) for (let x = 4; x < 9; x++) if (Math.hypot(x - 6, y - 6) < 2.2) p.erase(x, y); },
    g_mount: (p) => { p.poly([[1, 9], [4, 2], [11, 1], [9, 5], [11, 7], [7, 8], [8, 11]], W); },
    g_ability: (p) => { p.poly([[6, 0], [10, 6], [8, 11], [4, 11], [2, 6]], W); p.erase(6, 7); p.erase(6, 8); p.erase(5, 8); p.erase(7, 8); },
    g_parry: (p) => { p.poly([[1, 1], [11, 1], [10, 7], [6, 11], [2, 7]], W); for (let y = 3; y < 7; y++) for (let x = 4; x < 9; x++) p.erase(x, y); },
    g_pause: (p) => { p.rect(2, 1, 3, 10, W); p.rect(7, 1, 3, 10, W); },
    g_sneak: (p) => { p.ellipse(6, 4, 2.5, 2.5, W); p.poly([[2, 11], [4, 6], [9, 6], [10, 11]], W); },
    g_call: (p) => { p.poly([[1, 4], [5, 4], [9, 1], [9, 11], [5, 8], [1, 8]], W); p.line(11, 4, 11, 8, W); },
    g_item: (p) => { p.rect(2, 4, 8, 7, W); p.rect(4, 1, 4, 3, W); p.erase(5, 2); p.erase(6, 2); },
    // stacked planes with an arrow: into the background (arrow up) / toward the foreground (arrow down)
    g_laneback: (p) => { p.poly([[1, 8], [6, 6], [11, 8], [6, 10]], W, 140); p.poly([[1, 6], [6, 4], [11, 6], [6, 8]], W); p.poly([[6, 0], [9, 3], [3, 3]], W); },
    g_lanefront: (p) => { p.poly([[1, 3], [6, 1], [11, 3], [6, 5]], W, 140); p.poly([[1, 5], [6, 3], [11, 5], [6, 7]], W); p.poly([[6, 11], [9, 8], [3, 8]], W); },
    g_gesture: (p) => { p.rect(3, 5, 6, 6, W); for (let k = 0; k < 4; k++) p.rect(3 + k * 2, 1 + (k === 0 || k === 3 ? 1 : 0), 1, 4, W); p.rect(1, 6, 2, 2, W); },
  };
  Object.entries(glyphs).forEach(([n, fn], i) => put(n, i * 14, 148, 12, 12, fn));
  // logo ornament + cursor
  put('cursor', 236, 148, 8, 9, (p) => { p.poly([[0, 0], [7, 4], [0, 8]], 0xf2c14e); p.outline(OUT); });
  put('vignette', 0, 164, 64, 40, (p) => { for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) { const d = Math.hypot((x - 31.5) / 32, (y - 19.5) / 20); if (d > 0.7) p.px(x, y, 0x080410, Math.min(1, (d - 0.7) / 0.7) * 150); } });
  return { pix, frames };
}
