import { Pix, hash2, mix, vnoise } from '../../art/Pix';
import { THEMES } from '../../art/themes';
import type { IslandSite } from '../generation/archipelago';

/** Islands are wider than tall on the sea map, matching their east–west side-view layout. */
export const ISL_RX = 1.25, ISL_RY = 0.72;
/** Normalised distance from an island centre (1 = shoreline). */
export const islandDist = (s: IslandSite, x: number, y: number): number => Math.hypot((x - s.x) / (s.r * ISL_RX), (y - s.y) / (s.r * ISL_RY));

/** Paint the top-down sprite of an island from its seed and biome. Drawn at half resolution and shown at 2x. */
export function paintIslandTop(site: IslandSite): Pix {
  const th = THEMES[site.biome], R = site.r / 2, w = Math.ceil(R * ISL_RX * 2.5), h = Math.ceil(R * ISL_RY * 2.6), p = new Pix(w, h), cx = w / 2, cy = h / 2, seed = site.seed & 0xffff;
  const height = (x: number, y: number): number => {
    const nx = (x - cx) / (R * ISL_RX), ny = (y - cy) / (R * ISL_RY), a = Math.atan2(ny, nx);
    const rim = 1 + (vnoise(Math.cos(a) * 2.2 + 5, Math.sin(a) * 2.2 + 5, seed) - 0.5) * 0.5 + (vnoise(Math.cos(a) * 7 + 9, Math.sin(a) * 7 + 9, seed + 3) - 0.5) * 0.14;
    return 1 - Math.hypot(nx, ny) / rim; // >0 land, 0 shoreline
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = height(x, y);
    if (e < -0.22) continue;
    if (e < 0) { if (e > -0.05 ? hash2(x, y, seed) > 0.25 : (x + y) % 2 === 0) p.px(x, y, e > -0.05 ? 0xffffff : mix(th.water, 0xffffff, 0.35), e > -0.05 ? 230 : 110); continue; }
    const n = vnoise(x / 6, y / 6, seed + 7), lit = height(x - 1, y - 1) < e ? 1 : 0;
    let c: number;
    if (e < 0.1) c = th.sand[lit ? 3 : 2];
    else if (site.biome === 'tropical') c = e > 0.55 && n > 0.45 ? th.rock[lit ? 3 : 2] : n > 0.55 ? th.leaf2[lit ? 3 : 2] : th.leaf[lit ? 3 : 2];
    else if (site.biome === 'volcanic') c = e > 0.78 ? (e > 0.86 ? (hash2(x, y, 1) > 0.5 ? 0xffb030 : 0xe8501c) : th.rock[0]) : n > 0.6 ? th.soil[lit ? 3 : 1] : th.rock[lit ? 3 : 2];
    else c = n > 0.62 ? th.top[lit ? 3 : 2] : e > 0.4 ? th.rock[lit ? 4 : 2] : th.rock[lit ? 3 : 1];
    if (e > 0.12 && hash2(x, y, seed + 2) > 0.93) c = mix(c, 0x000000, 0.25);
    p.px(x, y, c);
  }
  // pier on the west shore
  const py = Math.round(cy + 6);
  for (let x = 0; x < w; x++) if (height(x, py) > 0.02) { for (let k = 1; k <= 7; k++) { p.px(x - k, py, th.wood[2]); p.px(x - k, py + 1, th.wood[0]); } break; }
  p.outline(mix(th.seaDeep, 0x000000, 0.35));
  return p;
}
