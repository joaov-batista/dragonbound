import Phaser from 'phaser';
import { Pix, mix } from '../art/Pix';
import { pixToTexture } from '../art/runtime';
import { THEMES } from '../art/themes';
import { DEPTH, TILE } from '../core/constants';
import { settings } from '../core/settings';
import { Liquid } from '../physics/TileGrid';
import type { IslandData } from './islands/types';

interface Surface { ts: Phaser.GameObjects.TileSprite; speed: number }

/** Builds the visual representation of an island: tile layers, liquids, props, glow lights. */
export class IslandView {
  private surfaces: Surface[] = []; private swayers: Phaser.GameObjects.Image[] = []; private lights: Phaser.GameObjects.Image[] = [];
  private maps: Phaser.Tilemaps.Tilemap[] = [];
  constructor(private scene: Phaser.Scene, island: IslandData) {
    const g = island.grid, th = THEMES[island.biome];
    // tile layers (Phaser culls off-screen tiles, so only the visible region is drawn)
    const toRows = (src: Uint16Array): number[][] => { const rows: number[][] = []; for (let y = 0; y < g.h; y++) { const r = new Array<number>(g.w); for (let x = 0; x < g.w; x++) r[x] = src[y * g.w + x] - 1; rows.push(r); } return rows; };
    for (const [src, depth] of [[g.bg, DEPTH.bgTiles], [g.fg, DEPTH.fgTiles]] as const) {
      const map = scene.make.tilemap({ data: toRows(src), tileWidth: TILE, tileHeight: TILE });
      const ts = map.addTilesetImage(island.biome, island.biome, TILE, TILE, 0, 0)!;
      map.createLayer(0, ts, 0, 0)!.setDepth(depth);
      this.maps.push(map);
    }
    this.makeLiquidTextures(th.water);
    // liquids: merge horizontal runs per row, then stack equal runs into rectangles
    type Run = { x0: number; x1: number; y0: number; y1: number; kind: Liquid };
    const open: Run[] = [], done: Run[] = [];
    for (let y = 0; y < g.h; y++) {
      const runs: Run[] = [];
      for (let x = 0; x < g.w; x++) { const k = g.liquid[y * g.w + x] as Liquid; if (!k) continue; let x1 = x; while (x1 + 1 < g.w && g.liquid[y * g.w + x1 + 1] === k) x1++; runs.push({ x0: x, x1, y0: y, y1: y, kind: k }); x = x1; }
      for (let i = open.length - 1; i >= 0; i--) { const o = open[i], m = runs.findIndex((r) => r.x0 === o.x0 && r.x1 === o.x1 && r.kind === o.kind); if (m >= 0) { o.y1 = y; runs.splice(m, 1); } else { done.push(o); open.splice(i, 1); } }
      open.push(...runs);
    }
    done.push(...open);
    for (const r of done) {
      const x = r.x0 * TILE, y = r.y0 * TILE, w = (r.x1 - r.x0 + 1) * TILE, h = (r.y1 - r.y0 + 1) * TILE, lava = r.kind === Liquid.Lava;
      const exposed = r.y0 === 0 || g.liquid[(r.y0 - 1) * g.w + r.x0] !== r.kind;
      scene.add.rectangle(x, y + (exposed ? 5 : 0), w, h - (exposed ? 5 : 0), lava ? 0xe8501c : th.water, lava ? 0.95 : 0.5).setOrigin(0).setDepth(DEPTH.liquid);
      if (h > 40 && !lava) scene.add.rectangle(x, y + 40, w, h - 40, mix(th.water, 0x08102a, 0.6), 0.35).setOrigin(0).setDepth(DEPTH.liquid);
      if (exposed) {
        const ts = scene.add.tileSprite(x, y, w, 8, lava ? 'lava-surface' : 'water-surface').setOrigin(0).setDepth(DEPTH.liquid + 1).setAlpha(lava ? 1 : 0.85);
        this.surfaces.push({ ts, speed: lava ? 5 : 11 + (r.y0 % 3) * 3 });
      }
    }
    // props
    for (const p of island.props) {
      const img = scene.add.image(p.x, p.y, 'props', p.key).setOrigin(0.5, 1).setFlipX(!!p.flip).setDepth(p.front ? DEPTH.propsFront : DEPTH.propsBack);
      if (p.tint !== undefined) img.setTint(p.tint);
      if (p.sway) this.swayers.push(img);
    }
    // additive glow lights
    if (settings.quality !== 'low') for (const l of island.lights) {
      const img = scene.add.image(l.x, l.y, 'props', l.r > 70 ? 'light128' : 'light64').setBlendMode(Phaser.BlendModes.ADD).setTint(l.color).setAlpha(0.38).setDepth(DEPTH.light);
      img.setScale((l.r * 2) / (l.r > 70 ? 128 : 64)); this.lights.push(img);
    }
  }

