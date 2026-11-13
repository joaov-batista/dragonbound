import { Pix, hash2, vnoise, mix } from './Pix';
import type { Theme } from './themes';

export const BD_W = 512;

/** Vertical dithered sky gradient strip (8 x 240). */
export function paintSky(th: Theme): Pix {
  const p = new Pix(8, 240);
  for (let y = 0; y < 240; y++) {
    const t = y / 239, bands = 14;
    for (let x = 0; x < 8; x++) {
      const tt = t * bands, f = tt - Math.floor(tt);
      const q = (Math.floor(tt) + (f > 0.5 + (((x + y) & 1) ? 0.22 : -0.22) ? 1 : 0)) / bands;
      p.px(x, y, q < 0.55 ? mix(th.skyTop, th.skyMid, q / 0.55) : mix(th.skyMid, th.skyLow, (q - 0.55) / 0.45));
    }
  }
  return p;
}

export function paintClouds(th: Theme, seed: number): Pix {
  const p = new Pix(BD_W, 96);
  const n = th.id === 'tropical' ? 7 : 12;
  for (let i = 0; i < n; i++) {
    const cx = hash2(i, 1, seed) * BD_W, cy = 22 + hash2(i, 2, seed) * 50, w = 26 + hash2(i, 3, seed) * (th.id === 'tropical' ? 40 : 70);
    const puffs = 4 + Math.floor(hash2(i, 4, seed) * 4);
    const layer = new Pix(BD_W, 96);
    for (let k = 0; k < puffs; k++) {
      const px = cx + (k / (puffs - 1) - 0.5) * w, r = 6 + hash2(i, 10 + k, seed) * 8 * (1 - Math.abs(k / (puffs - 1) - 0.5));
      for (const wx of [px, px - BD_W, px + BD_W]) layer.ellipse(wx, cy - r * 0.5, r * 1.25, r, th.cloud);
    }
    for (const wx of [cx, cx - BD_W, cx + BD_W]) layer.rect(Math.round(wx - w / 2 - 6), Math.round(cy - 2), Math.round(w + 12), 5, th.cloud);
    for (let y = 0; y < 96; y++) for (let x = 0; x < BD_W; x++) {
      if (!layer.solid(x, y)) continue;
      if (y > cy - 1 || (!layer.solid(x, y + 3) && y > cy - 6)) layer.px(x, y, th.cloudShade);
      else if (!layer.solid(x, y - 1)) layer.px(x, y, mix(th.cloud, 0xffffff, 0.5));
    }
    p.blit(layer, 0, 0);
  }
  return p;
}

function ridge(p: Pix, base: number, amp: number, freq: number, seed: number, col: number, jag: number, hi: number): number[] {
  const hs: number[] = [];
  for (let x = 0; x < BD_W; x++) {
    const a = (x / BD_W) * Math.PI * 2;
    let h = 0;
    for (let o = 1; o <= 4; o++) h += Math.sin(a * freq * o + hash2(o, 1, seed) * 6.28) / o;
    h = base - (h * 0.5 + 0.5) * amp - jag * Math.abs(Math.sin(a * freq * 5 + seed)) * amp * 0.25;
    h = Math.round(h); hs.push(h);
    for (let y = h; y < p.h; y++) p.px(x, y, y - h < 2 ? hi : col);
  }
  return hs;
}

