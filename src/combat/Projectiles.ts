import type Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import type { ProjectileSpec, World } from '../core/world';
import { Liquid } from '../physics/TileGrid';

interface Live extends ProjectileSpec { sprite: Phaser.GameObjects.Sprite | null; t: number }
const IMPACT: Record<string, [string, Parameters<typeof audio.play>[0]]> = { fire: ['explosion', 'fire'], water: ['splash', 'splash'], nature: ['spore', 'spore'], storm: ['zap', 'zap'], earth: ['dirt', 'quake'], ice: ['iceshatter', 'ice'], physical: ['hit', 'hit'] };

/** Pooled-by-VfxManager projectiles (dragon breath, wasp sparks). */
export class Projectiles {
  private list: Live[] = [];
  constructor(private world: World) {}
  spawn(p: ProjectileSpec): void {
    if (this.list.length > 24) return;
    const sprite = this.world.vfx.play(p.fx, p.x, p.y, { loop: true, flip: p.vx < 0, scale: p.scale ?? 0.8, add: p.element === 'fire' || p.element === 'storm' });
    this.list.push({ ...p, sprite, t: p.life ?? 1.2 });
  }
  /** `hit` is asked whether the projectile struck something at (x,y). */
  update(dt: number, hit: (p: ProjectileSpec, x: number, y: number) => boolean): void {
    const w = this.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.vy += (p.gravity ?? 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt;
      p.sprite?.setPosition(Math.round(p.x), Math.round(p.y)).setRotation(p.vx < 0 ? Math.atan2(-p.vy, -p.vx) : Math.atan2(p.vy, p.vx));
      const wall = w.grid.solidPx(p.x, p.y), liquid = w.grid.liquidAt(p.x, p.y) !== Liquid.None;
      if (p.t <= 0 || wall || liquid || hit(p, p.x, p.y)) {
        if (p.t > 0) { const [fx, sfx] = liquid ? IMPACT.water : IMPACT[p.element] ?? IMPACT.physical; w.vfx.play(fx, p.x, p.y + (fx === 'explosion' || fx === 'dirt' ? 16 : 8), { scale: 0.55 }); audio.play(sfx, 0.6); }
        w.vfx.release(p.sprite); this.list.splice(i, 1);
      }
    }
  }
  clear(): void { for (const p of this.list) this.world.vfx.release(p.sprite); this.list.length = 0; }
}