  private makeLiquidTextures(water: number): void {
    const mk = (key: string, top: number, body: number, hi: number): void => {
      if (this.scene.textures.exists(key)) return; // shared by every lane of the island; removed on scene shutdown
      const p = new Pix(32, 8);
      for (let x = 0; x < 32; x++) {
        const y = Math.round(2 + Math.sin((x / 32) * Math.PI * 2) * 1.2 + Math.sin((x / 32) * Math.PI * 4) * 0.6);
        p.px(x, y, hi); p.px(x, y + 1, top); for (let j = y + 2; j < 8; j++) p.px(x, j, body, key === 'lava-surface' ? 242 : 128);
        if (x % 11 === 3) p.px(x, y + 3, hi, 160);
      }
      pixToTexture(this.scene, key, p);
    };
    mk('water-surface', mix(water, 0xffffff, 0.45), water, 0xffffff);
    mk('lava-surface', 0xffb030, 0xe8501c, 0xfff0a0);
  }

  /** Puffy clouds scattered through the flyable sky (between the flight ceiling and the terrain). They give flight a sense of speed and altitude. */
  /** sky clouds a rider can punch through */
  readonly skyPuffs: { img: Phaser.GameObjects.Image; front: boolean }[] = [];
  addSkyClouds(island: IslandData, ceilAt: (x: number) => number): void {
    const th = THEMES[island.biome], g = island.grid;
    for (let v = 0; v < 3; v++) if (!this.scene.textures.exists(`skypuff${island.biome}${v}`)) {
      const w = 64 + v * 24, h = 26 + v * 6, p = new Pix(w, h);
      for (let k = 0; k < 5 + v; k++) { const cx = 12 + ((w - 24) * k) / (4 + v), r = 7 + ((k * 37 + v * 11) % 7) + (k > 0 && k < 4 + v ? 3 : 0); p.ellipse(cx, h - 8 - r * 0.5, r * 1.2, r, th.cloud); }
      p.rect(6, h - 10, w - 12, 6, th.cloud);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (p.solid(x, y)) { if (y > h - 9 || !p.solid(x, y + 3)) p.px(x, y, th.cloudShade); else if (!p.solid(x, y - 1)) p.px(x, y, mix(th.cloud, 0xffffff, 0.5)); }
      pixToTexture(this.scene, `skypuff${island.biome}${v}`, p);
    }
    let seed = island.seed;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let x = rnd() * 200; x < g.pxW; x += 150 + rnd() * 230) {
      const ground = g.groundBelow(x, 0, g.h) ?? island.seaRow * TILE;
      const lo = ceilAt(x) - 20, hi = Math.min(ground - 90, island.seaRow * TILE - 120);
      if (hi <= lo) continue;
      const front = rnd() < 0.3, v = Math.floor(rnd() * 3);
      const img = this.scene.add.image(Math.round(x), Math.round(lo + rnd() * (hi - lo)), `skypuff${island.biome}${v}`).setDepth(front ? DEPTH.weather - 1 : DEPTH.bgTiles - 5).setAlpha(front ? 0.55 : 0.9).setFlipX(rnd() < 0.5);
      this.skyPuffs.push({ img, front });
    }
  }

  addLight(x: number, y: number, r: number, color: number, alpha = 0.4): Phaser.GameObjects.Image {
    const img = this.scene.add.image(x, y, 'props', r > 70 ? 'light128' : 'light64').setBlendMode(Phaser.BlendModes.ADD).setTint(color).setAlpha(alpha).setDepth(DEPTH.light);
    img.setScale((r * 2) / (r > 70 ? 128 : 64)); this.lights.push(img);
    return img;
  }

  update(time: number, dt: number, cam: Phaser.Cameras.Scene2D.Camera, night: number): void {
    for (const s of this.surfaces) s.ts.tilePositionX += s.speed * dt;
    const l = cam.worldView.x - 100, r = cam.worldView.right + 100;
    for (const img of this.swayers) if (img.x > l && img.x < r) img.setRotation(Math.sin(time / 900 + img.x * 0.05) * 0.03);
    const a = 0.07 + night * 0.4;
    for (const img of this.lights) img.setAlpha(a + Math.sin(time / 300 + img.x) * 0.04);
  }
}
