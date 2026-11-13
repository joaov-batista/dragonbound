import Phaser from 'phaser';
import { mix } from '../art/Pix';
import { pixToTexture } from '../art/runtime';
import { THEMES } from '../art/themes';
import { audio } from '../audio/AudioManager';
import { GAME_H, VERSION } from '../core/constants';
import { events } from '../core/events';
import { hud } from '../core/hud';
import { game } from '../core/state';
import { createWild, expressPhenotype, GeneticRegistry } from '../dragons/genetics/genome';
import type { SpeciesId } from '../dragons/genetics/types';
import { paintDragonSheet } from '../dragons/rendering/DragonPainter';
import { input } from '../input/InputManager';
import { SaveManager } from '../save/SaveManager';
import { COL, panel, txt } from '../ui/kit';

interface Flyer { s: Phaser.GameObjects.Sprite; vx: number; y: number; amp: number; ph: number; layer: number }

/**
 * Title screen. Everything here is screen-fixed (the camera never moves); the only motion is a
 * sky full of freshly generated dragons crossing at three depths — every visit shows new individuals.
 */
export class TitleScene extends Phaser.Scene {
  private rows: { label: string; fn: () => void }[] = []; private idx = 0; private ui: Phaser.GameObjects.GameObject[] = [];
  private sky!: Phaser.GameObjects.Image; private clouds: Phaser.GameObjects.TileSprite[] = []; private flyers: Flyer[] = [];
  private busy = false; private hasSave = false; private note = ''; private t = 0;
  constructor() { super('Title'); }

