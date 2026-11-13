import Phaser from 'phaser';
import { HERO_ANIMS, type HeroAnim } from '../art/heroAnims';
import { audio } from '../audio/AudioManager';
import { DEPTH } from '../core/constants';
import { events } from '../core/events';
import { game } from '../core/state';
import type { Damageable, World } from '../core/world';
import type { FoodId } from '../dragons/genetics/types';
import { input } from '../input/InputManager';
import { makeBody, moveBody, type Body, type Rect } from '../physics/Body';
import { Liquid } from '../physics/TileGrid';
import { approach } from '../utils/rng';

const RUN = 108, SNEAK = 42, ACC = 900, AIR_ACC = 620, FRICTION = 1200, GRAV = 900, JUMP = -262, MAX_FALL = 330;
const COYOTE = 0.1, BUFFER = 0.13, DASH_V = 275, DASH_T = 0.15, DASH_CD = 0.38, WALL_SLIDE = 55;
type State = 'normal' | 'dash' | 'attack' | 'parry' | 'hurt' | 'dead' | 'pose' | 'riding';

/** The protagonist: tight platforming, three-hit combo, dash, parry — and the gentle gestures used to befriend dragons. */
export class Player implements Damageable {
  body: Body; sprite: Phaser.GameObjects.Sprite;
  facing = 1; state: State = 'normal'; alive = true;
  iframes = 0; offering: FoodId | null = null; gesturing = false; sneaking = false;
  /** Set for one frame when the player does something abrupt (dash / swing) — dragons notice. */
  sudden = false; whistled = false; hurtRecently = 0;
  attackRect: Rect | null = null; attackId = 0; attackDmg = 1; attackHeavy = false;
  parryWindow = 0; petting = false; holdStill = 0;
  private t = 0; private coyote = 0; private buffer = 0; private dashCd = 0; private airDash = true; private combo = 0; private comboT = 0; private queued = false;
  private anim: HeroAnim = 'idle'; private stepT = 0; private wallLock = 0; private pose: HeroAnim | null = null; private poseT = 0; private ghostT = 0;
  private dashDir = { x: 1, y: 0 };

  constructor(public world: World, x: number, y: number) {
    this.body = makeBody(x, y, 10, 22);
    this.sprite = world.scene.add.sprite(x, y, 'hero', 'idle_0').setOrigin(22 / 48, 44 / 48).setDepth(DEPTH.player);
  }

  static createAnims(scene: Phaser.Scene): void {
    for (const [k, d] of Object.entries(HERO_ANIMS)) {
      if (scene.anims.exists('hero-' + k)) continue;
      scene.anims.create({ key: 'hero-' + k, frames: Array.from({ length: d.n }, (_, i) => ({ key: 'hero', frame: `${k}_${i}` })), frameRate: d.fps, repeat: d.loop ? -1 : 0 });
    }
  }

  get hp(): number { return game.save.player.hp; }
  get motion(): 'still' | 'sneak' | 'walk' | 'run' {
    const v = Math.hypot(this.body.vx, this.body.vy);
    if (this.state === 'dash' || this.state === 'attack') return 'run';
    return v < 8 ? 'still' : this.sneaking ? 'sneak' : v < 60 ? 'walk' : 'run';
  }
  get busy(): boolean { return this.state !== 'normal' && this.state !== 'pose'; }
  get center(): { x: number; y: number } { return { x: this.body.x, y: this.body.y - 12 }; }

  private play(a: HeroAnim, restart = false): void {
    if (this.anim === a && !restart) return;
    this.anim = a; this.sprite.play('hero-' + a, false);
  }

  /** Hold a gentle pose (offer / pet / calm / whistle). Cancelled by movement. */
  setPose(p: HeroAnim | null, t = 0.2): void { this.pose = p; this.poseT = t; if (p && this.state === 'normal') this.state = 'pose'; }