/** Far layer: horizon sea + distant landmasses. Horizon at y = 110 of a 160px tall strip. */
export function paintFar(th: Theme, seed: number): Pix {
  const p = new Pix(BD_W, 160), HZ = 110;
  const farC = mix(th.far, th.skyLow, 0.45);
  const layer = new Pix(BD_W, 160);
  if (th.id === 'volcanic') {
    // great cone with glowing crater
    for (let x = 0; x < BD_W; x++) {
      const d = Math.abs(x - 300), h = Math.max(0, 92 - d * 0.62 - (d < 14 ? (14 - d) * -0.4 + 6 : 0)) + vnoise(x / 9, 0, seed) * 4;
      for (let y = HZ - Math.round(h); y < HZ; y++) layer.px(x, y, y < HZ - h + 3 ? mix(farC, 0xffffff, 0.2) : farC);
    }
    for (let x = 288; x < 313; x++) for (let y = 0; y < 5; y++) if (layer.solid(x, HZ - 88 + y + 4)) layer.px(x, HZ - 84 + y - Math.round(Math.abs(x - 300) * 0.2), y < 2 ? 0xffd27a : 0xf2742e);
    for (let i = 0; i < 26; i++) layer.ellipse(300 + i * 3.5 + vnoise(i, 2, seed) * 8, HZ - 96 - i * 2.2, 5 + i * 0.7, 4 + i * 0.35, mix(th.cloudShade, th.skyMid, 0.35 + i * 0.02));
    ridge(layer, HZ, 26, 3, seed + 4, mix(farC, th.mid, 0.2), 1, mix(farC, 0xffffff, 0.1));
  } else if (th.id === 'storm') {
    for (let i = 0; i < 9; i++) {
      const cx = hash2(i, 5, seed) * BD_W, w = 8 + hash2(i, 6, seed) * 16, h = 30 + hash2(i, 7, seed) * 62;
      for (let x = -w; x <= w; x++) {
        const hh = h * (1 - Math.pow(Math.abs(x) / w, 1.6)) + vnoise((cx + x) / 3, i, seed) * 6;
        for (let y = HZ - Math.round(hh); y < HZ; y++) layer.px(((cx + x) % BD_W + BD_W) % BD_W, y, x < -w * 0.2 ? mix(farC, 0xffffff, 0.12) : farC);
      }
    }
  } else {
    ridge(layer, HZ + 4, 46, 2, seed, farC, 0.2, mix(farC, 0xffffff, 0.25));
    ridge(layer, HZ + 2, 22, 5, seed + 9, mix(farC, th.mid, 0.3), 0.1, mix(farC, th.mid, 0.15));
  }
  for (let y = HZ; y < 160; y++) for (let x = 0; x < BD_W; x++) layer.erase(x, y);
  p.blit(layer, 0, 0);
  // sea
  for (let y = HZ; y < 160; y++)
    for (let x = 0; x < BD_W; x++) {
      const t = (y - HZ) / 50;
      let c = mix(mix(th.sea, th.skyLow, 0.45), th.seaDeep, Math.min(1, t));
      const band = Math.floor((y - HZ) / (1 + (y - HZ) * 0.12));
      if (hash2(Math.floor((x + band * 37) / (3 + (y - HZ) * 0.2)), band, seed) > 0.8 && ((y - HZ) % 3 === 0)) c = mix(c, 0xffffff, 0.35);
      p.px(x, y, c);
    }
  for (let x = 0; x < BD_W; x++) p.px(x, HZ, mix(th.skyLow, 0xffffff, 0.5));
  return p;
}

/** Mid layer: nearer silhouettes, transparent sky above, solid to the bottom. */
export function paintMid(th: Theme, seed: number): Pix {
  const p = new Pix(BD_W, 200);
  const c = mix(th.mid, th.skyLow, 0.28), c2 = mix(th.mid, 0x000000, 0.18);
  const hs = ridge(p, 120, th.id === 'tropical' ? 44 : 70, th.id === 'tropical' ? 3 : 4, seed, c, th.id === 'tropical' ? 0.1 : 1.2, mix(c, 0xffffff, 0.18));
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(hash2(i, 3, seed) * BD_W), y = hs[x];
    if (th.id === 'tropical') {
      if (i % 3 === 0) { // palm silhouette
        const h = 14 + hash2(i, 4, seed) * 12;
        p.line(x, y, x + 3, y - h, c2);
        for (let k = 0; k < 6; k++) { const a = (k / 5) * Math.PI; for (let s = 0; s < 9; s++) p.px(x + 3 + Math.cos(a) * s, y - h - Math.sin(a) * s * 0.6 + s * s * 0.07, c2); }
      } else p.ellipse(x, y - 3, 7 + hash2(i, 5, seed) * 9, 5 + hash2(i, 6, seed) * 6, hash2(i, 8, seed) > 0.5 ? c : mix(c, 0xffffff, 0.1));
    } else if (th.id === 'volcanic') {
      const h = 8 + hash2(i, 4, seed) * 16;
      p.line(x, y, x, y - h, c2); p.line(x, y - h * 0.6, x - 4, y - h * 0.9, c2); p.line(x, y - h * 0.4, x + 5, y - h * 0.75, c2);
    } else {
      const h = 10 + hash2(i, 4, seed) * 14;
      for (let s = 0; s < h; s++) { const w = (s / h) * 5; for (let k = -w; k <= w * 0.4; k++) p.px(x + k + (h - s) * 0.35, y - h + s, c2); }
    }
  }
  for (let x = 0; x < BD_W; x++) for (let y = hs[x] + 14; y < 200; y++) if (((x + y) & 1) === 0 || y > hs[x] + 30) p.px(x, y, c2);
  return p;
}
