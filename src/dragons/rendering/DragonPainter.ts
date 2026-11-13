import { Pix, ramp, shade, hash2, mix, type Ramp } from '../../art/Pix';
import type { Phenotype } from '../genetics/types';
import { DRAGON_ANIMS, DRAGON_COLS, DRAGON_FH, DRAGON_FRAME_COUNT, DRAGON_FW, DRAGON_OX, DRAGON_OY, type DragonAnim } from './dragonAnims';

/**
 * Modular procedural dragon renderer. Every anatomical module (head, horns, wings, tail,
 * spines, pattern, scales) is chosen by the phenotype; the same rig drives all animations,
 * so any combination of modules animates correctly and can be rebuilt from a save.
 */
const OUT = 0x16101e;
type V = [number, number];

interface Pose {
  bob: number; tilt: number;        // body offset / pitch (radians, + = nose up)
  neck: number; neckBend: number;   // neck elevation (rad from forward), S-curve amount
  head: number; jaw: number;        // head pitch (+ = down), jaw opening 0..1
  eye: 'open' | 'closed' | 'happy' | 'angry';
  tailPhase: number; tailLift: number;
  wing: 'fold' | 'spread' | 'half'; flap: number; // -1 down .. 1 up
  legs: [number, number, number, number]; // near-front, far-front, near-hind, far-hind swing (rad)
  tuck: boolean; lie: boolean; bow: number; // flight tuck, lying down, play-bow amount
}

const P = (o: Partial<Pose>): Pose => ({ bob: 0, tilt: 0, neck: 0.95, neckBend: 0.25, head: 0.15, jaw: 0, eye: 'open', tailPhase: 0, tailLift: 0, wing: 'fold', flap: 0, legs: [0, 0, 0, 0], tuck: false, lie: false, bow: 0, ...o });
const TAU = Math.PI * 2;

export function dragonPose(anim: DragonAnim, i: number): Pose {
  const n = DRAGON_ANIMS[anim].n, ph = (i / n) * TAU;
  switch (anim) {
    case 'idle': return P({ bob: [0, 0.5, 1, 0.5][i], tailPhase: ph, neck: 0.95 + Math.sin(ph) * 0.04, eye: i === 3 ? 'closed' : 'open' });
    case 'walk': { const s = Math.sin(ph) * 0.55, c = Math.sin(ph + Math.PI) * 0.55; return P({ bob: Math.abs(Math.sin(ph)) * 1.2, legs: [s, c, c, s], tailPhase: ph, neck: 0.85, head: 0.1 }); }
    case 'fly': { const f = Math.cos(ph); return P({ bob: -f * 2, tilt: 0.06, neck: 0.42, neckBend: 0.12, head: 0.05, wing: 'spread', flap: f, tuck: true, tailPhase: ph, tailLift: 0.28 }); }
    case 'sleep': return P({ lie: true, bob: i * 0.6, neck: -0.25, neckBend: -0.3, head: 0.55, eye: 'closed', tailLift: -0.5, tailPhase: 0.5 });
    case 'eat': return P({ neck: -0.35 + (i === 1 ? -0.12 : 0), neckBend: -0.1, head: 0.75, jaw: i === 1 ? 0.6 : 0.15, tailPhase: ph, bow: 0.25 });
    case 'attack': return P({ neck: [1.15, 0.55, 0.5][i], neckBend: [0.5, 0, 0.05][i], head: [-0.1, 0.05, 0.05][i], jaw: [0.2, 1, 0.8][i], eye: 'angry', wing: 'half', flap: [0.5, 0.8, 0.7][i], tailPhase: i, tailLift: 0.3, legs: [0.2, 0.1, -0.2, -0.1] });
    case 'hurt': return P({ tilt: 0.14, neck: 1.25, neckBend: 0.5, head: -0.3, jaw: 0.5, eye: 'closed', wing: 'half', flap: 0.3, tailLift: 0.4, bob: -2 });
    case 'play': return P({ bow: 0.7 + Math.sin(ph) * 0.3, neck: 0.25, neckBend: 0.05, head: 0.0, eye: 'happy', jaw: i % 2 ? 0.35 : 0.1, tailPhase: ph * 2, tailLift: 0.75 });
    case 'alert': return P({ neck: 1.28, neckBend: 0.35, head: -0.05, jaw: i ? 0.75 : 0, eye: i ? 'angry' : 'open', wing: 'half', flap: i ? 0.9 : 0.6, tailLift: 0.35, tailPhase: i * 2 });
    case 'nuzzle': return P({ neck: 0.2 - i * 0.08, neckBend: -0.05, head: 0.3, eye: 'happy', tailPhase: i * 3, tailLift: 0.45, bow: 0.15 });
  }
}

