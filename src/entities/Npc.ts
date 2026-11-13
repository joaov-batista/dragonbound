import Phaser from 'phaser';
import { PEOPLE, PEOPLE_ANIMS } from '../art/people';
import { DEPTH } from '../core/constants';
import { events } from '../core/events';
import { game } from '../core/state';
import type { World } from '../core/world';
import { makeBody, moveBody, type Body } from '../physics/Body';
import { ambientLine, NAMES, npcMarker, talkTo } from '../story/story';
import { approach } from '../utils/rng';
import type { Interactable } from './Interactables';

const KIDS = new Set(['ivo', 'lia']), WORKERS = new Set(['olvar']), NIGHT_OWLS = new Set(['halvar']);

/** A villager: wanders a stretch of street, works, chats, turns to face you, and goes home at night. */
export class Npc {
  body: Body; sprite: Phaser.GameObjects.Sprite; marker: Phaser.GameObjects.Image; bubble: Phaser.GameObjects.Container | null = null;
  interactable: Interactable;
  private dir = 1; private t = 0; private walkT = 0; private bubbleT = 0; private chatCd = 4 + Math.random() * 6; private chatIdx = 0; private anim = '';
  private readonly x0: number; private readonly x1: number; private readonly homeX: number;

  constructor(private world: World, readonly who: string, x: number, y: number, range: number) {
    this.body = makeBody(x, y, 10, 22); this.homeX = x; this.x0 = x - range * 16; this.x1 = x + range * 16;
    this.sprite = world.scene.add.sprite(x, y, 'people', `${who}_idle_0`).setOrigin(22 / 48, 44 / 48).setDepth(DEPTH.entities - 1);
    this.marker = world.scene.add.image(x, y - 34, 'ui', 'e_alert').setDepth(DEPTH.vfx + 1).setVisible(false);
    this.play('idle');
    const self = this;
    this.interactable = {
      kind: 'npc', id: 'npc-' + who, get x() { return self.body.x; }, get y() { return self.body.y - 10; }, range: 26,
      prompt: () => (self.sprite.visible ? `Falar com ${NAMES[who] ?? who}` : null),
      use: () => self.talk(),
    };
  }

  static createAnims(scene: Phaser.Scene): void {
    for (const id of Object.keys(PEOPLE)) for (const [name, , n] of PEOPLE_ANIMS) {
      const key = `pp-${id}-${name}`; if (scene.anims.exists(key)) continue;
      scene.anims.create({ key, frames: Array.from({ length: n }, (_, i) => ({ key: 'people', frame: `${id}_${name}_${i}` })), frameRate: name === 'walk' ? (KIDS.has(id) ? 12 : 8) : name === 'talk' ? 3 : name === 'work' ? 6 : 6, repeat: name === 'hurt' ? 0 : -1 });
    }
  }

  private play(a: string): void { if (this.anim === a) return; this.anim = a; this.sprite.play(`pp-${this.who}-${a}`); }

  talk(): void {
    this.t = 3; this.play('talk');
    const notify = (text: string, icon?: string): void => events.emit('toast', { text, icon });
    events.emit('talk', talkTo(this.who, notify));
  }

  update(dt: number, px: number, py: number, active: boolean): void {
    const b = this.body, w = this.world, near = active && Math.abs(px - b.x) < 56 && Math.abs(py - b.y) < 40;
    const away = game.night && !NIGHT_OWLS.has(this.who);
    this.t -= dt; this.chatCd -= dt;
    let vx = 0;
    if (away) {
      // walk home, then go inside (fade out) until morning
      if (Math.abs(this.homeX - b.x) > 6) { vx = Math.sign(this.homeX - b.x) * 34; this.dir = Math.sign(vx); }
      this.sprite.setAlpha(Math.max(0, this.sprite.alpha - dt * (Math.abs(this.homeX - b.x) <= 6 ? 1.2 : 0)));
    } else {
      this.sprite.setAlpha(Math.min(1, this.sprite.alpha + dt));
      if (near) { this.dir = Math.sign(px - b.x) || this.dir; if (this.t <= 0) this.play('idle'); }
      else if (this.t <= 0) {
        if ((this.walkT -= dt) <= 0) {
          this.walkT = 1.5 + Math.random() * 3.5;
          const r = Math.random();
          this.dir = b.x < this.x0 ? 1 : b.x > this.x1 ? -1 : r < 0.5 ? -1 : 1;
          this.t = r < 0.45 ? 0 : 1.2 + Math.random() * 2.5; // pause sometimes
          if (WORKERS.has(this.who) && r < 0.7) { this.t = 2.5; this.play('work'); }
        }
        if (this.t <= 0 && this.x1 > this.x0 + 1) vx = this.dir * (KIDS.has(this.who) ? 60 : 26);
      }
      if (KIDS.has(this.who) && b.onGround && Math.random() < dt * 0.4) b.vy = -220;
    }
    b.vx = approach(b.vx, vx, 300 * dt);
    b.vy = Math.min(b.vy + 900 * dt, 320);
    moveBody(w.grid, b, dt);
    if (b.wall !== 0 && b.onGround) b.vy = -200;
    if (Math.abs(b.vx) > 4) this.play('walk'); else if (this.anim === 'walk') this.play(WORKERS.has(this.who) && !near ? 'work' : 'idle');
    this.sprite.setVisible(this.sprite.alpha > 0.02).setPosition(Math.round(b.x), Math.round(b.y) + 1).setFlipX(this.dir < 0).setOrigin(this.dir < 0 ? 1 - 22 / 48 : 22 / 48, 44 / 48);
    // quest marker above the head
    const m = active && this.sprite.visible ? npcMarker(this.who) : null;
    this.marker.setVisible(!!m).setPosition(Math.round(b.x), Math.round(b.y - 36 + Math.sin(w.scene.time.now / 250) * 1.5));
    if (m) this.marker.setFrame(m === 'new' ? 'e_alert' : 'e_question').setTint(m === 'new' ? 0xffe070 : 0x7fe8d0);
    // ambient chatter when the player is around
    if (this.bubble && !active) { this.bubble.destroy(); this.bubble = null; }
    if (this.bubble) { this.bubble.setPosition(Math.round(b.x), Math.round(b.y - 40)); if ((this.bubbleT -= dt) <= 0) { this.bubble.destroy(); this.bubble = null; } }
    else if (active && this.sprite.visible && !away && this.chatCd <= 0 && Math.abs(px - b.x) < 120 && !near) {
      this.chatCd = 9 + Math.random() * 10;
      const line = ambientLine(this.who, this.chatIdx++);
      if (line) this.say(line);
    }
  }

  private say(text: string): void {
    const sc = this.world.scene, t = sc.add.bitmapText(0, 0, 'jersey', text.length > 44 ? text.slice(0, 42) + '…' : text).setOrigin(0.5, 1).setTint(0x1a1424);
    const bg = sc.add.rectangle(0, 2, t.width + 8, t.height + 4, 0xf4f0e6, 0.92).setOrigin(0.5, 1).setStrokeStyle(1, 0x1a1424);
    this.bubble = sc.add.container(this.body.x, this.body.y - 40, [bg, t]).setDepth(DEPTH.vfx + 3);
    this.bubbleT = 3.2;
  }

  objects(): Phaser.GameObjects.GameObject[] { return [this.sprite, this.marker, ...(this.bubble ? [this.bubble] : [])]; }
}