  hurt(dmg: number, fromX: number): boolean {
    if (!this.alive || this.iframes > 0 || this.state === 'dash') return false;
    if (this.state === 'parry' && this.parryWindow > 0) {
      this.world.vfx.play('parry', this.body.x + this.facing * 8, this.body.y, { flip: this.facing < 0 });
      audio.play('parry'); this.world.hitstop(0.12); this.world.shake(2); this.iframes = 0.5;
      return false; // caller checks `parried`
    }
    const p = game.save.player;
    p.hp = Math.max(0, p.hp - dmg); events.emit('hudDirty');
    this.iframes = 1.1; this.hurtRecently = 3; this.state = 'hurt'; this.t = 0.28; this.attackRect = null; this.offering = null;
    this.body.vx = Math.sign(this.body.x - fromX || 1) * 150; this.body.vy = -170;
    audio.play('hurt'); this.world.hitstop(0.08); this.world.shake(4);
    this.world.vfx.play('hit', this.body.x, this.body.y - 10); this.world.scene.cameras.main.flash(90, 255, 80, 80);
    if (p.hp <= 0) { this.alive = false; this.state = 'dead'; this.t = 1.6; this.play('death', true); audio.play('death'); }
    return true;
  }
  /** True when the last blocked hit was a successful parry (window still open). */
  get parrying(): boolean { return this.state === 'parry' && this.parryWindow > 0; }

  revive(x: number, y: number): void {
    this.alive = true; this.state = 'normal'; this.body.x = x; this.body.y = y; this.body.vx = this.body.vy = 0; this.iframes = 1.5;
    game.save.player.hp = game.save.player.maxHp; events.emit('hudDirty');
  }

  private startAttack(air: boolean): void {
    this.state = 'attack'; this.sudden = true; this.queued = false;
    this.combo = air ? 0 : this.comboT > 0 ? (this.combo % 3) + 1 : 1;
    const a: HeroAnim = air ? 'airattack' : (`attack${this.combo}` as HeroAnim);
    this.t = HERO_ANIMS[a].n / HERO_ANIMS[a].fps + 0.04; this.play(a, true);
    this.attackId++; this.attackHeavy = this.combo === 3; this.attackDmg = this.attackHeavy ? 2 : 1;
    const f = this.facing, b = this.body;
    const fx = air ? 'spin' : this.combo === 1 ? 'slash' : this.combo === 2 ? 'slash2' : 'cleave';
    this.world.vfx.play(fx, b.x + (air ? 0 : f * 2), b.y, { flip: f < 0, follow: b, scale: air ? 0.8 : 1, speed: fx === 'cleave' ? 2.2 : 1.3 });
    audio.play('slash', this.attackHeavy ? 1.2 : 0.9);
    if (!air) b.vx = f * (this.attackHeavy ? 120 : 60);
  }