const rot = (x: number, y: number, a: number): V => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

export function drawDragon(out: Pix, ox: number, oy: number, ph: Phenotype, scale: number, q: Pose): void {
  const s = ph.size * scale;
  const baby = Math.max(0, 1 - scale) * 0.9;           // juvenile proportions: bigger head, stubbier limbs
  const L = 17.5 * s * ph.bodyLen, G = 8.8 * s * ph.girth * (1 + baby * 0.15);
  const legLen = (q.lie ? 2.5 : 9.5) * s * ph.legLen * (1 - baby * 0.2);
  const pr = ramp(ph.primary), se = ramp(ph.secondary), ac = ramp(ph.accent), hn = ramp(ph.horn);
  const far = ramp(shade(ph.primary, -0.34));
  const cx = ox + DRAGON_OX, cy = oy + DRAGON_OY - legLen - G * 0.85 + q.bob - (q.tuck ? 14 * s : 0);
  // body-local → world (pitch about body centre). Local +x = toward head, +y = down.
  const B = (x: number, y: number): V => { const [rx, ry] = rot(x, y, -q.tilt); return [cx + rx, cy + ry + (x > 0 ? q.bow * G * 0.9 * (x / L) : -q.bow * G * 0.35 * (-x / L))]; };

  const skin = new Pix(out.w, out.h), farL = new Pix(out.w, out.h), wingN = new Pix(out.w, out.h), deco = new Pix(out.w, out.h);
  const feet: V[] = [];

  // ── wings ──────────────────────────────────────────────────────────────
  const wing = (layer: Pix, dx: number, dy: number, dark: boolean): void => {
    const mem = dark ? ramp(shade(ph.secondary, -0.3)) : se, bone = dark ? far : pr, tip = dark ? ramp(shade(ph.accent, -0.3)) : ac;
    const span = 33 * s * ph.wingSpan * (1 - baby * 0.35);
    const sh = B(L * 0.2, -G * 0.75), at = B(-L * 0.45, -G * 0.55);
    sh[0] += dx; sh[1] += dy; at[0] += dx; at[1] += dy;
    let pts: V[], bones: V[];
    if (q.wing === 'fold') {
      const el: V = [sh[0] - L * 0.25, sh[1] - G * 0.75], t1: V = [at[0] - L * 0.45, at[1] + G * 0.25], t2: V = [at[0] - L * 0.1, at[1] + G * 0.55];
      pts = [sh, el, t1, t2, [sh[0] - L * 0.1, sh[1] + G * 0.5]]; bones = [el, t1];
      if (ph.wings === 'leaf') pts = [sh, [el[0], el[1] - 1], [t1[0] + 2, t1[1] - G * 0.5], t1, t2, [sh[0], sh[1] + G * 0.4]];
    } else {
      const k = q.wing === 'half' ? 0.62 : 1, f = q.flap;
      const th = Math.PI + f * 1.24, len = span * k * (0.55 + 0.45 * Math.abs(f));
      const wr: V = [sh[0] + Math.cos(th) * len * 0.5, sh[1] + Math.sin(th) * len * 0.5];
      const sg = f > 0 ? -1 : 1;
      const tips: V[] = [0.2, 0.75, 1.3].map((a, j) => { const t2 = th + sg * a; const l2 = len * [0.62, 0.72, 0.6][j]; return [wr[0] + Math.cos(t2) * l2, wr[1] + Math.sin(t2) * l2] as V; });
      const mid = (a: V, b: V): V => [(a[0] + b[0]) / 2 + (wr[0] - (a[0] + b[0]) / 2) * 0.22, (a[1] + b[1]) / 2 + (wr[1] - (a[1] + b[1]) / 2) * 0.22];
      pts = [sh, wr, tips[0], mid(tips[0], tips[1]), tips[1], mid(tips[1], tips[2]), tips[2], mid(tips[2], at), at];
      bones = [wr, ...tips];
      if (ph.wings === 'leaf') {
        const c1: V = [(wr[0] + tips[0][0]) / 2, (wr[1] + tips[0][1]) / 2], c2: V = [(wr[0] + tips[2][0] + at[0]) / 3, (wr[1] + tips[2][1] + at[1]) / 3];
        layer.ball(c1[0], c1[1], len * 0.42, len * 0.3, mem); layer.ball(c2[0], c2[1], len * 0.3, len * 0.24, ramp(shade(mem[2], -0.12)));
        layer.limb(sh[0], sh[1], c1[0], c1[1], 1.6 * s, 0.6, bone);
        for (let j = 0; j < 3; j++) layer.line(c1[0], c1[1], tips[j][0], tips[j][1], mem[1]);
        layer.ball(c1[0] + Math.cos(th) * 3, c1[1] + Math.sin(th) * 3, 2.2 * s, 2.2 * s, tip); layer.px(c1[0] + Math.cos(th) * 3, c1[1] + Math.sin(th) * 3, OUT);
        return;
      }
    }
    layer.poly(pts, mem[2]);
    // membrane shading relative to leading edge
    const le0 = sh, le1 = bones[0];
    for (let y = 0; y < layer.h; y++) for (let x = 0; x < layer.w; x++) {
      if (layer.get(x, y) !== mem[2]) continue;
      const d = Math.abs((le1[0] - le0[0]) * (le0[1] - y) - (le0[0] - x) * (le1[1] - le0[1])) / (Math.hypot(le1[0] - le0[0], le1[1] - le0[1]) || 1);
      if (ph.wings === 'feather') { const row = Math.floor(d / (3.2 * s + 1)); layer.px(x, y, (Math.floor(d) % Math.ceil(3.2 * s + 1) === 0) ? mem[1] : row % 2 ? mem[2] : mem[3]); if (d > 15 * s) layer.px(x, y, (x + y) % 3 === 0 ? tip[1] : tip[2]); }
      else if (ph.wings === 'fin') layer.px(x, y, d < 3 ? mem[3] : (x + Math.floor(d)) % 5 === 0 ? mem[4] : d > 12 * s ? tip[2] : mem[2]);
      else layer.px(x, y, d < 2.5 ? mem[3] : d > 13 * s ? mem[1] : mem[2]);
    }
    layer.limb(sh[0], sh[1], bones[0][0], bones[0][1], 1.7 * s, 1.2 * s, bone);
    for (let j = 1; j < bones.length; j++) layer.limb(bones[0][0], bones[0][1], bones[j][0], bones[j][1], 0.9, 0.5, bone[1]);
    if (q.wing !== 'fold') { layer.px(bones[0][0], bones[0][1] - 1, hn[3]); layer.px(bones[0][0] + 1, bones[0][1] - 2, hn[2]); }
  };

  // ── legs ───────────────────────────────────────────────────────────────
  const leg = (layer: Pix, hip: V, swing: number, r: Ramp, front: boolean): void => {
    const t = legLen * 0.56, sh2 = legLen * 0.6, rad = G * (front ? 0.36 : 0.46);
    let a1 = swing + (front ? 0.1 : -0.25), a2 = swing * 0.4 + (front ? -0.15 : 0.45);
    if (q.tuck) { a1 = front ? -0.9 : -1.2; a2 = front ? -2.0 : -0.2; }
    if (q.lie) { a1 = 1.2; a2 = 1.45; }
    const k: V = [hip[0] + Math.sin(a1) * t, hip[1] + Math.cos(a1) * t];
    const f: V = [k[0] + Math.sin(a2) * sh2, k[1] + Math.cos(a2) * sh2];
    layer.limb(hip[0], hip[1], k[0], k[1], rad, rad * 0.7, r);
    layer.limb(k[0], k[1], f[0], f[1], rad * 0.62, rad * 0.5, r);
    layer.limb(f[0], f[1], f[0] + 2.4 * s, f[1] + 0.3, rad * 0.5, rad * 0.4, r);
    feet.push([f[0] + 3.2 * s, f[1] + 0.6]);
  };
  const hipF = B(L * 0.5, G * 0.35), hipH = B(-L * 0.5, G * 0.3);
  if (q.wing !== 'fold') wing(farL, 3, -1, true);
  leg(farL, [hipF[0] + 2.5, hipF[1] - 0.5], q.legs[1], far, true);
  leg(farL, [hipH[0] + 2.5, hipH[1] - 0.5], q.legs[3], far, false);

  // ── tail ───────────────────────────────────────────────────────────────
  const tb = B(-L * 0.8, 0);
  let tx = tb[0], ty = tb[1], ta = Math.PI - 0.38 + q.tilt;
  const segs = 8, segL = L * 0.24 * ph.tailLen;
  for (let k = 0; k < segs; k++) {
    ta += 0.1 + q.tailLift * 0.14 + Math.sin(q.tailPhase + k * 0.75) * 0.1 * (k / segs + 0.2);
    const nx = tx + Math.cos(ta) * segL, ny = ty + Math.sin(ta) * segL;
    const r0 = G * 0.62 * (1 - k / segs) + 0.9, r1 = G * 0.62 * (1 - (k + 1) / segs) + 0.9;
    skin.limb(tx, ty, nx, ny, r0, r1, pr);
    if (ph.spines !== 'none' && k < segs - 2 && k % 2 === 0) deco.poly([[tx, ty - r0 + 1], [tx - 1.5 * s, ty - r0 - 2.2 * s], [nx, ny - r1 + 1]], ph.spines === 'frill' ? se[2] : hn[2]);
    tx = nx; ty = ny;
  }
  const td: V = [Math.cos(ta), Math.sin(ta)], tn: V = [-td[1], td[0]];
  const tp = (u: number, v: number): V => [tx + td[0] * u + tn[0] * v, ty + td[1] * u + tn[1] * v];
  if (ph.tail === 'club') { deco.ball(tx + td[0] * 2 * s, ty + td[1] * 2 * s, 3.2 * s, 3 * s, hn); for (const a of [0, 1.2, -1.2]) { const e = tp(2 * s + Math.cos(a) * 5 * s, Math.sin(a) * 5 * s); deco.limb(tx + td[0] * 2 * s, ty + td[1] * 2 * s, e[0], e[1], 1, 0.3, hn); } }
  else if (ph.tail === 'fan') { deco.poly([tp(-2, 0), tp(5 * s, -6 * s), tp(8 * s, -2 * s), tp(6 * s, 0), tp(8 * s, 2 * s), tp(5 * s, 6 * s)], se[2]); deco.line(...tp(0, 0), ...tp(6 * s, -4 * s), se[4]); deco.line(...tp(0, 0), ...tp(6 * s, 4 * s), se[1]); deco.line(...tp(0, 0), ...tp(7 * s, 0), se[3]); }
  else if (ph.tail === 'spade') { deco.poly([tp(-1, 0), tp(2 * s, -4 * s), tp(8 * s, 0), tp(2 * s, 4 * s)], ac[2]); deco.line(...tp(2 * s, -4 * s), ...tp(8 * s, 0), ac[4]); }
  else if (ph.tail === 'fork') { for (const v of [-1, 1]) { const e = tp(7 * s, v * 4 * s); skin.limb(tx, ty, e[0], e[1], 1.3, 0.4, v < 0 ? pr : far); } }

  // ── body + neck ────────────────────────────────────────────────────────
  const chest = B(L * 0.42, -G * 0.05), rump = B(-L * 0.45, 0);
  skin.limb(rump[0], rump[1], chest[0], chest[1], G * 0.95, G, pr);
  const n0 = B(L * 0.72, -G * 0.35), nA = q.neck + q.tilt, NL = L * 0.82 * ph.neckLen * (1 - baby * 0.25);
  const n2: V = [n0[0] + Math.cos(nA) * NL, n0[1] - Math.sin(nA) * NL + q.bow * G * 0.5];
  const n1: V = [(n0[0] + n2[0]) / 2 - Math.sin(nA) * NL * q.neckBend, (n0[1] + n2[1]) / 2 - Math.cos(nA) * NL * q.neckBend * 0.6];
  const neckPts: V[] = [];
  for (let k = 0; k <= 6; k++) { const t = k / 6, u = 1 - t; neckPts.push([u * u * n0[0] + 2 * u * t * n1[0] + t * t * n2[0], u * u * n0[1] + 2 * u * t * n1[1] + t * t * n2[1]]); }
  for (let k = 0; k < 6; k++) skin.limb(neckPts[k][0], neckPts[k][1], neckPts[k + 1][0], neckPts[k + 1][1], G * (0.66 - k * 0.045), G * (0.62 - k * 0.045), pr);

  // near legs
  leg(skin, hipF, q.legs[0], pr, true);
  leg(skin, hipH, q.legs[2], pr, false);

  // ── head ───────────────────────────────────────────────────────────────
  const hs = 4.4 * Math.pow(s, 0.7) * (1 + baby * 0.5), hA = q.head + (q.tilt * -0.5);
  const Hd = (u: number, v: number): V => { const [x, y] = rot(u, v, hA); return [n2[0] + x, n2[1] + y]; };
  const snoutLen = ph.head === 'long' ? 2.9 : ph.head === 'blunt' ? 1.5 : 2.15, snR = ph.head === 'long' ? 0.5 : ph.head === 'blunt' ? 0.85 : 0.66;
  const jawA = q.jaw * 0.6;
  const j0 = Hd(hs * 0.2, hs * 0.55), j1 = Hd(hs * 0.2 + Math.cos(jawA) * hs * snoutLen * 0.9, hs * 0.55 + Math.sin(jawA) * hs * snoutLen * 0.9);
  if (q.jaw > 0.25) { const m = Hd(hs * snoutLen * 0.6, hs * 0.6); skin.limb(j0[0], j0[1], m[0], m[1] + q.jaw * hs * 0.3, hs * 0.5, hs * 0.3, 0x7a1f2e); }
  skin.limb(j0[0], j0[1], j1[0], j1[1], hs * 0.42, hs * 0.26, ramp(pr[1]));
  const sk = Hd(0, 0), sn = Hd(hs * snoutLen, hs * 0.22);
  skin.ball(sk[0], sk[1], hs * (ph.head === 'blunt' ? 1.1 : 1), hs * (ph.head === 'blunt' ? 1.05 : 0.95), pr);
  skin.limb(sk[0] + (sn[0] - sk[0]) * 0.2, sk[1] + (sn[1] - sk[1]) * 0.2, sn[0], sn[1], hs * snR * 1.1, hs * snR * 0.72, pr);
  if (q.jaw > 0.25) { for (let k = 1; k <= 3; k++) { const t = Hd(hs * (0.6 + k * snoutLen * 0.22), hs * 0.62); deco.px(t[0], t[1], 0xffffff); deco.px(t[0], t[1] + 1, 0xffffff); } }
  if (ph.head === 'crest') { deco.poly([Hd(-hs * 0.2, -hs * 0.8), Hd(-hs * 1.9, -hs * 1.9), Hd(-hs * 1.5, -hs * 0.6), Hd(-hs * 2.1, hs * 0.1), Hd(-hs * 0.7, hs * 0.5)], se[2]); deco.line(...Hd(-hs * 0.3, -hs * 0.6), ...Hd(-hs * 1.9, -hs * 1.9), se[4]); deco.line(...Hd(-hs * 0.5, 0), ...Hd(-hs * 2.1, hs * 0.1), se[1]); }
  else deco.poly([Hd(-hs * 0.5, -hs * 0.2), Hd(-hs * 1.5, -hs * 0.5), Hd(-hs * 0.7, hs * 0.45)], se[2]);
  const hb = Hd(-hs * 0.35, -hs * 0.8);
  const hl = (u0: number, v0: number, u1: number, v1: number, r0: number, r1: number): void => { const a = Hd(u0, v0), b = Hd(u1, v1); deco.limb(a[0], a[1], b[0], b[1], r0, r1, hn); };
  if (ph.horns === 'swept') { hl(-0.35 * hs, -0.8 * hs, -2.3 * hs, -1.7 * hs, hs * 0.3, 0.3); hl(0.1 * hs, -0.9 * hs, -1.5 * hs, -2 * hs, hs * 0.25, 0.3); }
  else if (ph.horns === 'curled') { let px = hb[0], py = hb[1]; for (let k = 1; k <= 7; k++) { const a = -2.3 + k * 0.62 + hA, r = hs * (1.1 - k * 0.08); const x = hb[0] - hs * 0.6 + Math.cos(a) * r * 0.9, y = hb[1] - hs * 0.2 + Math.sin(a) * r * 0.9; deco.limb(px, py, x, y, hs * 0.32 - k * 0.03 * hs, hs * 0.3 - k * 0.03 * hs, hn); px = x; py = y; } }
  else if (ph.horns === 'spikes') { for (let k = 0; k < 4; k++) hl((-0.6 + k * 0.45) * hs, -0.85 * hs, (-1 + k * 0.5) * hs, (-1.9 + k * 0.12) * hs, hs * 0.2, 0.2); }
  else if (ph.horns === 'antler') { hl(-0.3 * hs, -0.8 * hs, -1.2 * hs, -2.5 * hs, hs * 0.22, 0.4); hl(-0.75 * hs, -1.6 * hs, -2 * hs, -2 * hs, 0.6, 0.3); hl(-1 * hs, -2.1 * hs, -0.2 * hs, -2.9 * hs, 0.6, 0.3); }

  // ── spines along back and neck ─────────────────────────────────────────
  if (ph.spines !== 'none') {
    const col = ph.spines === 'frill' ? se : hn;
    const spike = (p0: V, r: number, h: number): void => {
      if (ph.spines === 'plates') deco.poly([[p0[0] - 2.2 * s, p0[1] - r + 1], [p0[0] - 1.5 * s, p0[1] - r - h], [p0[0] + 1.5 * s, p0[1] - r - h], [p0[0] + 2.2 * s, p0[1] - r + 1]], col[2]);
      else deco.poly([[p0[0] - 1.8 * s, p0[1] - r + 1], [p0[0] - 1.2 * s, p0[1] - r - h], [p0[0] + 1.8 * s, p0[1] - r + 1]], col[ph.spines === 'frill' ? 3 : 2]);
    };
    for (let k = 1; k < 6; k += 1) spike(neckPts[k], G * (0.64 - k * 0.045), 2.4 * s);
    for (let k = 0; k < 5; k++) { const p0 = B(L * (0.45 - k * 0.24), 0); spike(p0, G * 0.96, 3.2 * s); }
  }

  // ── belly, pattern, scales (recolour primary-ramp pixels only) ─────────
  const idx = new Map<number, number>(); pr.forEach((c, i2) => idx.set(c, i2));
  const along = (x: number, y: number): number => (x - cx) * Math.cos(q.tilt) - (y - cy) * Math.sin(q.tilt);
  const seedP = (ph.primary ^ (ph.accent << 1)) & 0xffff;
  skin.map((c, x, y) => {
    const i2 = idx.get(c); if (i2 === undefined) return c;
    const u = along(x, y), lx = x - cx, ly = y - cy;
    // belly / throat: underside of body and neck
    const el = (u / (L * 1.0)) ** 2 + (ly / (G * 1.04)) ** 2;
    const under = ly > G * 0.28 && el > 0.5 && el < 1.12 && lx === lx;
    if (under) return se[i2];
    let pat = false;
    switch (ph.pattern) {
      case 'stripes': pat = ((Math.floor((u + ly * 0.5 + 100) / (2.6 * s + 1))) % 3 === 0) && ly < G * 0.3; break;
      case 'bands': pat = Math.floor((u + 200) / (4.5 * s + 1)) % 2 === 0 && u < -L * 0.5; break;
      case 'spots': pat = hash2(Math.floor((u + 300) / (3.4 * s + 1)), Math.floor((ly + 300) / (3.4 * s + 1)), seedP) > 0.62 && ((Math.floor(u + 300) % Math.ceil(3.4 * s + 1)) > 0); break;
      case 'saddle': pat = ly < -G * 0.15 - Math.abs(u) * 0.12 + Math.sin(u * 0.6) * 1.2 && Math.abs(u) < L * 1.3; break;
      case 'speckle': pat = hash2(x - ox, y - oy + Math.round(q.bob), seedP) > 0.86; break;
      default: break;
    }
    if (pat) return ac[Math.max(0, i2 - (ph.pattern === 'saddle' ? 0 : 0))];
    if (ph.scales === 'plated' && Math.abs(u) < L && Math.abs(ly) < G * 0.9 && (Math.floor(u + 400) % Math.ceil(3 * s + 1) === 0) && (Math.floor(ly + 400 + Math.floor((u + 400) / Math.ceil(3 * s + 1)) ) % 3 !== 0)) return pr[Math.max(0, i2 - 1)];
    if (ph.scales === 'rough' && hash2(Math.round(u), Math.round(ly), 7) > 0.9) return pr[Math.max(0, i2 - 1)];
    return c;
  });

  // ── face details ───────────────────────────────────────────────────────
  const e = Hd(hs * 0.55, -hs * 0.18), ex = Math.round(e[0]), ey = Math.round(e[1]);
  if (q.eye === 'closed') { skin.px(ex - 1, ey + 1, OUT); skin.px(ex, ey + 1, OUT); skin.px(ex + 1, ey + 1, OUT); }
  else if (q.eye === 'happy') { skin.px(ex - 1, ey + 1, OUT); skin.px(ex, ey, OUT); skin.px(ex + 1, ey + 1, OUT); }
  else {
    skin.rect(ex - 1, ey, 2 + (hs > 5 ? 1 : 0), 2, ph.eyes === 'glow' ? mix(ph.eye, 0xffffff, 0.55) : ph.eye);
    if (ph.eyes === 'slit') { skin.px(ex, ey, OUT); skin.px(ex, ey + 1, OUT); } else if (ph.eyes === 'round') { skin.px(ex, ey + 1, OUT); skin.px(ex - 1, ey, 0xffffff); }
    if (q.eye === 'angry') { skin.px(ex - 1, ey - 1, OUT); skin.px(ex, ey - 1, OUT); skin.px(ex + 1, ey, OUT); }
  }
  const no = Hd(hs * (snoutLen + 0.15), 0); skin.px(no[0], no[1], pr[0]);
  for (const f of feet.slice(2)) { deco.px(f[0], f[1], hn[3]); deco.px(f[0] - 1.5, f[1] + 0.4, hn[3]); }

  // ── composite ──────────────────────────────────────────────────────────
  if (q.wing === 'fold') wing(wingN, 0, 0, false); else wing(wingN, 0, 0, false);
  skin.blit(deco, 0, 0);
  const body = new Pix(out.w, out.h);
  body.blit(farL, 0, 0); body.blit(skin, 0, 0);
  wingN.outline(OUT);
  // a raised wing sits behind the neck/head silhouette only at its root; draw it over the body.
  body.blit(wingN, 0, 0);
  body.outline(OUT);
  out.blit(body, 0, 0);
}

