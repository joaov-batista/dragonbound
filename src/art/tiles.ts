import { Pix, hash2, vnoise, mix, type Ramp } from './Pix';
import type { Theme } from './themes';

export const TILE = 16;
export const TS_COLS = 16;
/** Tile index bases. Autotiled materials occupy 16 consecutive indices (4-bit neighbour mask). */
export const MAT = { EARTH: 0, SAND: 16, ROCK: 32, RUIN: 48, BG_ROCK: 64, BG_RUIN: 80 } as const;
export const SPECIAL = { PLAT_L: 96, PLAT_M: 97, PLAT_R: 98, BRIDGE: 99, SPIKES: 100, DOCK: 101, DOCK_POST: 102, BG_WOOD: 103 } as const;
export const VARIANT_BASE = 112; // + materialOrdinal*4 + v, used for fully enclosed tiles
export const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;

type Kind = 'earth' | 'sand' | 'rock' | 'ruin';

function body(p: Pix, ox: number, oy: number, kind: Kind, r: Ramp, seed: number): void {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      let c = r[2];
      if (kind === 'earth') {
        const n = vnoise(x / 4, y / 4, seed, 4);
        c = n > 0.62 ? r[1] : n < 0.25 ? r[3] : r[2];
        if (hash2(x, y, seed + 3) > 0.955) c = r[4];
        if (hash2(x, y - 1, seed + 3) > 0.955) c = r[0];
      } else if (kind === 'sand') {
        const n = vnoise(x / 5, y / 3, seed, 3);
        c = n > 0.84 ? r[1] : r[2];
        if (hash2(x, y, seed + 5) > 0.93) c = r[3];
        if (hash2(x, y, seed + 9) > 0.975) c = r[1];
      } else if (kind === 'rock') {
        const row = Math.floor((y + 1) / 5), off = (row * 7 + (seed % 5)) % 9;
        const cellX = Math.floor((x + off) / 9), lx = (x + off) % 9, ly = (y + 1) % 5;
        const tone = hash2(cellX, row, seed);
        c = tone > 0.66 ? r[1] : tone < 0.2 ? r[3] : r[2];
        if (ly === 0 || lx === 0) c = r[0];
        else if (ly === 1 && lx > 1) c = mix(c, r[4], 0.45);
        if (hash2(x, y, seed + 1) > 0.97) c = r[1];
      } else {
        const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
        const lx = (x + off) % 8, ly = y % 4, cell = Math.floor((x + off) / 8);
        const tone = hash2(cell, row, seed);
        c = tone > 0.75 ? r[1] : tone < 0.15 ? r[3] : r[2];
        if (ly === 3 || lx === 7) c = r[0];
        else if (ly === 0) c = mix(c, r[4], 0.35);
        if (tone > 0.9 && lx > 1 && lx < 6 && ly === 1) c = r[0];
      }
      p.px(ox + x, oy + y, c);
    }
}

function edges(p: Pix, ox: number, oy: number, kind: Kind, r: Ramp, th: Theme, mask: number, seed: number): void {
  const up = !(mask & UP), right = !(mask & RIGHT), down = !(mask & DOWN), left = !(mask & LEFT);
  if (left) for (let y = 0; y < TILE; y++) { p.px(ox, oy + y, r[1]); p.px(ox + 1, oy + y, hash2(1, y, seed) > 0.4 ? r[3] : r[2]); }
  if (right) for (let y = 0; y < TILE; y++) { p.px(ox + 15, oy + y, r[0]); p.px(ox + 14, oy + y, r[1]); if (hash2(2, y, seed) > 0.6) p.px(ox + 13, oy + y, r[1]); }
  if (down) for (let x = 0; x < TILE; x++) { p.px(ox + x, oy + 15, r[0]); p.px(ox + x, oy + 14, r[1]); if (hash2(x, 3, seed) > 0.5) p.px(ox + x, oy + 13, r[1]); }
  if (up) {
    if (kind === 'earth') {
      const g = th.top;
      for (let x = 0; x < TILE; x++) {
        const d = 3 + (hash2(x, 7, seed) > 0.55 ? 1 : 0) + (hash2(Math.floor(x / 3), 8, seed) > 0.7 ? 1 : 0);
        for (let y = 0; y < d; y++) p.px(ox + x, oy + y, y === 0 ? (hash2(x, 9, seed) > 0.6 ? g[4] : g[3]) : y === d - 1 ? g[1] : g[2]);
        p.px(ox + x, oy + d, r[0]);
      }
    } else if (kind === 'sand') {
      for (let x = 0; x < TILE; x++) { p.px(ox + x, oy, r[4]); p.px(ox + x, oy + 1, hash2(x, 4, seed) > 0.4 ? r[3] : r[2]); }
    } else {
      for (let x = 0; x < TILE; x++) { p.px(ox + x, oy, r[4]); p.px(ox + x, oy + 1, r[3]); }
      for (let x = 0; x < TILE; x++)
        if (vnoise(x / 3, seed, seed + 11, 0) > (kind === 'ruin' ? 0.5 : 0.68)) {
          p.px(ox + x, oy, mix(th.moss, 0xffffff, 0.25)); p.px(ox + x, oy + 1, th.moss);
          if (hash2(x, 12, seed) > 0.5) p.px(ox + x, oy + 2, mix(th.moss, 0, 0.3));
        }
    }
  }
  // soften convex corners
  if (up && left) p.erase(ox, oy);
  if (up && right) p.erase(ox + 15, oy);
  if (down && left) { p.erase(ox, oy + 15); }
  if (down && right) { p.erase(ox + 15, oy + 15); }
}

