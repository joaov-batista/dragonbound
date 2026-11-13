import type Phaser from 'phaser';
import { Pix, ramp } from './Pix';
import { pixToTexture } from './runtime';

/**
 * Scale Hunters' air force, painted at runtime (original designs):
 *  - sky raider: a hunter hanging under a bone-and-leather glider, harpoon crossbow in hand
 *  - war balloon: patched canvas envelope with the hunters' claw sigil over an armoured gondola with cannons
 */
const LEATHER = ramp(0x8a3a2a), BONE = ramp(0xd8ccb0), STEEL = ramp(0x8a9098), WOOD = ramp(0x6a4a30), CANVAS = ramp(0xc4b48e), DARK = 0x1a1418, RED = ramp(0xb8302a);

function raider(p: Pix, ox: number, flex: number, aiming: boolean): void {
  // glider: bone spar + leather membrane (tips sag when flexed)
  const cx = ox + 28, sy = 10;
  for (const s of [-1, 1]) {
    const tipX = cx + s * 27, tipY = sy + 4 + flex * 4;
    p.poly([[cx, sy], [tipX, tipY], [tipX - s * 4, tipY + 5], [cx + s * 14, sy + 8 + flex * 2], [cx, sy + 7]], LEATHER[2]);
    p.line(cx, sy, tipX, tipY, BONE[3]);
    for (let k = 1; k < 3; k++) p.line(cx + s * 9 * k, sy + (tipY - sy) * k / 3, cx + s * (9 * k - 3), sy + 8 + flex * 2, LEATHER[0]);
  }
  p.rect(cx - 1, sy - 2, 3, 10, BONE[2]);
  // pilot hanging from the bar
  p.line(cx - 3, sy + 6, cx - 2, sy + 14, DARK); p.line(cx + 3, sy + 6, cx + 2, sy + 14, DARK);
  p.ball(cx, sy + 18, 4, 5, ramp(0x3a2a24));              // body
  p.ball(cx + 1, sy + 12, 3, 3, STEEL);                     // helmet
  p.rect(cx - 3, sy + 15, 7, 2, RED[2]);                    // red scarf
  p.line(cx - 2, sy + 15, cx - 7, sy + 13 + flex, RED[3]);  // scarf tail in the wind
  p.limb(cx - 1, sy + 22, cx - 3, sy + 27, 1.5, 1, ramp(0x2a2024)); p.limb(cx + 1, sy + 22, cx + 3, sy + 27, 1.5, 1, ramp(0x2a2024));
  // harpoon crossbow
  const ay = aiming ? sy + 16 : sy + 19;
  p.rect(cx + 2, ay, 10, 2, WOOD[2]); p.line(cx + 9, ay - 3, cx + 9, ay + 4, BONE[3]); p.rect(cx + 11, ay, 4, 1, STEEL[3]);
  if (aiming) p.px(cx + 16, ay, 0xffe070);
}

function warship(p: Pix, ox: number, prop: number): void {
  const cx = ox + 84;
  // envelope
  p.ball(cx, 34, 66, 30, CANVAS);
  for (const [x, y, w, h] of [[cx - 40, 24, 12, 8], [cx + 18, 40, 14, 9], [cx - 10, 14, 10, 7]] as const) p.rect(x, y, w, h, CANVAS[1]);
  for (let x = cx - 60; x < cx + 60; x += 13) p.line(x, 12 + Math.abs(x - cx) * 0.25, x + 2, 56 - Math.abs(x - cx) * 0.25, CANVAS[1]);
  p.rect(cx - 64, 32, 128, 6, RED[2]); p.rect(cx - 64, 37, 128, 1, RED[0]);
  // the hunters' sigil: three claw marks
  for (let k = -1; k <= 1; k++) p.line(cx - 6 + k * 8, 18, cx + 2 + k * 8, 30, RED[1]);
  p.ball(cx + 64, 34, 5, 8, STEEL); // nose cap
  // rigging
  for (const x of [-44, -18, 18, 44]) p.line(cx + x * 1.1, 58, cx + x * 0.7, 78, 0x3a3028);
  // gondola
  p.poly([[cx - 56, 78], [cx + 60, 78], [cx + 50, 96], [cx - 46, 96]], WOOD[2]);
  for (let y = 82; y < 96; y += 4) p.line(cx - 52 + (y - 78) * 0.5, y, cx + 56 - (y - 78) * 0.55, y, WOOD[1]);
  p.rect(cx - 56, 76, 116, 3, STEEL[2]); for (let x = cx - 50; x < cx + 56; x += 12) p.rect(x, 79, 3, 3, STEEL[3]);
  // cannons
  for (const [x, y] of [[cx + 30, 86], [cx - 6, 88]] as const) { p.rect(x, y, 16, 5, STEEL[1]); p.rect(x + 14, y - 1, 4, 7, STEEL[0]); }
  // banner and stern propeller
  p.poly([[cx - 54, 64], [cx - 54, 78], [cx - 70, 70]], RED[2]);
  p.rect(cx - 70, 84, 12, 3, STEEL[1]);
  const blade = prop ? [[cx - 74, 76], [cx - 72, 96]] : [[cx - 78, 84], [cx - 68, 88]];
  p.line(blade[0][0], blade[0][1], blade[1][0], blade[1][1], BONE[1]);
  p.ball(cx - 72, 86, 2, 2, STEEL);
}

export function ensureAirArt(scene: Phaser.Scene): void {
  if (scene.textures.exists('skyraider')) return;
  const r = new Pix(56 * 3, 40);
  raider(r, 0, 0, false); raider(r, 56, 1, false); raider(r, 112, 0.4, true);
  r.outline(DARK);
  pixToTexture(scene, 'skyraider', r, { g0: { x: 0, y: 0, w: 56, h: 40 }, g1: { x: 56, y: 0, w: 56, h: 40 }, atk: { x: 112, y: 0, w: 56, h: 40 } });
  const w = new Pix(168 * 2, 104);
  warship(w, 0, 0); warship(w, 168, 1);
  w.outline(DARK);
  pixToTexture(scene, 'warship', w, { w0: { x: 0, y: 0, w: 168, h: 104 }, w1: { x: 168, y: 0, w: 168, h: 104 } });
}
