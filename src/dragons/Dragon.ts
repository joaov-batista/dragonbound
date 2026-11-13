import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { DEPTH } from '../core/constants';
import { events } from '../core/events';
import { game } from '../core/state';
import { melee, newCombat, releaseOrb, shoot, tickCombat, type CombatState } from './DragonCombat';
import type { Damageable, World } from '../core/world';
import { makeBody, moveBody, type Body } from '../physics/Body';
import { Liquid } from '../physics/TileGrid';
import { approach, clamp } from '../utils/rng';
import { DragonMind, type Intent, type Percept } from './ai/DragonMind';
import { STAGE_LABEL, bondStage, type DragonRecord } from './DragonRecord';
import type { Element, Phenotype } from './genetics/types';
import { DRAGON_OX, DRAGON_OY, DRAGON_FW, DRAGON_FH, type DragonAnim } from './rendering/dragonAnims';
import { DragonTextures } from './rendering/DragonTextures';
import { saddlePoint } from './rendering/DragonPainter';

export interface FlightState { stamina: number; sx: number; sy: number; flapT: number; dashT: number; dashCd: number; ghostT: number; flapKick: number; pitch: number; breathCd: number; biteCd: number; boost: number; airborne: boolean; wobble: number; /** 0..1: how close a fast pass skims the ground or water */ skim: number; skimT: number; /** 0..1 speed relative to top speed, for camera and sound */ speedK: number }

const ELEMENT_FX: Record<Element, { fx: string; sfx: 'fire' | 'water' | 'spore' | 'zap' | 'quake' | 'ice'; color: number }> = {
  fire: { fx: 'firebreath', sfx: 'fire', color: 0xff8a30 }, water: { fx: 'waterjet', sfx: 'water', color: 0x6fd0f0 }, nature: { fx: 'spore', sfx: 'spore', color: 0x9fe070 },
  storm: { fx: 'bolt', sfx: 'zap', color: 0xd0c0ff }, earth: { fx: 'quake', sfx: 'quake', color: 0xc8a878 }, ice: { fx: 'frostbreath', sfx: 'ice', color: 0xc8f4ff },
};

/** A living dragon in an island scene: body + sprite + mind. */
export class Dragon implements Damageable {
  readonly ph: Phenotype; readonly mind: DragonMind;
  /** battle moves state (combo, cooldowns, power-orb charge) */
  combat: CombatState = newCombat();
  body: Body; sprite: Phaser.GameObjects.Sprite; emote: Phaser.GameObjects.Image; trap: Phaser.GameObjects.Image | null = null;
  alive = true; facing = 1; air = false; ridden = false; ready = false; far = false;
  flight: FlightState;
  intent: Intent | null = null;
  private texKey = ''; private anim: DragonAnim | '' = ''; private stuckT = 0; private lastX = 0; private stuck = false; hitFlash = 0; private farT = 0;
  private flapSfx = 0; private s: number;

  constructor(public world: World, readonly rec: DragonRecord) {
    this.ph = game.phenotype(rec); this.mind = new DragonMind(rec, this.ph);
    this.s = this.ph.size * game.scale(rec);
    this.body = makeBody(rec.x, rec.y, Math.max(12, 30 * this.s), Math.max(10, 21 * this.s));
    const sc = world.scene;
    this.sprite = sc.add.sprite(rec.x, rec.y, 'ui', 'white').setVisible(false).setDepth(DEPTH.entities + (rec.bonded ? 2 : 1));
    this.emote = sc.add.image(rec.x, rec.y, 'ui', 'e_question').setVisible(false).setDepth(DEPTH.vfx + 2);
    if (rec.trapped) this.trap = sc.add.image(rec.x, rec.y, 'props', 'trap').setOrigin(0.5, 1).setDepth(DEPTH.entities + 3).setScale(1.5 * this.s + 0.4);
    this.flight = { stamina: this.ph.stats.stamina, sx: 0, sy: 0, flapT: 0, dashT: 0, dashCd: 0, ghostT: 0, flapKick: 0, pitch: 0, breathCd: 0, biteCd: 0, boost: 0, airborne: false, wobble: 0, skim: 0, skimT: 0, speedK: 0 };
    this.lastX = rec.x;
  }