  update(dt: number): void {
    const b = this.body, w = this.world, inp = input;
    this.sudden = false; this.whistled = false; this.petting = false;
    this.iframes = Math.max(0, this.iframes - dt); this.hurtRecently = Math.max(0, this.hurtRecently - dt);
    this.dashCd -= dt; this.comboT -= dt; this.wallLock -= dt; this.parryWindow -= dt;
    if (this.state === 'riding') { this.sprite.setAlpha(1); return; }
    const ax = inp.axisX, swim = b.inLiquid === Liquid.Water && b.submerged;
    this.buffer = inp.pressed('jump') ? BUFFER : this.buffer - dt;
    this.coyote = b.onGround ? COYOTE : this.coyote - dt;
    if (b.onGround) this.airDash = true;

    switch (this.state) {
      case 'dead':
        b.vx = approach(b.vx, 0, FRICTION * dt); b.vy = Math.min(b.vy + GRAV * dt, MAX_FALL); moveBody(w.grid, b, dt);
        this.t -= dt; break;
      case 'hurt':
        b.vy = Math.min(b.vy + GRAV * dt, MAX_FALL); moveBody(w.grid, b, dt); this.play('hurt');
        if ((this.t -= dt) <= 0) this.state = 'normal';
        break;
      case 'dash':
        b.vx = this.dashDir.x * DASH_V; b.vy = this.dashDir.y * DASH_V * 0.8; moveBody(w.grid, b, dt);
        if ((this.ghostT -= dt) <= 0) { this.ghostT = 0.035; this.ghost(); }
        if ((this.t -= dt) <= 0 || b.wall !== 0) { this.state = 'normal'; b.vx *= 0.55; b.vy = Math.min(b.vy * 0.4, 0); }
        break;
      case 'parry':
        b.vx = approach(b.vx, 0, FRICTION * dt); b.vy = Math.min(b.vy + GRAV * dt, MAX_FALL); moveBody(w.grid, b, dt);
        if ((this.t -= dt) <= 0) this.state = 'normal';
        break;
      case 'attack': {
        b.vx = approach(b.vx, 0, (b.onGround ? 500 : 100) * dt); b.vy = Math.min(b.vy + GRAV * (this.anim === 'airattack' ? 0.7 : 1) * dt, MAX_FALL);
        moveBody(w.grid, b, dt);
        if (inp.pressed('attack')) this.queued = true;
        const total = HERO_ANIMS[this.anim].n / HERO_ANIMS[this.anim].fps, el = total - (this.t - 0.04);
        const active = el > total * 0.2 && el < total * 0.7;
        const f = this.facing;
        this.attackRect = !active ? null : this.anim === 'airattack' ? { x: b.x - 26, y: b.y - 34, w: 52, h: 42 }
          : { x: f > 0 ? b.x - 2 : b.x - 38 - (this.attackHeavy ? 8 : 0), y: b.y - (this.attackHeavy ? 40 : 30), w: 40 + (this.attackHeavy ? 8 : 0), h: this.attackHeavy ? 44 : 30 };
        if ((this.t -= dt) <= 0) {
          this.attackRect = null; this.state = 'normal'; this.comboT = 0.28;
          if (this.queued && b.onGround && this.combo < 3) this.startAttack(false);
        }
        break;
      }
      case 'pose': case 'normal': {
        // gentle poses end as soon as the player moves or acts
        if (this.state === 'pose') {
          this.poseT -= dt;
          if (!this.pose || this.poseT <= 0 || Math.abs(ax) > 0.3 || !b.onGround) { this.state = 'normal'; this.pose = null; }
        }
        this.sneaking = inp.down('sneak') && b.onGround;
        const max = swim ? 60 : this.sneaking ? SNEAK : RUN * Math.min(1, Math.abs(ax) < 0.15 ? 0 : Math.max(0.35, Math.abs(ax)));
        if (this.wallLock <= 0) {
          if (Math.abs(ax) > 0.15 && this.state === 'normal') { b.vx = approach(b.vx, Math.sign(ax) * max, (b.onGround ? ACC : AIR_ACC) * dt); this.facing = Math.sign(ax); }
          else b.vx = approach(b.vx, 0, (b.onGround ? FRICTION : 260) * dt);
        }
        // gravity, variable jump height, swimming, wall slide
        if (swim) {
          b.vy = approach(b.vy, inp.down('down') ? 70 : 28, 500 * dt); b.vx *= 1 - 2 * dt;
          if (inp.down('jump') || inp.down('up')) b.vy = approach(b.vy, -105, 1400 * dt);
          if (w.grid.liquidAt(b.x, b.y - b.h - 2) === Liquid.None && inp.pressed('jump')) { b.vy = JUMP * 0.9; audio.play('splash', 0.5); w.vfx.play('splash', b.x, b.y - 14, { scale: 0.6 }); }
        } else {
          const g = b.vy < 0 && inp.down('jump') ? GRAV * 0.62 : Math.abs(b.vy) < 40 ? GRAV * 0.75 : GRAV;
          b.vy = Math.min(b.vy + g * dt, MAX_FALL);
          const sliding = !b.onGround && b.wall !== 0 && Math.sign(ax) === b.wall && b.vy > 0;
          if (sliding) { b.vy = Math.min(b.vy, WALL_SLIDE); this.facing = -b.wall; }
          if (this.buffer > 0) {
            if (this.coyote > 0) {
              if (inp.down('down') && w.grid.cell(Math.floor(b.x / 16), Math.floor((b.y + 1) / 16)) === 2) { b.dropThrough = 0.22; this.buffer = 0; }
              else { b.vy = JUMP; this.buffer = 0; this.coyote = 0; audio.play('jump'); w.vfx.puff(b.x, b.y, 0xd8ccb0, 4, { speed: 30, spread: 70 }); }
            } else if (b.wall !== 0 && !b.onGround) {
              b.vy = JUMP * 0.92; b.vx = -b.wall * 150; this.facing = -b.wall; this.wallLock = 0.14; this.buffer = 0; audio.play('jump'); w.vfx.puff(b.x + b.wall * 5, b.y - 8, 0xd8ccb0, 4, { speed: 30 });
            }
          }
        }
        moveBody(w.grid, b, dt);
        if (b.landed > 200) { audio.play('land'); w.vfx.play('land', b.x, b.y, { scale: 0.6 }); } else if (b.landed > 60) audio.play('step', 1.4);
        // actions
        if (inp.pressed('dash') && this.dashCd <= 0 && (b.onGround || this.airDash) && !swim) {
          const dx = Math.abs(ax) > 0.3 ? Math.sign(ax) : this.facing, dy = inp.axisY < -0.5 ? -1 : inp.axisY > 0.5 && !b.onGround ? 1 : 0, n = Math.hypot(dx, dy) || 1;
          this.dashDir = { x: dx / n, y: dy / n }; this.facing = dx;
          this.state = 'dash'; this.t = DASH_T; this.dashCd = DASH_CD; this.sudden = true; if (!b.onGround) this.airDash = false;
          this.play('dash', true); audio.play('dash'); w.vfx.puff(b.x, b.y - 4, 0xffffff, 6, { speed: 60, spread: 180, gravity: 0 });
        } else if (inp.pressed('attack') && !swim) this.startAttack(!b.onGround);
        else if (inp.pressed('parry') && b.onGround) { this.state = 'parry'; this.t = 0.38; this.parryWindow = 0.22; this.play('parry', true); }
        if (inp.pressed('call')) { this.whistled = true; this.setPose('whistle', 0.5); audio.play('whistle'); }
        this.gesturing = inp.down('gesture') && b.onGround && Math.abs(b.vx) < 10;
        if (this.gesturing) this.setPose('calm', 0.15);
        this.holdStill = Math.abs(b.vx) < 6 && b.onGround ? this.holdStill + dt : 0;
        // animation
        if (this.state === 'pose' && this.pose) this.play(this.pose);
        else if (this.state === 'normal') {
          if (swim) this.play('swim');
          else if (!b.onGround) this.play(b.wall !== 0 && b.vy > 0 && Math.sign(ax) === b.wall ? 'wall' : b.vy < 0 ? 'jump' : 'fall');
          else if (Math.abs(b.vx) > 12) {
            this.play(this.sneaking ? 'sneak' : 'run');
            if ((this.stepT -= dt * (this.sneaking ? 0.4 : 1)) <= 0) { this.stepT = 0.26; audio.play('step', this.sneaking ? 0.3 : 0.8); if (!this.sneaking) w.vfx.puff(b.x - this.facing * 4, b.y, 0xd8ccb0, 2, { speed: 20, life: 300 }); }
          } else this.play(this.sneaking ? 'sneak' : 'idle');
          if (this.sneaking && Math.abs(b.vx) < 12) this.sprite.anims.pause(); else if (this.sprite.anims.isPaused) this.sprite.anims.resume();
        }
        break;
      }
    }
    if (this.state !== 'pose' && this.state !== 'normal') { this.gesturing = false; }
    // hazards
    if (this.alive && (b.hazard || b.inLiquid === Liquid.Lava)) { if (this.hurt(1, b.x - this.facing)) { b.vy = -260; if (b.inLiquid === Liquid.Lava) w.vfx.play('burning', b.x, b.y, { follow: b }); } }
    this.syncSprite();
  }

