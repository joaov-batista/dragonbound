import Phaser from 'phaser';
import { ENEMY_FRAMES, ENEMY_SIZE, type EnemyKind } from '../art/enemies';
import { audio } from '../audio/AudioManager';
import { DEPTH } from '../core/constants';
import type { Damageable, World } from '../core/world';
import type { Element } from '../dragons/genetics/types';
import { makeBody, moveBody, type Body } from '../physics/Body';
import type { ItemId } from '../world/islands/types';
import { approach } from '../utils/rng';

interface Def { hp: number; speed: number; sight: number; fly: boolean; drop: ItemId | null; weak?: Element; name: string }
export const ENEMY_DEFS: Record<EnemyKind, Def> = {
  crab: { hp: 3, speed: 34, sight: 90, fly: false, drop: 'meat', name: 'Casco-rubro' },
  boar: { hp: 5, speed: 46, sight: 150, fly: false, drop: 'meat', weak: 'fire', name: 'Espinheiro' },
  bat: { hp: 2, speed: 70, sight: 130, fly: true, drop: null, weak: 'storm', name: 'Sombrilho' },
  magma: { hp: 4, speed: 40, sight: 120, fly: false, drop: 'ember', weak: 'water', name: 'Lavárcula' },
  wasp: { hp: 3, speed: 60, sight: 170, fly: true, drop: null, weak: 'ice', name: 'Vespa-trovão' },
};

export class Enemy implements Damageable {
  body: Body; sprite: Phaser.GameObjects.Sprite; alive = true; hp: number; aggro = false; stun = 0;
  private def: Def; private state: 'idle' | 'chase' | 'windup' | 'attack' | 'recover' = 'idle'; private t = 0; private dir = 1; private homeX: number; private homeY: number; private flash = 0; private phase = Math.random() * 6;
  private hitIds = new Set<number>();

  constructor(private world: World, readonly kind: EnemyKind, x: number, y: number) {
    this.def = ENEMY_DEFS[kind]; this.hp = this.def.hp; this.homeX = x; this.homeY = y;
    const [w, h] = ENEMY_SIZE[kind];
    this.body = makeBody(x, y, w * 0.6, h * 0.7);
    this.sprite = world.scene.add.sprite(x, y, 'enemies', `${kind}_move_0`).setOrigin(0.5, 1).setDepth(DEPTH.entities);
    this.sprite.play(`en-${kind}-move`);
  }
  static createAnims(scene: Phaser.Scene): void {
    for (const kind of Object.keys(ENEMY_DEFS)) for (const [a, n] of Object.entries(ENEMY_FRAMES)) {
      const key = `en-${kind}-${a}`; if (scene.anims.exists(key)) continue;
      scene.anims.create({ key, frames: Array.from({ length: n }, (_, i) => ({ key: 'enemies', frame: `${kind}_${a}_${i}` })), frameRate: a === 'move' ? 8 : 9, repeat: a === 'move' ? -1 : 0 });
    }
  }
  get center(): { x: number; y: number } { return { x: this.body.x, y: this.body.y - this.body.h / 2 }; }

  /** Returns true if the hit landed (each attack id only hits once). */
  hurt(dmg: number, fromX: number, element: Element | 'physical', _src: unknown, attackId?: number): boolean {
    if (!this.alive) return false;
    if (attackId !== undefined) { if (this.hitIds.has(attackId)) return false; this.hitIds.add(attackId); }
    const weak = element === this.def.weak;
    this.hp -= dmg * (weak ? 2 : 1); this.flash = 0.12; this.aggro = true; this.stun = Math.max(this.stun, 0.25);
    this.body.vx = Math.sign(this.body.x - fromX || 1) * 130; if (!this.def.fly) this.body.vy = -110;
    const w = this.world, c = this.center;
    w.vfx.play(weak ? 'crit' : 'hit', c.x, c.y + 8, { scale: weak ? 0.7 : 0.8 }); w.vfx.floatText(c.x, c.y - 10, weak ? `${dmg * 2}!` : `${dmg}`, weak ? 0xffe060 : 0xffffff);
    audio.play(weak ? 'crit' : 'hit');
    if (this.hp <= 0) { this.alive = false; w.vfx.play('poof', this.body.x, this.body.y); this.sprite.destroy(); }
    return true;
  }
  /** Parried by the player. */
  stagger(): void { this.stun = 1.3; this.state = 'recover'; this.t = 1.3; this.body.vx = -this.dir * 120; }

