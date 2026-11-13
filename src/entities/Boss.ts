import Phaser from 'phaser';
import { pixToTexture } from '../art/runtime';
import { audio } from '../audio/AudioManager';
import { DEPTH, TILE } from '../core/constants';
import { hud } from '../core/hud';
import type { World } from '../core/world';
import { createWild, expressPhenotype, GeneticRegistry } from '../dragons/genetics/genome';
import type { Element } from '../dragons/genetics/types';
import { paintDragonSheet } from '../dragons/rendering/DragonPainter';
import { DRAGON_ANIMS, DRAGON_FH, DRAGON_FW, DRAGON_OX, DRAGON_OY } from '../dragons/rendering/dragonAnims';
import { makeBody, moveBody, type Body } from '../physics/Body';
import { approach } from '../utils/rng';
import type { ItemId } from '../world/islands/types';
import type { EnemyLike } from './Enemy';

export interface BossHooks {
  lock(x0: number, x1: number): void; unlock(): void;
  adds(kind: 'hunter' | 'magma', n: number, x: number): void;
  defeated(id: 'bruto' | 'alpha'): void;
  intro(id: 'bruto' | 'alpha'): void;
}
const SCALE = 2;

/**
 * Bruto Garra-de-Ferro — hunter brute. Telegraphed attacks: a charge (slams into the arena wall and is
 * left stunned; parry it to stagger him), a jump-slam that sends shockwaves along the ground (jump them),
 * a hammer swing, and thrown weighted nets. At half health he calls hunters and speeds up.
 */
export class BrutoBoss implements EnemyLike {
  /** Where the camera should look while the fight is on. */
  get focus(): { x: number; y: number } | null { return this.alive && this.state !== 'dormant' ? this.center : null; }
  kind = 'bruto'; alive = true; aggro = false; hp = 38; readonly max = 38; drop: ItemId | null = 'coin'; contactDmg = 1;
  body: Body; sprite: Phaser.GameObjects.Sprite;
  private state: 'dormant' | 'intro' | 'walk' | 'tele' | 'charge' | 'stun' | 'jump' | 'swing' | 'throw' | 'recover' = 'dormant';
  private next: 'charge' | 'slam' | 'swing' | 'throw' = 'charge'; private t = 0; private dir = -1; private flash = 0; private phase = 1; private hitIds = new Set<number>();
  private ax0: number; private ax1: number; private anim = '';
  constructor(private w: World, x: number, y: number, arena: [number, number], private hooks: BossHooks) {
    this.ax0 = arena[0] * TILE; this.ax1 = arena[1] * TILE;
    this.body = makeBody(x, y, 24, 40);
    this.sprite = w.scene.add.sprite(x, y, 'people', 'bruto_idle_0').setScale(SCALE).setOrigin(22 / 48, 44 / 48).setDepth(DEPTH.entities + 1);
    this.play('idle');
  }
  get center(): { x: number; y: number } { return { x: this.body.x, y: this.body.y - 22 }; }
  private play(a: string): void { if (this.anim !== a) { this.anim = a; this.sprite.play(`pp-bruto-${a}`); } }
  private tele(kind: BrutoBoss['next'], t: number): void { this.state = 'tele'; this.next = kind; this.t = t / (this.phase === 2 ? 1.35 : 1); this.w.vfx.play('exclaim', this.body.x, this.body.y - 70, { scale: 0.7 }); audio.voice('growl', { pitch: 0.1, rough: 1, size: 1.6 }); }