/**
 * Where a rider's hip sits on this individual's back for a given animation frame, relative to the
 * frame origin (DRAGON_OX, DRAGON_OY), facing right. Uses exactly the same rig maths as drawDragon.
 */
export function saddlePoint(ph: Phenotype, scale: number, anim: DragonAnim, i: number): [number, number] {
  const q = dragonPose(anim, i), s = ph.size * scale, baby = Math.max(0, 1 - scale) * 0.9;
  const L = 17.5 * s * ph.bodyLen, G = 8.8 * s * ph.girth * (1 + baby * 0.15);
  const legLen = (q.lie ? 2.5 : 9.5) * s * ph.legLen * (1 - baby * 0.2);
  const cy = DRAGON_OY - legLen - G * 0.85 + q.bob - (q.tuck ? 14 * s : 0);
  const x = L * 0.08, y = -G * 0.93;
  const [rx, ry] = rot(x, y, -q.tilt);
  return [rx, cy + ry + q.bow * G * 0.9 * (x / L) - DRAGON_OY];
}

export function dragonFrameNames(): string[] {
  const names: string[] = [];
  for (const [k, d] of Object.entries(DRAGON_ANIMS)) for (let i = 0; i < d.n; i++) names.push(`${k}_${i}`);
  return names;
}

export interface DragonSheet { pix: Pix; frames: Record<string, { x: number; y: number; w: number; h: number }> }