  private ghost(): void {
    const s = this.sprite, g = this.world.scene.add.image(s.x, s.y, 'hero', s.frame.name).setOrigin(s.originX, s.originY).setFlipX(s.flipX).setDepth(DEPTH.player - 1).setTint(0x8fd8ff).setTintMode(Phaser.TintModes.FILL).setAlpha(0.6);
    this.world.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  syncSprite(): void {
    const b = this.body;
    this.sprite.setPosition(Math.round(b.x), Math.round(b.y) + 1).setFlipX(this.facing < 0);
    if (this.facing < 0) this.sprite.setOrigin(1 - 22 / 48, 44 / 48); else this.sprite.setOrigin(22 / 48, 44 / 48);
    this.sprite.setAlpha(this.iframes > 0 && this.state !== 'dash' && Math.floor(this.iframes * 20) % 2 === 0 ? 0.35 : 1);
  }

  /** Put the hero on a saddle; movement is then driven by the flight controller. */
  mount(): void { this.state = 'riding'; this.attackRect = null; this.offering = null; this.anim = 'ride'; this.sprite.anims.stop(); this.sprite.setFrame('ride_0'); }
  dismount(x: number, y: number, vy = -150): void { this.state = 'normal'; this.body.x = x; this.body.y = y; this.body.vx = 0; this.body.vy = vy; this.anim = 'idle'; this.sprite.setRotation(0); this.play('fall', true); }
  get deadDone(): boolean { return this.state === 'dead' && this.t <= 0; }
}