  hurt(dmg: number, fromX: number, _el: Element | 'physical', _src: unknown, attackId?: number): boolean {
    if (!this.alive || this.state === 'intro') return false;
    if (attackId !== undefined) { if (this.hitIds.has(attackId)) return false; this.hitIds.add(attackId); }
    if (this.state === 'dormant') this.start();
    const mult = this.state === 'stun' ? 2 : 1;
    this.hp -= dmg * mult; this.flash = 0.1;
    this.w.vfx.play(mult > 1 ? 'crit' : 'hit', this.center.x, this.center.y + 10, { scale: 0.8 }); this.w.vfx.floatText(this.center.x, this.center.y - 30, `${dmg * mult}`, mult > 1 ? 0xffe060 : 0xffffff);
    audio.play(mult > 1 ? 'crit' : 'hit');
    this.body.vx += Math.sign(this.body.x - fromX || 1) * 40;
    if (this.phase === 1 && this.hp <= this.max / 2) { this.phase = 2; this.hooks.adds('hunter', 2, this.body.x); audio.voice('roar', { pitch: 0.1, rough: 1, size: 1.8 }); this.w.shake(4, 300); }
    if (this.hp <= 0) this.defeat();
    hud.boss = { name: 'Bruto Garra-de-Ferro', hp: Math.max(0, this.hp), max: this.max };
    return true;
  }
  stagger(): void { if (this.state === 'charge' || this.state === 'swing' || this.state === 'walk') { this.state = 'stun'; this.t = 1.4; this.body.vx = -this.dir * 120; this.w.vfx.play('parry', this.body.x, this.body.y - 20, {}); } }
  private start(): void { if (this.state !== 'dormant') return; this.state = 'intro'; this.t = 1.8; this.aggro = true; this.hooks.lock(this.ax0, this.ax1); this.hooks.intro('bruto'); hud.boss = { name: 'Bruto Garra-de-Ferro', hp: this.hp, max: this.max }; audio.voice('roar', { pitch: 0.05, rough: 1, size: 1.9 }); this.w.shake(3, 400); }
  private defeat(): void {
    this.alive = false; this.aggro = false; hud.boss = null;
    this.w.vfx.play('explosion', this.body.x, this.body.y, {}); this.w.vfx.play('poof', this.body.x, this.body.y, { scale: 1.6 }); this.w.hitstop(0.25); this.w.shake(6, 500);
    this.sprite.destroy(); this.hooks.unlock(); this.hooks.defeated('bruto');
  }

  update(dt: number, px: number, py: number, alive: boolean): { contact: boolean; shoot: boolean } {
    const out = { contact: false, shoot: false };
    if (!this.alive) return out;
    const b = this.body, w = this.w, dx = px - b.x, sp = this.phase === 2 ? 1.25 : 1;
    this.flash -= dt; this.t -= dt;
    if (this.state === 'dormant') { if (alive && px > this.ax0 + 24 && px < this.ax1 - 8 && Math.abs(py - b.y) < 120) this.start(); this.sync(); return out; }
    this.contactDmg = 1;
    switch (this.state) {
      case 'intro': b.vx = 0; this.play('talk'); if (this.t <= 0) { this.state = 'walk'; this.t = 1; } break;
      case 'walk': {
        this.dir = Math.sign(dx) || this.dir; b.vx = approach(b.vx, this.dir * 55 * sp, 300 * dt); this.play('walk');
        if (this.t <= 0) { const far = Math.abs(dx) > 110, r = Math.random(); this.tele(far ? (r < 0.6 ? 'charge' : 'throw') : r < 0.5 ? 'slam' : 'swing', far ? 0.8 : 0.55); }
        break;
      }
      case 'tele': b.vx = approach(b.vx, 0, 600 * dt); this.dir = Math.sign(dx) || this.dir; this.play('work'); this.sprite.anims.pause(); if (Math.random() < dt * 20) w.vfx.puff(b.x - this.dir * 10, b.y, 0xd8ccb0, 2, { speed: 40 });
        if (this.t <= 0) {
          this.sprite.anims.resume();
          if (this.next === 'charge') { this.state = 'charge'; this.t = 2.2; audio.play('dash'); }
          else if (this.next === 'slam') { this.state = 'jump'; b.vy = -430; this.t = 2; }
          else if (this.next === 'swing') { this.state = 'swing'; this.t = 0.35; audio.play('slash', 1.3); w.vfx.play('cleave', b.x, b.y, { flip: this.dir < 0, scale: 1.4, speed: 2 }); }
          else { this.state = 'throw'; this.t = 0.5; }
        }
        break;
      case 'charge':
        this.contactDmg = 2; b.vx = this.dir * 250 * sp; this.play('walk'); this.sprite.anims.timeScale = 2;
        if (Math.random() < dt * 30) w.vfx.puff(b.x - this.dir * 14, b.y, 0xd8ccb0, 2, { speed: 50 });
        if (b.wall !== 0 || b.x < this.ax0 + 20 || b.x > this.ax1 - 20 || this.t <= 0) { this.state = 'stun'; this.t = 1.8; b.vx = -this.dir * 90; w.shake(5, 250); audio.play('land'); w.vfx.play('slam', b.x + this.dir * 16, b.y, { scale: 0.6 }); this.sprite.anims.timeScale = 1; }
        break;
      case 'stun': b.vx = approach(b.vx, 0, 300 * dt); this.sprite.anims.stop(); this.sprite.setFrame('bruto_hurt_0'); this.anim = ''; if (this.t <= 0) { this.state = 'walk'; this.t = 1.4; } break;
      case 'jump':
        b.vx = approach(b.vx, Math.sign(dx) * 90, 200 * dt);
        if (b.onGround && b.vy >= 0 && this.t < 1.8) {
          w.shake(6, 300); audio.play('quake'); w.vfx.play('slam', b.x, b.y, { scale: 0.9 });
          for (const s of [-1, 1]) w.spawnProjectile({ x: b.x + s * 20, y: b.y - 8, vx: s * 190 * sp, vy: 0, dmg: 1, element: 'earth', friendly: false, fx: 'dirt', life: 1.6, scale: 0.4, radius: 10 });
          this.state = 'recover'; this.t = 1.1;
        }
        break;
      case 'swing':
        if (this.t <= 0.25 && this.t > 0.1) w.strike({ x: this.dir > 0 ? b.x : b.x - 64, y: b.y - 50, w: 64, h: 50 }, 3, 'physical', false, b.x, 'enemy', this);
        if (this.t <= 0) { this.state = 'recover'; this.t = 0.8; }
        break;
      case 'throw':
        if (this.t <= 0) {
          const T = 0.9, vx = Math.max(-260, Math.min(260, dx / T)), vy = (py - 20 - (b.y - 40)) / T - 0.5 * 420 * T;
          w.spawnProjectile({ x: b.x, y: b.y - 40, vx, vy, dmg: 1, element: 'physical', friendly: false, fx: 'poof', life: 1.6, gravity: 420, scale: 0.35, radius: 12 });
          audio.play('dash', 0.7); this.state = 'recover'; this.t = 0.9;
        }
        break;
      case 'recover': b.vx = approach(b.vx, 0, 400 * dt); this.play('idle'); if (this.t <= 0) { this.state = 'walk'; this.t = 0.9 + Math.random() * 0.9; } break;
    }
    b.vy = Math.min(b.vy + 900 * dt, 400);
    moveBody(w.grid, b, dt);
    b.x = Math.max(this.ax0 + 12, Math.min(this.ax1 - 12, b.x));
    out.contact = alive && Math.abs(dx) < 22 && Math.abs(py - 12 - (b.y - 22)) < 30 && this.state !== 'stun' && this.state !== 'intro';
    this.sync();
    return out;
  }
  private sync(): void {
    if (!this.alive) return;
    this.sprite.setPosition(Math.round(this.body.x), Math.round(this.body.y) + 2).setFlipX(this.dir < 0).setOrigin(this.dir < 0 ? 1 - 22 / 48 : 22 / 48, 44 / 48);
    if (this.flash > 0) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else if (this.state === 'tele') this.sprite.setTint(0xff8080).setTintMode(Phaser.TintModes.MULTIPLY); else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }
}