  get scale(): number { return this.s; }
  get center(): { x: number; y: number } { return { x: this.body.x, y: this.body.y - this.body.h * 0.6 }; }
  get mouth(): { x: number; y: number } { return { x: this.body.x + this.facing * 30 * this.s, y: this.body.y - (this.air ? 20 : 26) * this.s - (this.air ? 14 * this.s : 0) }; }
  /** World position of the rider's hip, following this individual's back through every animation frame. */
  get saddle(): { x: number; y: number; rot: number } {
    const fr = String(this.sprite.frame?.name ?? 'idle_0'), k = fr.lastIndexOf('_');
    const anim = (k > 0 ? fr.slice(0, k) : 'idle') as DragonAnim, i = k > 0 ? Number(fr.slice(k + 1)) || 0 : 0;
    const [lx, ly] = saddlePoint(this.ph, game.scale(this.rec), anim, i);
    const r = this.sprite.rotation, dx = lx * this.facing, c = Math.cos(r), s = Math.sin(r);
    return { x: this.sprite.x + dx * c - ly * s, y: this.sprite.y + dx * s + ly * c, rot: r };
  }
  /** Leather saddle shown while bonded and rideable (created lazily). */
  private saddleImg: Phaser.GameObjects.Image | null = null;
  syncSaddle(show: boolean): void {
    if (!show) { this.saddleImg?.setVisible(false); return; }
    this.saddleImg ??= this.world.scene.add.image(0, 0, 'props', 'saddle').setOrigin(0.5, 0.62);
    const p = this.saddle;
    this.saddleImg.setVisible(this.sprite.visible).setPosition(Math.round(p.x), Math.round(p.y)).setRotation(p.rot).setFlipX(this.facing < 0).setDepth(this.sprite.depth + 0.5);
  }
  get voiceProfile(): { pitch: number; rough: number; size: number } { return { pitch: (this.rec.genes.seed % 100) / 100, rough: this.ph.personality.aggression, size: this.s }; }
  get label(): string { return this.rec.met && (this.rec.observed > 0.25 || this.rec.bonded) ? this.rec.name : '???'; }
  get stageLabel(): string { return STAGE_LABEL[bondStage(this.rec)]; }

  /** Generate the DNA-driven texture (expensive: the scene spreads these over frames). */
  build(): void {
    this.texKey = DragonTextures.ensure(this.world.scene, this.rec);
    this.sprite.setTexture(this.texKey, 'idle_0').setVisible(true);
    this.ready = true; this.anim = ''; this.play('idle');
  }

  private play(a: DragonAnim): void {
    if (!this.ready || this.anim === a) return;
    this.anim = a; this.sprite.play(`${this.texKey}-${a}`);
  }

  vocalize(kind: NonNullable<Intent['vocal']>, playerX: number): void {
    const d = Math.abs(playerX - this.body.x);
    if (d < 360) audio.voice(kind, this.voiceProfile, clamp(1 - d / 380, 0.1, 1));
  }

  hurt(dmg: number, fromX: number, element: Element | 'physical', source: 'player' | 'dragon' | 'enemy' | 'world'): boolean {
    if (!this.alive || this.rec.hp <= 0) return false;
    const w = this.world, day = game.day;
    if (this.rec.trapped) {
      if (source !== 'player') return false;
      this.mind.bond.freed(day); this.trap?.destroy(); this.trap = null;
      w.vfx.play('poof', this.body.x, this.body.y); w.vfx.play('heal', this.body.x, this.body.y); audio.play('chest'); this.mind.force('rest', 1.5);
      return true;
    }
    const mult = this.ph.resist[element] ?? 1;
    this.rec.hp = Math.max(0, this.rec.hp - dmg * 10 * mult);
    this.hitFlash = 0.14; this.body.vx += Math.sign(this.body.x - fromX || 1) * 90 / Math.max(0.6, this.s);
    w.vfx.play('hit', this.body.x, this.body.y - this.body.h * 0.5);
    this.vocalize('roar', this.body.x);
    if (source === 'player') { this.mind.bond.hurtByPlayer(day); this.mind.provoke(1); if (this.ph.personality.courage < 0.45) this.mind.force('startled', 0.4); }
    else this.mind.provoke(0.6);
    return true;
  }

  /** Elemental attack in front of the dragon. `friendly` = on the player's side. */
  strike(friendly: boolean, targetX?: number): void {
    const w = this.world, el = this.ph.element, fx = ELEMENT_FX[el], f = this.facing, m = this.mouth, s = Math.max(0.7, this.s);
    const dmg = Math.max(1, Math.round(this.ph.stats.power / 7));
    audio.play(fx.sfx === 'spore' ? 'spore' : fx.sfx);
    let rect = { x: f > 0 ? m.x : m.x - 80 * s, y: m.y - 22 * s, w: 80 * s, h: 40 * s };
    if (el === 'storm') { const tx = targetX ?? m.x + f * 50; w.vfx.play('bolt', tx, this.body.y, { scale: 0.8 }); w.vfx.play('zap', tx, this.body.y - 14); rect = { x: tx - 22, y: this.body.y - 70, w: 44, h: 76 }; w.shake(3); }
    else if (el === 'earth') { w.vfx.play('quake', this.body.x + f * 20, this.body.y, { scale: s }); rect = { x: this.body.x - 60 * s, y: this.body.y - 28, w: 120 * s, h: 34 }; w.shake(5); }
    else if (el === 'nature') { w.vfx.play('spore', m.x + f * 26, this.body.y, { scale: s }); rect = { x: m.x + f * 26 - 44 * s, y: this.body.y - 56 * s, w: 88 * s, h: 60 * s }; }
    else w.vfx.play(fx.fx, m.x, m.y, { flip: f < 0, scale: s, follow: this.body, add: el === 'fire' });
    w.strike(rect, dmg, el, friendly, this.body.x, 'dragon', this);
  }

