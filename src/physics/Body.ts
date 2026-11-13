import { TILE } from '../core/constants';
import { Cell, Liquid, type TileGrid } from './TileGrid';

/** Kinematic AABB. (x, y) is the centre-bottom ("feet") position. */
export interface Body {
  x: number; y: number; w: number; h: number; vx: number; vy: number;
  onGround: boolean; wall: -1 | 0 | 1; hitCeil: boolean; dropThrough: number;
  inLiquid: Liquid; submerged: boolean; hazard: boolean; stepUp: boolean; landed: number;
}

export const makeBody = (x: number, y: number, w: number, h: number): Body => ({
  x, y, w, h, vx: 0, vy: 0, onGround: false, wall: 0, hitCeil: false, dropThrough: 0,
  inLiquid: Liquid.None, submerged: false, hazard: false, stepUp: true, landed: 0,
});

function overlapsSolid(g: TileGrid, l: number, t: number, r: number, b: number): boolean {
  const x0 = Math.floor(l / TILE), x1 = Math.floor((r - 0.001) / TILE), y0 = Math.floor(t / TILE), y1 = Math.floor((b - 0.001) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (g.cell(tx, ty) === Cell.Solid) return true;
  return false;
}

/** Integrates velocity and resolves against the grid. Substeps so fast bodies never tunnel. */
export function moveBody(g: TileGrid, b: Body, dt: number): void {
  const wasGround = b.onGround, vyIn = b.vy;
  b.wall = 0; b.hitCeil = false; b.onGround = false; b.hazard = false;
  if (b.dropThrough > 0) b.dropThrough -= dt;
  let dx = b.vx * dt, dy = b.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
  dx /= steps; dy /= steps;
  const hw = b.w / 2;
  for (let s = 0; s < steps; s++) {
    // horizontal
    if (dx !== 0) {
      const nx = b.x + dx;
      if (overlapsSolid(g, nx - hw, b.y - b.h, nx + hw, b.y)) {
        // stair-step: climb a ledge up to one tile high when grounded
        let stepped = false;
        if (b.stepUp && (wasGround || b.onGround) && b.vy >= 0) {
          for (let up = 2; up <= TILE; up += 2)
            if (!overlapsSolid(g, nx - hw, b.y - b.h - up, nx + hw, b.y - up)) { b.y -= up; b.x = nx; stepped = true; b.onGround = true; break; }
        }
        if (!stepped) {
          if (dx > 0) { b.x = Math.floor((nx + hw) / TILE) * TILE - hw - 0.001; b.wall = 1; }
          else { b.x = Math.floor((nx - hw) / TILE + 1) * TILE + hw + 0.001; b.wall = -1; }
          b.vx = 0; dx = 0;
        }
      } else b.x = nx;
    }
    // vertical
    if (dy !== 0) {
      const ny = b.y + dy;
      if (dy > 0) {
        let landed = overlapsSolid(g, b.x - hw, ny - b.h, b.x + hw, ny);
        let top = Math.floor(ny / TILE) * TILE;
        if (!landed && b.dropThrough <= 0) {
          // one-way platforms: only when the feet cross the platform top this step
          const ty = Math.floor(ny / TILE), prevTy = Math.floor((b.y - 0.01) / TILE);
          if (ty !== prevTy || b.y <= ty * TILE + 0.01) {
            const x0 = Math.floor((b.x - hw) / TILE), x1 = Math.floor((b.x + hw - 0.001) / TILE);
            for (let tx = x0; tx <= x1; tx++) if (g.cell(tx, ty) === Cell.OneWay && b.y <= ty * TILE + 0.01) { landed = true; top = ty * TILE; }
          }
        }
        if (landed) { b.y = top; b.vy = 0; b.onGround = true; dy = 0; } else b.y = ny;
      } else if (overlapsSolid(g, b.x - hw, ny - b.h, b.x + hw, ny)) {
        b.y = Math.floor((ny - b.h) / TILE + 1) * TILE + b.h + 0.001; b.vy = 0; b.hitCeil = true; dy = 0;
      } else b.y = ny;
    }
  }
  // ground probe (keeps onGround stable while standing still)
  if (!b.onGround && b.vy >= 0) {
    if (overlapsSolid(g, b.x - hw, b.y - b.h + 1, b.x + hw, b.y + 1)) b.onGround = true;
    else if (b.dropThrough <= 0 && Math.abs(b.y - Math.round(b.y / TILE) * TILE) < 0.02) {
      const ty = Math.round(b.y / TILE), x0 = Math.floor((b.x - hw) / TILE), x1 = Math.floor((b.x + hw - 0.001) / TILE);
      for (let tx = x0; tx <= x1; tx++) if (g.cell(tx, ty) === Cell.OneWay) b.onGround = true;
    }
  }
  if (!b.wall) {
    if (overlapsSolid(g, b.x + hw, b.y - b.h + 2, b.x + hw + 1, b.y - 2)) b.wall = 1;
    else if (overlapsSolid(g, b.x - hw - 1, b.y - b.h + 2, b.x - hw, b.y - 2)) b.wall = -1;
  }
  b.landed = b.onGround && !wasGround ? vyIn : 0;
  // environment
  b.inLiquid = g.liquidAt(b.x, b.y - 3);
  b.submerged = g.liquidAt(b.x, b.y - b.h * 0.7) !== Liquid.None;
  const cx = Math.floor(b.x / TILE);
  if (g.cell(cx, Math.floor((b.y - 2) / TILE)) === Cell.Hazard) b.hazard = true;
}

export const aabb = (b: Body): { l: number; t: number; r: number; b: number } => ({ l: b.x - b.w / 2, t: b.y - b.h, r: b.x + b.w / 2, b: b.y });
export interface Rect { x: number; y: number; w: number; h: number }
export const rectsOverlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const bodyRect = (b: Body): Rect => ({ x: b.x - b.w / 2, y: b.y - b.h, w: b.w, h: b.h });