/** An iron anchor holding one of the Giant's chains. Break all four to free it. */
export class ChainAnchor implements EnemyLike {
  kind = 'anchor'; alive = true; aggro = true; hp = 8; drop: ItemId | null = null;
  body: Body; sprite: Phaser.GameObjects.Image; private flash = 0; private hitIds = new Set<number>();
  constructor(private w: World, x: number, y: number, private onBreak: () => void) {
    this.body = makeBody(x, y, 18, 24);
    this.sprite = w.scene.add.image(x, y + 1, 'props', 'anchor').setOrigin(0.5, 1).setDepth(DEPTH.entities);
  }
  get center(): { x: number; y: number } { return { x: this.body.x, y: this.body.y - 12 }; }
  get top(): { x: number; y: number } { return { x: this.body.x, y: this.body.y - 20 }; }
  update(dt: number): { contact: boolean; shoot: boolean } {
    this.flash -= dt;
    if (this.alive) { if (this.flash > 0) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY); }
    return { contact: false, shoot: false };
  }
  hurt(dmg: number, _fx: number, _el: Element | 'physical', _src: unknown, attackId?: number): boolean {
    if (!this.alive) return false;
    if (attackId !== undefined) { if (this.hitIds.has(attackId)) return false; this.hitIds.add(attackId); }
    this.hp -= dmg; this.flash = 0.1; audio.play('hit'); this.w.vfx.play('hit', this.center.x, this.center.y + 8, { scale: 0.7 });
    if (this.hp <= 0) { this.alive = false; this.sprite.setTint(0x5a5a64).setAlpha(0.6); this.w.vfx.play('iceshatter', this.body.x, this.body.y, { tint: 0xc0c0c8 }); audio.play('ice'); this.w.shake(4, 200); this.onBreak(); }
    return true;
  }
  stagger(): void { /* iron does not flinch */ }
}

/**
 * O Gigante Acorrentado — a giant alpha fire dragon held by four chains in the hunters' forge. It cannot
 * be hurt; the fight is to break its chains while it lashes out: a fire sweep over the ground near it
 * (stand out by the anchors), a tail slam with shockwaves (jump) and, late, a roar that calls lava imps.
 */