/** Paint every animation frame of one individual. `scale` is the growth multiplier (0.38..1). */
/** `only` limits painting to some animations (others stay blank) — used where a full sheet is not needed. */
export function paintDragonSheet(ph: Phenotype, scale: number, only?: readonly DragonAnim[]): DragonSheet {
  const rows = Math.ceil(DRAGON_FRAME_COUNT / DRAGON_COLS);
  const pix = new Pix(DRAGON_COLS * DRAGON_FW, rows * DRAGON_FH);
  const frames: DragonSheet['frames'] = {};
  let k = 0;
  const cell = new Pix(DRAGON_FW, DRAGON_FH);
  for (const [anim, d] of Object.entries(DRAGON_ANIMS))
    for (let i = 0; i < d.n; i++, k++) {
      cell.clear();
      if (!only || only.includes(anim as DragonAnim)) drawDragon(cell, 0, 0, ph, scale, dragonPose(anim as DragonAnim, i));
      const x = (k % DRAGON_COLS) * DRAGON_FW, y = Math.floor(k / DRAGON_COLS) * DRAGON_FH;
      pix.blit(cell, x, y);
      frames[`${anim}_${i}`] = { x, y, w: DRAGON_FW, h: DRAGON_FH };
    }
  return { pix, frames };
}