  /** Projectile version used while flying. */
  breathe(friendly: boolean, vx: number, vy: number): void {
    const el = this.ph.element, m = this.mouth, dmg = Math.max(1, Math.round(this.ph.stats.power / 6));
    const fx = { fire: 'fireball', water: 'waterjet', nature: 'leafstorm', storm: 'sparkarc', earth: 'dirt', ice: 'icelance' }[el];
    audio.play(ELEMENT_FX[el].sfx === 'spore' ? 'spore' : ELEMENT_FX[el].sfx, 0.8);
    this.world.spawnProjectile({ x: m.x, y: m.y, vx, vy, dmg, element: el, friendly, fx, life: 1.1, gravity: el === 'earth' ? 500 : el === 'water' ? 200 : 0, radius: 12, scale: el === 'water' || el === 'nature' ? 0.6 : 0.8, owner: this });
  }

  update(dt: number, p: Omit<Percept, 'x' | 'y' | 'grounded' | 'stuck' | 'dt'>): void {
    const b = this.body, w = this.world, rec = this.rec;
    this.hitFlash -= dt;
    // distant dragons: needs only, no physics/animation (cheap simulation)
    this.far = Math.abs(p.player.x - b.x) > 560 && !this.ridden && !(rec.bonded && rec.follow);
    if (this.far) {
      if ((this.farT += dt) > 1) { rec.hunger = clamp(rec.hunger + this.farT / 300); rec.energy = clamp(rec.energy + (p.night ? this.farT / 60 : -this.farT / 900)); rec.fear = Math.max(0, rec.fear - this.farT * 3); if (rec.hunger > 0.9) rec.hunger = 0.4; this.farT = 0; }
      this.sprite.setVisible(false); this.emote.setVisible(false); this.trap?.setVisible(false);
      return;
    }
    if (!this.ready) return;
    this.sprite.setVisible(true); this.trap?.setVisible(true);
    if (this.ridden) { this.finish(dt, null); return; }

    // stuck detection feeds back into the mind (it will try flying or pick a new goal)
    this.stuckT += dt;
    if (this.stuckT > 0.7) { this.stuck = !!this.intent && this.intent.speed > 0 && Math.abs(b.x - this.lastX) < 3; this.lastX = b.x; this.stuckT = 0; }
    const it = (this.intent = this.mind.update({ ...p, dt, x: b.x, y: b.y, grounded: b.onGround, stuck: this.stuck }));
    if (it.face) this.facing = it.face;
    if (it.vocal) this.vocalize(it.vocal, p.player.x);
    if (rec.bonded) tickCombat(this.combat, dt);
    if (it.strike) {
      if (!rec.bonded) this.strike(false, it.tx + this.facing * 30);
      else {
        // bonded dragons fight with the full move set: melee up close, shots and power orbs from range
        const dist = Math.abs((it.strikeX ?? it.tx) - b.x);
        if (dist < 90) { this.combat.atkCd = 0; melee(this); }
        else if (Math.random() < 0.28) releaseOrb(this, 0.55);
        else { this.combat.shotCd = 0; shoot(this); }
      }
    }

    const canFly = this.ph.stats.flySpeed > 0 && !rec.injured && !rec.trapped && game.stage(rec) !== 'hatchling';
    const dx = it.tx - b.x, dy = it.ty - b.y;
    if (it.speed > 0) {
      if (!this.air && canFly && (it.fly || (b.wall !== 0 && Math.abs(dx) > 30))) { this.air = true; b.vy = -120; w.vfx.puff(b.x, b.y, 0xd8ccb0, 6, { speed: 50 }); audio.play('flap', 0.5); }
      if (this.air) {
        const sp = this.ph.stats.flySpeed * 0.6 * Math.max(0.5, it.speed), d = Math.hypot(dx, dy - 14) || 1;
        const landing = Math.abs(dx) < 30 && !it.fly;
        b.vx = approach(b.vx, (dx / d) * sp, 360 * dt);
        b.vy = approach(b.vy, landing ? 90 : clamp(((dy - 18) / d) * sp, -sp, sp * 0.7), 420 * dt);
        if ((this.flapSfx -= dt) <= 0) { this.flapSfx = 0.5; if (Math.abs(p.player.x - b.x) < 220) audio.play('flap', 0.25); }
      } else {
        const sp = (38 + this.ph.stats.agility * 34) * (0.55 + it.speed * 0.85) * (rec.injured ? 0.5 : 1);
        b.vx = Math.abs(dx) > 4 ? approach(b.vx, Math.sign(dx) * sp, 500 * dt) : approach(b.vx, 0, 600 * dt);
      }
    } else {
      b.vx = approach(b.vx, 0, (this.air ? 200 : 600) * dt);
      if (this.air) b.vy = approach(b.vy, 100, 300 * dt);
    }
    if (!this.air) b.vy = Math.min(b.vy + 800 * dt, 320);
    // water: swimmers float, others avoid it
    if (b.inLiquid === Liquid.Water && b.submerged) { if (this.ph.canSwim) b.vy = approach(b.vy, -30, 900 * dt); else if (canFly) { this.air = true; b.vy = -140; } else b.vy = approach(b.vy, -60, 900 * dt); }
    if (b.inLiquid === Liquid.Lava && !this.ph.abilities.includes('heatProof')) { this.air = canFly; b.vy = -160; }
    moveBody(w.grid, b, dt);
    if (this.air && b.onGround && (it.speed === 0 || !it.fly)) { this.air = false; w.vfx.puff(b.x, b.y, 0xd8ccb0, 5, { speed: 40 }); }
    if (it.ateWorldFood || it.tookOffer) audio.play('eat');
    this.finish(dt, it);
  }