export class AlphaBoss implements EnemyLike {
  get focus(): { x: number; y: number } | null { return this.alive && this.state !== 'dormant' ? { x: this.body.x, y: this.body.y - 70 } : null; }
  kind = 'alpha'; alive = true; aggro = false; hp = 4; drop: ItemId | null = null; contactDmg = 2;
  body: Body; sprite: Phaser.GameObjects.Sprite; anchors: ChainAnchor[] = []; chains: Phaser.GameObjects.Graphics;
  private state: 'dormant' | 'intro' | 'idle' | 'tele' | 'breath' | 'slam' | 'free' = 'dormant'; private next: 'breath' | 'slam' | 'roar' = 'breath';
  private t = 0; private dir = -1; private ax0: number; private ax1: number; private freed = false;
  constructor(private w: World, x: number, y: number, arena: [number, number], private hooks: BossHooks) {
    this.ax0 = arena[0] * TILE; this.ax1 = arena[1] * TILE;
    this.body = makeBody(x, y, 90, 80);
    const sc = w.scene;
    if (!sc.textures.exists('boss-alpha')) {
      const g = createWild('cinzal', 7777, new GeneticRegistry()), ph = expressPhenotype(g);
      ph.size = 1.25; ph.primary = 0x7a2a2a; ph.secondary = 0xf2a04a; ph.accent = 0x2a1a20; ph.horns = 'spikes'; ph.spines = 'plates'; ph.eyes = 'glow'; ph.eye = 0xffe060;
      const sheet = paintDragonSheet(ph, 1, ['idle', 'alert', 'attack', 'fly', 'hurt']);
      pixToTexture(sc, 'boss-alpha', sheet.pix, sheet.frames);
      for (const a of ['idle', 'alert', 'attack', 'fly'] as const) sc.anims.create({ key: 'alpha-' + a, frames: Array.from({ length: DRAGON_ANIMS[a].n }, (_, i) => ({ key: 'boss-alpha', frame: `${a}_${i}` })), frameRate: DRAGON_ANIMS[a].fps, repeat: -1 });
    }
    this.sprite = sc.add.sprite(x, y, 'boss-alpha', 'idle_0').setScale(2.4).setOrigin(DRAGON_OX / DRAGON_FW, DRAGON_OY / DRAGON_FH).setDepth(DEPTH.entities - 2).play('alpha-idle');
    this.chains = sc.add.graphics().setDepth(DEPTH.entities - 1);
    const xs = [arena[0] + 4, arena[0] + 10, arena[1] - 10, arena[1] - 4];
    for (const tx of xs) { const gy = w.grid.groundBelow(tx * TILE + 8, y - 120, 30) ?? y; this.anchors.push(new ChainAnchor(w, tx * TILE + 8, gy, () => this.onChainBroken())); }
  }
  get center(): { x: number; y: number } { return { x: this.body.x, y: this.body.y - 60 }; }
  get neck(): { x: number; y: number } { return { x: this.body.x + this.dir * 40, y: this.body.y - 110 }; }
  private play(a: string): void { const k = 'alpha-' + a; if (this.sprite.anims.currentAnim?.key !== k) this.sprite.play(k); }
  private chainsLeft(): number { return this.anchors.filter((a) => a.alive).length; }
  private onChainBroken(): void {
    audio.voice('roar', { pitch: 0, rough: 1, size: 2.2 }); this.w.shake(5, 400);
    hud.boss = { name: 'O Gigante Acorrentado — correntes', hp: this.chainsLeft(), max: 4 };
    if (this.chainsLeft() === 2) this.hooks.adds('magma', 2, this.body.x);
    if (this.chainsLeft() === 0) { this.state = 'free'; this.t = 3.2; this.freed = true; this.play('fly'); hud.boss = null; this.hooks.unlock(); }
  }
  hurt(): boolean { if (this.state === 'dormant') this.start(); this.w.vfx.play('block', this.center.x, this.center.y, { scale: 0.8 }); audio.play('parry', 0.5); return false; }
  stagger(): void { /* too big */ }
  private start(): void { if (this.state !== 'dormant') return; this.state = 'intro'; this.t = 2.4; this.aggro = true; this.hooks.lock(this.ax0, this.ax1); this.hooks.intro('alpha'); hud.boss = { name: 'O Gigante Acorrentado — correntes', hp: 4, max: 4 }; audio.voice('roar', { pitch: 0, rough: 1, size: 2.4 }); this.w.shake(5, 600); this.play('alert'); }
  private tele(n: AlphaBoss['next'], t: number): void { this.state = 'tele'; this.next = n; this.t = t * (this.chainsLeft() <= 2 ? 0.8 : 1); this.play('alert'); this.w.vfx.play('exclaim', this.body.x + this.dir * 60, this.body.y - 190, { scale: 0.9 }); }