/** Top-down flight sprite (pointing right), 80x80 cells: f0–f5 a full wingbeat, f6 wings swept back for a dive/dash. */
export const TOP_CELL = 80, TOP_FRAMES = 7;
export function paintDragonTop(ph: Phenotype, scale: number, rider: boolean): Pix {
  const C = TOP_CELL / 2, pix = new Pix(TOP_CELL * TOP_FRAMES, TOP_CELL), s = ph.size * scale;
  const pr = ramp(ph.primary), se = ramp(ph.secondary), hn = ramp(ph.horn);
  const SPREAD = [1, 0.88, 0.66, 0.46, 0.62, 0.86];
  for (let f = 0; f < TOP_FRAMES; f++) {
    const tuck = f === 6, c = new Pix(TOP_CELL, TOP_CELL), k = tuck ? 0.42 : SPREAD[f], L = 11 * s * ph.bodyLen, G = 4.6 * s * ph.girth;
    const span = Math.min(C - 3, 24 * s * ph.wingSpan * k), sweep = tuck ? 9 * s : (1 - k) * 4 * s; // tips drift back as the wing closes
    for (const sd of [-1, 1]) {
      const sh: V = [C + 2, C + sd * G * 0.6], wr: V = [C + 4 - sweep * 0.4, C + sd * span * 0.55], t1: V = [C - 4 - sweep, C + sd * span], t2: V = [C - 12 - sweep, C + sd * span * 0.8], t3: V = [C - 14 - sweep * 0.6, C + sd * span * 0.45];
      c.poly([sh, wr, t1, [C - 7 - sweep, C + sd * span * 0.82], t2, [C - 12 - sweep * 0.8, C + sd * span * 0.58], t3, [C - 10, C + sd * G * 0.5]], se[sd < 0 ? 3 : 2]);
      // membrane ribs + a lit leading edge on the near (upper) wing
      c.limb(sh[0], sh[1], wr[0], wr[1], 1.4 * s, 1, pr); c.limb(wr[0], wr[1], t1[0], t1[1], 1, 0.5, pr); c.line(wr[0], wr[1], t2[0], t2[1], pr[1]); c.line(wr[0], wr[1], t3[0], t3[1], pr[1]);
      if (sd < 0) c.line(sh[0], sh[1] - 1, wr[0], wr[1] - 1, se[4]);
    }
    let tx = C - L * 0.7, ty = C;
    for (let j = 0; j < 6; j++) { const nx = tx - L * 0.26 * ph.tailLen, ny = C + Math.sin(f * 1.05 + j * 0.9) * 1.8 * (j / 5) * (tuck ? 0.3 : 1); c.limb(tx, ty, nx, ny, G * 0.6 * (1 - j / 6) + 0.6, G * 0.6 * (1 - (j + 1) / 6) + 0.5, pr); tx = nx; ty = ny; }
    if (ph.tail !== 'whip') c.poly([[tx + 1, ty], [tx - 4 * s, ty - 3 * s], [tx - 2 * s, ty], [tx - 4 * s, ty + 3 * s]], ph.tail === 'club' ? hn[2] : se[2]);
    c.limb(C - L * 0.7, C, C + L * 0.6, C, G * 0.9, G, pr);
    c.limb(C + L * 0.6, C, C + L * 1.25, C, G * 0.6, G * 0.45, pr);
    c.ball(C + L * 1.45, C, 3.4 * s, 2.9 * s, pr); c.limb(C + L * 1.5, C, C + L * 1.5 + 4.5 * s, C, 1.9 * s, 1.2 * s, pr);
    c.px(C + L * 1.5 + 1, C - 2 * s, ph.eye); c.px(C + L * 1.5 + 1, C + 2 * s, ph.eye);
    if (ph.horns !== 'none') for (const sd of [-1, 1]) c.limb(C + L * 1.35, C + sd * 2 * s, C + L * 1.35 - 4 * s, C + sd * 4 * s, 0.9, 0.3, hn);
    if (ph.spines !== 'none') for (let j = 0; j < 5; j++) c.px(C - L * 0.5 + j * L * 0.3, C, hn[3]);
    for (let j = -2; j <= 3; j++) c.px(C + j * L * 0.2, C - G * 0.55, pr[4]); // sun on the spine
    if (rider) {
      // top-down rider: saddle blanket, shoulders, arms on the reins, hair + headband, scarf streaming back
      const tun = ramp(0x3f55a0), skin = ramp(0xd9955f), hair = ramp(0x33283f), R = C - 2;
      c.rect(R - 4, C - 3, 6, 7, 0xc8463a); c.rect(R - 4, C - 3, 6, 1, 0xf2c14e); c.rect(R - 4, C + 3, 6, 1, 0xf2c14e);
      for (let q = 0; q < 4; q++) { const y = C + Math.sin(f * 1.05 + q) * 0.8 * (q / 3) * (tuck ? 0.2 : 1); c.px(R - 5 - q * 1.6 - (tuck ? q : 0), y, q < 2 ? 0xe4533c : 0xb8352a); c.px(R - 5 - q * 1.6 - (tuck ? q : 0), y + 1, 0xb8352a); }
      c.ball(R - 1, C, 2.4, 3.2, tun);
      c.line(R, C - 2, R + 3, C - 1, skin[2]); c.line(R, C + 2, R + 3, C + 1, skin[2]); c.px(R + 3, C - 1, skin[3]); c.px(R + 3, C + 1, skin[3]);
      c.line(R + 3, C, R + 7 + L * 0.1, C, 0x7c4a2e);
      c.ball(R + 0.5, C, 1.8, 1.8, hair); c.px(R + 1, C, skin[2]); c.px(R, C - 1, 0xf2c14e); c.px(R, C + 1, 0xf2c14e);
    }
    c.outline(OUT);
    pix.blit(c, f * TOP_CELL, 0);
  }
  return pix;
}