  create(): void {
    hud.mode = 'title'; this.busy = false; this.note = ''; this.t = 0; this.flyers = []; this.clouds = [];
    const th = THEMES.tropical;
    this.sky = this.add.image(0, 0, 'tropical_sky').setOrigin(0).setDepth(-100);
    this.clouds.push(this.add.tileSprite(0, 18, 10, 96, 'tropical_clouds').setOrigin(0).setDepth(-90).setAlpha(0.55).setTint(mix(th.cloud, th.skyMid, 0.35)));
    this.clouds.push(this.add.tileSprite(0, 110, 10, 96, 'tropical_clouds').setOrigin(0).setDepth(-60).setAlpha(0.9).setFlipX(true));
    this.spawnDragons();
    this.cameras.main.fadeIn(600, 8, 6, 16);
    audio.setMusic('calm'); audio.setAmbience({ wind: 0.3, birds: 0.3 });
    SaveManager.exists().then((ok) => { this.hasSave = ok; this.build(); }).catch(() => this.build());
    this.build();
    this.scale.on('resize', this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.build, this);
      for (const k of this.textures.getTextureKeys()) if (k.startsWith('title-dg')) { this.anims.remove(k); this.textures.remove(k); }
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock(); if (hud.inMenu || this.busy) return;
      const W = this.scale.width;
      this.rows.forEach((r, i) => { const y = this.rowY(i); if (Math.abs(p.x - W / 2) < 76 && p.y >= y && p.y < y + 20) { this.idx = i; r.fn(); } });
    });
  }

  /** Paint a handful of brand-new wild dragons; small ones are drawn as juveniles so pixels stay 1:1. */
  private spawnDragons(): void {
    const reg = new GeneticRegistry(), base = (Math.random() * 1e9) | 0, sky = THEMES.tropical.skyMid;
    const roster: [SpeciesId, number, number][] = [['trovisco', 0.45, 0], ['marulho', 0.5, 0], ['geadino', 0.45, 0], ['folhasca', 0.6, 1], ['cinzal', 0.7, 1], ['marulho', 1, 2], ['trovisco', 1, 2]];
    roster.forEach(([sp, scale, layer], i) => {
      const ph = expressPhenotype(createWild(sp, base + i * 7919, reg)), key = `title-dg${i}`;
      const sheet = paintDragonSheet(ph, scale, ['fly']);
      pixToTexture(this, key, sheet.pix, sheet.frames);
      this.anims.create({ key, frames: Array.from({ length: 6 }, (_, f) => ({ key, frame: `fly_${f}` })), frameRate: 9 + layer * 2 + (i % 3), repeat: -1 });
      const s = this.add.sprite(0, 0, key, 'fly_0').play({ key, startFrame: i % 6 }).setDepth(-80 + layer * 15);
      if (layer === 0) s.setTint(mix(0xffffff, sky, 0.45)).setAlpha(0.85);
      const dir = i % 2 ? -1 : 1, speed = (16 + layer * 16 + (i % 3) * 5) * dir;
      const f: Flyer = { s, vx: speed, y: 30 + ((i * 53) % 150), amp: 4 + layer * 4, ph: i * 1.7, layer };
      s.setFlipX(dir < 0).setX(Math.random() * this.scale.width);
      this.flyers.push(f);
    });
  }

  private rowY(i: number): number { return 128 + i * 22; }

  private build(): void {
    const W = this.scale.width;
    this.ui.forEach((o) => o.destroy()); this.ui = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.ui.push(o); return o; };
    const logo = add(this.add.bitmapText(W / 2, 30, 'jersey', 'DRAGONBOUND', 48).setOrigin(0.5, 0).setTint(0xf4f0e6).setDropShadow(3, 3, 0x1a1424, 1).setDepth(10));
    add(this.add.rectangle(W / 2, 76, logo.width, 2, COL.gold).setDepth(10));
    // BETA badge pinned to the logo's top-right corner
    const bx = Math.round(W / 2 + logo.width / 2 - 6), by = 24;
    add(this.add.rectangle(bx, by, 34, 13, 0xb8552e).setOrigin(0.5).setStrokeStyle(1, 0x0c0e1a).setDepth(11).setAngle(-8));
    add(txt(this, bx, by - 7, 'BETA', 0xffffff).setOrigin(0.5, 0).setDepth(12).setAngle(-8));
    add(txt(this, W / 2, 80, 'Nenhum dragão nasce igual a outro', COL.gold).setOrigin(0.5, 0).setDepth(10));
    this.rows = [];
    if (this.hasSave) this.rows.push({ label: 'Continuar', fn: () => this.continue() });
    this.rows.push({ label: 'Novo jogo', fn: () => this.newGame() }, { label: 'Opções', fn: () => events.emit('openMenu', { tab: 'options' }) },
      { label: 'Importar save', fn: () => { SaveManager.pickFile().then(async (s) => { game.loadFrom(s); await game.persist(); this.hasSave = true; this.note = 'Save importado.'; this.build(); }).catch(() => { this.note = 'Não foi possível importar esse arquivo.'; this.build(); }); } });
    this.idx = Math.min(this.idx, this.rows.length - 1);
    this.rows.forEach((r, i) => {
      const y = this.rowY(i), on = i === this.idx;
      add(panel(this, W / 2 - 70, y, 140, 20, on ? 'btn_focus' : 'btn').setDepth(10));
      add(txt(this, W / 2, y + 3, r.label, on ? 0xffffff : COL.text).setOrigin(0.5, 0).setDepth(11));
    });
    add(this.add.rectangle(0, GAME_H - 17, W, 17, 0x0c0e1a, 0.55).setOrigin(0).setDepth(9));
    add(txt(this, W / 2, GAME_H - 15, this.note || `Versão beta ${VERSION} · em desenvolvimento`, this.note ? COL.gold : COL.dim).setOrigin(0.5, 0).setDepth(10));
  }

  private start(): void {
    if (this.busy) return; this.busy = true; audio.play('bond', 0.5);
    this.cameras.main.fadeOut(500, 8, 6, 16);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (game.save.ocean.atSea) this.scene.start('Ocean', { from: game.save.player.island, resume: true });
      else this.scene.start('Island', { islandId: game.save.player.island, entry: 'load' });
    });
  }
  private continue(): void { SaveManager.load().then((s) => { if (s) { game.loadFrom(s); this.start(); } }).catch((e: Error) => { this.note = e.message; this.build(); }); }
  private newGame(): void {
    if (this.hasSave && this.note !== 'Isso apaga o progresso atual. Confirme de novo.') { this.note = 'Isso apaga o progresso atual. Confirme de novo.'; audio.play('deny'); this.build(); return; }
    game.newGame(); this.start();
  }

  override update(_time: number, delta: number): void {
    const dt = delta / 1000, W = this.scale.width; this.t += dt;
    audio.update(dt, 1);
    this.sky.setDisplaySize(W, GAME_H);
    this.clouds.forEach((c, i) => { c.setSize(W, 96); c.tilePositionX += dt * (3 + i * 6); });
    for (const f of this.flyers) {
      const s = f.s; let x = s.x + f.vx * dt;
      const m = s.width * 0.6;
      if (f.vx > 0 && x > W + m) { x = -m; f.y = 24 + Math.random() * 160; } else if (f.vx < 0 && x < -m) { x = W + m; f.y = 24 + Math.random() * 160; }
      s.setPosition(Math.round(x), Math.round(f.y + Math.sin(this.t * 1.3 + f.ph) * f.amp)).setRotation(Math.cos(this.t * 1.3 + f.ph) * 0.06 * Math.sign(f.vx));
    }
    if (hud.inMenu || this.busy) return;
    if (input.pressed('down')) { this.idx = (this.idx + 1) % this.rows.length; audio.play('ui'); this.build(); }
    if (input.pressed('up')) { this.idx = (this.idx + this.rows.length - 1) % this.rows.length; audio.play('ui'); this.build(); }
    if (input.pressed('jump') || input.pressed('interact') || input.pressed('attack')) { audio.unlock(); this.rows[this.idx]?.fn(); }
  }
}