  update(dt: number, px: number, py: number, alive: boolean): { contact: boolean; shoot: boolean } {
    const out = { contact: false, shoot: false }, w = this.w, b = this.body;
    for (const a of this.anchors) a.update(dt);
    this.drawChains();
    if (!this.alive) return out;
    this.t -= dt;
    if (this.state === 'dormant') { if (alive && px > this.ax0 + 24 && px < this.ax1 - 24 && Math.abs(py - b.y) < 140) this.start(); this.sync(); return out; }
    if (this.state !== 'free' && this.state !== 'tele' && this.state !== 'breath') this.dir = Math.sign(px - b.x) || this.dir;
    switch (this.state) {
      case 'intro': if (this.t <= 0) { this.state = 'idle'; this.t = 1.5; } break;
      case 'idle': this.play('idle'); if (this.t <= 0) { const r = Math.random(); this.tele(r < 0.55 ? 'breath' : r < 0.9 || this.chainsLeft() > 2 ? 'slam' : 'roar', 1.1); } break;
      case 'tele':
        if (Math.random() < dt * 25 && this.next === 'breath') w.vfx.puff(b.x + this.dir * 90, b.y - 150, 0xffa040, 2, { add: true, gravity: -40, speed: 20 });
        if (this.t <= 0) {
          if (this.next === 'breath') { this.state = 'breath'; this.t = 1.1; this.play('attack'); audio.play('fire', 1.4); w.vfx.play('firebreath', b.x + this.dir * 80, b.y - 60, { flip: this.dir < 0, scale: 2.6, add: true }); }
          else if (this.next === 'slam') { this.state = 'slam'; this.t = 0.9; w.shake(7, 400); audio.play('quake'); for (const s of [-1, 1]) w.spawnProjectile({ x: b.x + s * 70, y: b.y - 8, vx: s * 220, vy: 0, dmg: 1, element: 'fire', friendly: false, fx: 'dirt', life: 1.8, scale: 0.45, radius: 10 }); }
          else { this.state = 'idle'; this.t = 2; audio.voice('roar', { pitch: 0, rough: 1, size: 2.4 }); w.shake(4, 600); this.hooks.adds('magma', 1, b.x + this.dir * 120); }
        }
        break;
      case 'breath': {
        // the fire covers the ground close to the dragon; the outer anchors are safe
        const reach = (this.ax1 - this.ax0) * 0.36, x0 = this.dir > 0 ? b.x + 30 : b.x - 30 - reach;
        w.strike({ x: x0, y: b.y - 80, w: reach, h: 80 }, 3, 'fire', false, b.x, 'enemy', this);
        if (this.t <= 0) { this.state = 'idle'; this.t = 1.4 + Math.random(); }
        break;
      }
      case 'slam': if (this.t <= 0) { this.state = 'idle'; this.t = 1.2; } break;
      case 'free':
        b.y -= 140 * dt; b.x += this.dir * 60 * dt; this.sprite.setAlpha(Math.min(1, this.t / 1.2));
        if (this.t <= 0) { this.alive = false; this.sprite.destroy(); this.chains.destroy(); this.hooks.defeated('alpha'); }
        break;
    }
    out.contact = alive && this.state !== 'free' && Math.abs(px - b.x) < 44 && py > b.y - 90;
    this.sync();
    return out;
  }
  private drawChains(): void {
    if (!this.chains.active) return;
    const g = this.chains; g.clear();
    if (this.freed) return;
    const n = this.neck;
    for (const a of this.anchors) if (a.alive) {
      const tp = a.top, steps = 14;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, sag = Math.sin(t0 * Math.PI) * 18;
        const x = tp.x + (n.x - tp.x) * t0, y = tp.y + (n.y - tp.y) * t0 + sag;
        g.fillStyle(i % 2 ? 0x8a8a9a : 0x5a5a64, 1).fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 3);
      }
    }
  }
  private sync(): void { this.sprite.setPosition(Math.round(this.body.x), Math.round(this.body.y) + 2).setFlipX(this.dir < 0).setOrigin(this.dir < 0 ? 1 - DRAGON_OX / DRAGON_FW : DRAGON_OX / DRAGON_FW, DRAGON_OY / DRAGON_FH); }
}