  /** Sprite, emote and persistence sync (also used while ridden). */
  finish(_dt: number, it: Intent | null): void {
    const b = this.body, rec = this.rec;
    rec.x = b.x; rec.y = b.y;
    if (it) {
      const moving = Math.abs(b.vx) > 8;
      this.play(this.air ? 'fly' : it.anim === 'walk' && !moving ? 'idle' : it.anim);
      const tilt = this.air ? clamp(b.vy / 300, -0.5, 0.5) * this.facing : 0;
      this.sprite.setRotation(tilt);
      if (it.emote) { this.emote.setFrame(it.emote).setVisible(true).setPosition(Math.round(b.x + this.facing * 16 * this.s), Math.round(b.y - (44 * this.s + 12) + Math.sin(this.world.scene.time.now / 200) * 1.5)); } else this.emote.setVisible(false);
    } else this.emote.setVisible(false);
    const ox = this.facing > 0 ? DRAGON_OX / DRAGON_FW : 1 - DRAGON_OX / DRAGON_FW;
    this.sprite.setOrigin(ox, DRAGON_OY / DRAGON_FH).setFlipX(this.facing < 0).setPosition(Math.round(b.x), Math.round(b.y) + 1);
    if (this.hitFlash > 0) this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    this.trap?.setPosition(Math.round(b.x), Math.round(b.y) + 2);
    this.syncSaddle(this.ready && game.canRide(this.rec));
  }

  setAnim(a: DragonAnim): void { this.play(a); }
  get animName(): string { return this.anim; }

  /** Apply queued taming feedback as world-space effects; returns events for the scene. */
  feedback(): void {
    const w = this.world, c = this.center;
    for (const e of this.mind.bond.drain()) {
      if (e.kind === 'bondReady') { events.emit('toast', { text: `${this.label} confia em você. Aproxime-se, fique imóvel e segure Interagir.`, icon: 'trust' }); w.vfx.play('exclaim', b(this).x, b(this).y - 40 * this.s, { scale: 0.7 }); continue; }
      if (e.kind === 'bonded') continue;
      if (e.trust > 0.9) { w.vfx.floatText(c.x, c.y - 26 * this.s, `+${Math.round(e.trust)}`, 0x7fe8d0); if (e.kind === 'fed' || e.kind === 'pet' || e.kind === 'healed' || e.kind === 'freed') w.vfx.play('heal', this.body.x, this.body.y, { scale: 0.8 }); }
      else if (e.trust < -0.9) w.vfx.floatText(c.x, c.y - 26 * this.s, `${Math.round(e.trust)}`, 0xff7060);
      if (e.fear > 12) { w.vfx.play('exclaim', this.body.x, this.body.y - 40 * this.s, { scale: 0.7 }); this.vocalize('whine', this.body.x); }
      if (e.text) events.emit('toast', { text: e.text });
    }
  }

  /** Every display object belonging to this dragon (for moving it between depth lanes). */
  objects(): Phaser.GameObjects.GameObject[] { return [this.sprite, this.emote, ...(this.trap ? [this.trap] : []), ...(this.saddleImg ? [this.saddleImg] : [])]; }

  destroy(): void { this.sprite.destroy(); this.emote.destroy(); this.trap?.destroy(); this.saddleImg?.destroy(); }
}
const b = (d: Dragon): Body => d.body;
