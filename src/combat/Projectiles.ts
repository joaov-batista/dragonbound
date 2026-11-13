import type Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import type { ProjectileSpec, World } from '../core/world';
import { Liquid } from '../physics/TileGrid';

interface Live extends ProjectileSpec { sprite: Phaser.GameObjects.Sprite | null; t: number; trailT: number }
const IMPACT: Record<string, [string, Parameters<typeof audio.play>[0]]> = { fire: ['explosion', 'fire'], water: ['splash', 'splash'], nature: ['spore', 'spore'], storm: ['zap', 'zap'], earth: ['dirt', 'quake'], ice: ['iceshatter', 'ice'], physical: ['hit', 'hit'] };

/** Pooled-by-VfxManager projectiles: dragon shots and power orbs (homing, trails, area blasts), wasp sparks. */
export class Projectiles {
  private list: Live[] = [];
  constructor(private world: World) {}
  spawn(p: ProjectileSpec): void {
    if (this.list.length > 32) return;
    const sprite = this.world.vfx.play(p.fx, p.x, p.y, { loop: true, flip: p.vx < 0, scale: p.scale ?? 0.8, add: p.add ?? (p.element === 'fire' || p.element === 'storm'), tint: p.tint });
    this.list.push({ ...p, sprite, t: p.life ?? 1.2, trailT: 0 });
  }
  /** `hit` is asked whether the projectile struck something at (x,y). */
  update(dt: number, hit: (p: ProjectileSpec, x: number, y: number) => boolean): void {
    const w = this.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      // homing: turn the velocity toward a live target, keeping the speed
      if (p.seek && p.seek.alive) {
        const sp = Math.hypot(p.vx, p.vy), a = Math.atan2(p.vy, p.vx), want = Math.atan2(p.seek.body.y - p.seek.body.h * 0.5 - p.y, p.seek.body.x - p.x);
        let da = want - a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        const na = a + Math.max(-1, Math.min(1, da)) * Math.min(Math.abs(da), (p.turn ?? 4) * dt);
        p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
      }
      p.vy += (p.gravity ?? 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt;
      p.sprite?.setPosition(Math.round(p.x), Math.round(p.y)).setRotation(p.vx < 0 ? Math.atan2(-p.vy, -p.vx) : Math.atan2(p.vy, p.vx));
      if (p.trail !== undefined && (p.trailT -= dt) <= 0) { p.trailT = p.aoe ? 0.02 : 0.035; w.vfx.puff(p.x, p.y, p.trail, p.aoe ? 3 : 1, { speed: 18, gravity: 0, life: p.aoe ? 380 : 240, spread: 180, add: true }); }
      const wall = w.grid.solidPx(p.x, p.y), liquid = w.grid.liquidAt(p.x, p.y) !== Liquid.None;
      if (p.t <= 0 || wall || liquid || hit(p, p.x, p.y)) {
        if (p.aoe) this.blast(p);
        else if (p.t > 0) { const [fx, sfx] = liquid ? IMPACT.water : IMPACT[p.element] ?? IMPACT.physical; w.vfx.play(fx, p.x, p.y + (fx === 'explosion' || fx === 'dirt' ? 16 : 8), { scale: 0.55 }); audio.play(sfx, 0.6); }
        w.vfx.release(p.sprite); this.list.splice(i, 1);
      }
    }
  }
  /** A power orb bursts: big element effect, area damage with knockback, shake and an impact flash. */
  private blast(p: Live): void {
    const w = this.world, a = p.aoe!;
    w.vfx.play(a.fx, p.x, p.y + (a.fx === 'explosion' || a.fx === 'earthspike' || a.fx === 'wavecrash' ? 20 * a.scale : 0), { scale: a.scale, add: p.element === 'fire' || p.element === 'storm' });
    w.vfx.puff(p.x, p.y, p.trail ?? 0xffffff, 18, { speed: 160, gravity: 60, life: 520, spread: 360, add: true });
    const [, sfx] = IMPACT[p.element] ?? IMPACT.physical; audio.play(sfx, 1); audio.play('crit', 0.6);
    w.strike({ x: p.x - a.r, y: p.y - a.r, w: a.r * 2, h: a.r * 2 }, a.dmg, p.element, p.friendly, p.x, p.friendly ? 'dragon' : 'enemy', p.owner, { knock: a.knock, launch: 200 });
    w.shake(a.shake, 260); w.hitstop(0.06); w.flash(120, p.trail ?? 0xffffff);
  }
  clear(): void { for (const p of this.list) this.world.vfx.release(p.sprite); this.list.length = 0; }
}