function bgTile(p: Pix, ox: number, oy: number, kind: Kind, r: Ramp, th: Theme, mask: number, seed: number): void {
  body(p, ox, oy, kind, r, seed);
  const t = new Pix(TILE, TILE);
  t.blit(p, 0, 0, false, ox, oy, TILE, TILE);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const c = t.get(x, y);
      let k = 0.62;
      const dU = !(mask & UP) ? y : 99, dD = !(mask & DOWN) ? 15 - y : 99, dL = !(mask & LEFT) ? x : 99, dR = !(mask & RIGHT) ? 15 - x : 99;
      const d = Math.min(dU, dD, dL, dR);
      const rag = Math.floor(hash2(x + y * 3, Math.floor((x * (dU === d || dD === d ? 1 : 0) + y * (dL === d || dR === d ? 1 : 0)) / 2), seed) * 3);
      if (d < rag) { p.erase(ox + x, oy + y); continue; }
      if (d < rag + 2) k = 0.8;
      p.px(ox + x, oy + y, mix(c, th.bgTint, k));
    }
}

function special(p: Pix, ox: number, oy: number, id: number, th: Theme): void {
  const w = th.wood;
  const plank = (y: number, h: number, x0 = 0, x1 = 15): void => {
    for (let x = x0; x <= x1; x++)
      for (let j = 0; j < h; j++) p.px(ox + x, oy + y + j, j === 0 ? w[3] : j === h - 1 ? w[0] : (x % 8 === 7 ? w[1] : w[2]));
  };
  switch (id) {
    case SPECIAL.PLAT_L: plank(0, 5, 1); p.rect(ox + 3, oy + 5, 2, 6, w[1]); p.line(ox + 4, oy + 10, ox + 10, oy + 5, w[0]); break;
    case SPECIAL.PLAT_M: plank(0, 5); break;
    case SPECIAL.PLAT_R: plank(0, 5, 0, 14); p.rect(ox + 11, oy + 5, 2, 6, w[1]); p.line(ox + 11, oy + 10, ox + 5, oy + 5, w[0]); break;
    case SPECIAL.BRIDGE: plank(2, 4); p.rect(ox, oy, 16, 1, w[1]); for (let x = 3; x < 16; x += 8) p.rect(ox + x, oy, 1, 3, w[0]); break;
    case SPECIAL.SPIKES:
      for (let i = 0; i < 4; i++) for (let y = 0; y < 10; y++) {
        const hw = Math.floor(y / 5);
        for (let x = -hw; x <= hw; x++) p.px(ox + 2 + i * 4 + x, oy + 6 + y, x < 0 || y < 2 ? th.rock[4] : x > 0 ? th.rock[1] : th.rock[3]);
      }
      break;
    case SPECIAL.DOCK: plank(0, 4); plank(4, 2); p.rect(ox + 2, oy + 6, 3, 10, w[1]); p.rect(ox + 2, oy + 6, 1, 10, w[3]); p.rect(ox + 11, oy + 6, 3, 10, w[1]); p.rect(ox + 11, oy + 6, 1, 10, w[3]); break;
    case SPECIAL.DOCK_POST: p.rect(ox + 2, oy, 3, 16, w[1]); p.rect(ox + 2, oy, 1, 16, w[2]); p.rect(ox + 11, oy, 3, 16, w[1]); p.rect(ox + 11, oy, 1, 16, w[2]); p.line(ox + 4, oy + 2, ox + 11, oy + 12, w[0]); break;
    case SPECIAL.BG_WOOD:
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.px(ox + x, oy + y, mix(x % 5 === 4 ? w[0] : hash2(x, y, 5) > 0.8 ? w[1] : w[2], th.bgTint, 0.45));
      break;
  }
}

/** Paint a full 16-column tileset for one biome theme. */
export function paintTileset(th: Theme): Pix {
  const p = new Pix(TS_COLS * TILE, 9 * TILE);
  const mats: [number, Kind, Ramp][] = [[MAT.EARTH, 'earth', th.soil], [MAT.SAND, 'sand', th.sand], [MAT.ROCK, 'rock', th.rock], [MAT.RUIN, 'ruin', th.ruin]];
  mats.forEach(([base, kind, r], mi) => {
    for (let m = 0; m < 16; m++) {
      const ox = m * TILE, oy = (base / 16) * TILE;
      body(p, ox, oy, kind, r, mi * 31 + m);
      edges(p, ox, oy, kind, r, th, m, mi * 31 + m);
    }
    for (let v = 0; v < 4; v++) body(p, (mi * 4 + v) * TILE, 7 * TILE, kind, r, 500 + mi * 17 + v);
  });
  ([[MAT.BG_ROCK, 'rock', th.rock], [MAT.BG_RUIN, 'ruin', th.ruin]] as [number, Kind, Ramp][]).forEach(([base, kind, r], bi) => {
    for (let m = 0; m < 16; m++) bgTile(p, m * TILE, (base / 16) * TILE, kind, r, th, m, 900 + bi * 40 + m);
    for (let v = 0; v < 4; v++) bgTile(p, (bi * 4 + v) * TILE, 8 * TILE, kind, r, th, 15, 990 + bi * 9 + v);
  });
  for (let id = 96; id <= 103; id++) special(p, (id % 16) * TILE, 6 * TILE, id, th);
  return p;
}
