import { TILE } from '../core/constants';

export const enum Cell { Empty = 0, Solid = 1, OneWay = 2, Hazard = 3 }
export const enum Liquid { None = 0, Water = 1, Lava = 2 }

/** Collision + tile data for one island. Tile layers store (tileIndex + 1); 0 = empty. */
export class TileGrid {
  readonly cells: Uint8Array;
  readonly liquid: Uint8Array;
  readonly fg: Uint16Array;
  readonly bg: Uint16Array;
  constructor(readonly w: number, readonly h: number) {
    this.cells = new Uint8Array(w * h); this.liquid = new Uint8Array(w * h);
    this.fg = new Uint16Array(w * h); this.bg = new Uint16Array(w * h);
  }
  get pxW(): number { return this.w * TILE; }
  get pxH(): number { return this.h * TILE; }
  inb(tx: number, ty: number): boolean { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  /** Out-of-bounds is solid at the sides/bottom and open at the top. */
  cell(tx: number, ty: number): Cell {
    if (ty < 0) return Cell.Empty;
    if (tx < 0 || tx >= this.w || ty >= this.h) return Cell.Solid;
    return this.cells[ty * this.w + tx] as Cell;
  }
  solid(tx: number, ty: number): boolean { return this.cell(tx, ty) === Cell.Solid; }
  solidPx(x: number, y: number): boolean { return this.solid(Math.floor(x / TILE), Math.floor(y / TILE)); }
  liquidAt(x: number, y: number): Liquid {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return this.inb(tx, ty) ? (this.liquid[ty * this.w + tx] as Liquid) : Liquid.None;
  }
  /** First solid row at or below pixel (x,y); returns world y of its top, or null. */
  groundBelow(x: number, y: number, maxTiles = 40): number | null {
    const tx = Math.floor(x / TILE);
    for (let ty = Math.max(0, Math.floor(y / TILE)), n = 0; n < maxTiles && ty < this.h; ty++, n++) {
      const c = this.cell(tx, ty);
      if (c === Cell.Solid || c === Cell.OneWay) return ty * TILE;
    }
    return null;
  }
  /** Straight-line visibility test between two points (coarse steps). */
  los(x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 8);
    for (let i = 1; i < n; i++) if (this.solidPx(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)) return false;
    return true;
  }
}