  update(dt: number, px: number, py: number, playerAlive: boolean): { contact: boolean; shoot: boolean } {
    const out = { contact: false, shoot: false };
    if (!this.alive) return out;
    const b = this.body, d = this.def, w = this.world;
    this.flash -= dt; this.phase += dt;
    const dx = px - b.x, dy = py - 10 - (b.y - b.h / 2), dist = Math.hypot(dx, dy);
    if (Math.abs(dx) > 420) { return out; } // off-screen: frozen
    if (this.stun > 0) { this.stun -= dt; b.vx = approach(b.vx, 0, 300 * dt); if (!d.fly) b.vy = Math.min(b.vy + 800 * dt, 300); moveBody(w.grid, b, dt); this.sync('hurt'); return out; }
    if (!this.aggro && playerAlive && dist < d.sight && w.grid.los(b.x, b.y - b.h / 2, px, py - 10)) this.aggro = true;
    if (this.aggro && (dist > d.sight * 2.4 || !playerAlive)) { this.aggro = false; this.state = 'idle'; }
    this.t -= dt;
    let anim: 'move' | 'attack' = 'move';
    if (!this.aggro) {
      // patrol around home
      if (d.fly) { b.vx = approach(b.vx, Math.sin(this.phase * 0.7) * 26, 80 * dt); b.vy = approach(b.vy, (this.homeY - 20 - b.y) * 1.2 + Math.sin(this.phase * 2) * 14, 200 * dt); this.dir = Math.sign(b.vx) || 1; }
      else { if (Math.abs(b.x - this.homeX) > 50) this.dir = Math.sign(this.homeX - b.x); if (b.wall !== 0) this.dir = -b.wall; b.vx = approach(b.vx, this.dir * d.speed * 0.5, 200 * dt); }
    } else {
      this.dir = Math.sign(dx) || 1;
      switch (this.kind) {
        case 'crab': case 'magma':
          if (this.state === 'attack') { anim = 'attack'; if (this.t <= 0) this.state = 'idle'; }
          else if (Math.abs(dx) < 46 && b.onGround && this.t <= 0) { this.state = 'attack'; this.t = 0.5; b.vx = this.dir * (this.kind === 'magma' ? 120 : 150); b.vy = this.kind === 'magma' ? -230 : -120; }
          else b.vx = approach(b.vx, this.dir * d.speed, 240 * dt);
          break;
        case 'boar':
          if (this.state === 'windup') { b.vx = approach(b.vx, 0, 400 * dt); anim = 'attack'; if (this.t <= 0) { this.state = 'attack'; this.t = 0.9; } }
          else if (this.state === 'attack') { anim = 'attack'; b.vx = (Math.sign(b.vx) || this.dir) * 175; this.dir = Math.sign(b.vx); if (this.t <= 0 || b.wall !== 0) { if (b.wall !== 0) { w.shake(3); this.stun = 0.9; w.vfx.puff(b.x, b.y - 8, 0xd8ccb0, 8); } this.state = 'recover'; this.t = 0.8; } }
          else if (this.state === 'recover') { b.vx = approach(b.vx, 0, 300 * dt); if (this.t <= 0) this.state = 'idle'; }
          else if (Math.abs(dx) < 120 && Math.abs(dy) < 30) { this.state = 'windup'; this.t = 0.55; b.vx = this.dir * 1; w.vfx.puff(b.x - this.dir * 10, b.y, 0xd8ccb0, 5); }
          else b.vx = approach(b.vx, this.dir * d.speed, 200 * dt);
          break;
        case 'bat':
          if (this.state === 'attack') { anim = 'attack'; if (this.t <= 0) { this.state = 'recover'; this.t = 1.1; } }
          else if (this.state === 'recover') { b.vx = approach(b.vx, -this.dir * 30, 200 * dt); b.vy = approach(b.vy, -60, 300 * dt); if (this.t <= 0) this.state = 'idle'; }
          else if (dist < 80 && this.t <= 0) { this.state = 'attack'; this.t = 0.55; b.vx = (dx / dist) * 190; b.vy = (dy / dist) * 190; }
          else { b.vx = approach(b.vx, this.dir * d.speed + Math.sin(this.phase * 3) * 30, 260 * dt); b.vy = approach(b.vy, (dy - 34) * 2, 300 * dt); }
          break;
        case 'wasp': {
          const want = 86;
          b.vx = approach(b.vx, Math.abs(dx) > want + 16 ? this.dir * d.speed : Math.abs(dx) < want - 16 ? -this.dir * d.speed : Math.sin(this.phase * 2) * 20, 240 * dt);
          b.vy = approach(b.vy, (dy + 26) * 2 + Math.sin(this.phase * 4) * 20, 300 * dt);
          if (this.state === 'windup') { anim = 'attack'; if (this.t <= 0) { out.shoot = true; this.state = 'recover'; this.t = 1.7; } }
          else if (this.t <= 0 && dist < 150) { this.state = 'windup'; this.t = 0.45; }
          break;
        }
      }
    }
    if (!d.fly) b.vy = Math.min(b.vy + 800 * dt, 320);
    moveBody(w.grid, b, dt);
    if (b.inLiquid && !d.fly) { b.vy = -120; b.vx = -this.dir * 40; }
    const hitting = this.kind === 'boar' ? this.state === 'attack' : true;
    out.contact = playerAlive && hitting && Math.abs(dx) < b.w / 2 + 6 && Math.abs(py - 11 - (b.y - b.h / 2)) < b.h / 2 + 10;
    this.sync(anim);
    return out;
  }

  private cur = 'move';
  private sync(anim: 'move' | 'attack' | 'hurt'): void {
    if (anim !== this.cur) { this.cur = anim; if (anim === 'hurt') { this.sprite.anims.stop(); this.sprite.setFrame(`${this.kind}_hurt_0`); } else this.sprite.play(`en-${this.kind}-${anim}`); }
    this.sprite.setPosition(Math.round(this.body.x), Math.round(this.body.y) + 2).setFlipX(this.dir < 0);
    if (this.flash > 0) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }
  get drop(): ItemId | null { return this.def.drop; }
}
