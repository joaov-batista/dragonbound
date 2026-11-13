import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { GAME_H } from '../core/constants';
import { events } from '../core/events';
import { hud } from '../core/hud';
import { game } from '../core/state';
import { createWild, expressPhenotype, GeneticRegistry } from '../dragons/genetics/genome';
import { paintDragonSheet } from '../dragons/rendering/DragonPainter';
import { pixToTexture } from '../art/runtime';
import { input } from '../input/InputManager';
import { SaveManager } from '../save/SaveManager';
import { COL, panel, txt } from '../ui/kit';
import { Backdrop } from '../world/Backdrop';

export class TitleScene extends Phaser.Scene {
  private backdrop!: Backdrop; private rows: { label: string; fn: () => void }[] = []; private idx = 0; private objs: Phaser.GameObjects.GameObject[] = [];
  private t = 0; private dragon!: Phaser.GameObjects.Sprite; private busy = false; private hasSave = false; private note = '';
  constructor() { super('Title'); }

  create(): void {
    hud.mode = 'title'; this.busy = false; this.t = 0; this.note = '';
    this.backdrop = new Backdrop(this, 'tropical', 170);
    // a different wild dragon greets the player on every visit — straight from the DNA pipeline
    const genes = createWild(['marulho', 'trovisco', 'cinzal', 'geadino'][Math.floor(Math.random() * 4)] as 'marulho', (Math.random() * 1e9) | 0, new GeneticRegistry());
    const sheet = paintDragonSheet(expressPhenotype(genes), 1);
    pixToTexture(this, 'title-dragon', sheet.pix, sheet.frames);
    if (this.anims.exists('title-fly')) this.anims.remove('title-fly');
    this.anims.create({ key: 'title-fly', frames: Array.from({ length: 6 }, (_, i) => ({ key: 'title-dragon', frame: `fly_${i}` })), frameRate: 11, repeat: -1 });
    this.dragon = this.add.sprite(-80, 80, 'title-dragon', 'fly_0').play('title-fly').setDepth(5);
    this.cameras.main.fadeIn(600, 8, 6, 16);
    audio.setMusic('calm'); audio.setAmbience({ waves: 0.6, birds: 0.5, wind: 0.15 });
    SaveManager.exists().then((ok) => { this.hasSave = ok; this.build(); }).catch(() => this.build());
    this.build();
    this.scale.on('resize', this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.build, this));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock(); if (hud.inMenu) return;
      const W = this.scale.width;
      this.rows.forEach((r, i) => { const y = 122 + i * 22; if (Math.abs(p.x - W / 2) < 80 && p.y >= y && p.y < y + 20) { this.idx = i; r.fn(); } });
    });
  }

  private build(): void {
    const W = this.scale.width;
    this.objs.forEach((o) => o.destroy()); this.objs = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.objs.push(o); return o; };
    const logo = add(this.add.bitmapText(W / 2, 34, 'jersey', 'DRAGONBOUND', 48).setOrigin(0.5, 0).setTint(0xf4f0e6).setDropShadow(3, 3, 0x1a1424, 1).setDepth(10));
    add(this.add.rectangle(W / 2, 80, logo.width, 2, COL.gold).setDepth(10));
    add(txt(this, W / 2, 84, 'Nenhum dragão nasce igual a outro', COL.gold).setOrigin(0.5, 0).setDepth(10));
    this.rows = [];
    if (this.hasSave) this.rows.push({ label: 'Continuar', fn: () => this.continue() });
    this.rows.push({ label: 'Novo jogo', fn: () => this.newGame() }, { label: 'Opções', fn: () => events.emit('openMenu', { tab: 'options' }) },
      { label: 'Importar save', fn: () => { SaveManager.pickFile().then(async (s) => { game.loadFrom(s); await game.persist(); this.hasSave = true; this.note = 'Save importado.'; this.build(); }).catch(() => { this.note = 'Não foi possível importar esse arquivo.'; this.build(); }); } });
    this.idx = Math.min(this.idx, this.rows.length - 1);
    this.rows.forEach((r, i) => {
      const y = 122 + i * 22, on = i === this.idx;
      add(panel(this, W / 2 - 70, y, 140, 20, on ? 'btn_focus' : 'btn').setDepth(10));
      add(txt(this, W / 2, y + 3, r.label, on ? 0xffffff : COL.text).setOrigin(0.5, 0).setDepth(11));
    });
    add(txt(this, W / 2, GAME_H - 15, this.note || 'v0.1 · Phaser 4 · arte e áudio procedurais · PixelFx', this.note ? COL.gold : COL.dim).setOrigin(0.5, 0).setDepth(10));
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

  override update(time: number, delta: number): void {
    const dt = delta / 1000; this.t += dt;
    audio.update(dt, 1);
    const cam = this.cameras.main; cam.scrollX += dt * 14;
    this.backdrop.update(dt, cam, 0xffffff);
    const W = this.scale.width;
    this.dragon.setPosition(cam.scrollX + ((this.t * 46) % (W + 220)) - 110, 96 + Math.sin(time / 600) * 10).setRotation(Math.cos(time / 600) * 0.12);
    if (hud.inMenu || this.busy) return;
    if (input.pressed('down')) { this.idx = (this.idx + 1) % this.rows.length; audio.play('ui'); this.build(); }
    if (input.pressed('up')) { this.idx = (this.idx + this.rows.length - 1) % this.rows.length; audio.play('ui'); this.build(); }
    if (input.pressed('jump') || input.pressed('interact') || input.pressed('attack')) { audio.unlock(); this.rows[this.idx]?.fn(); }
  }
}
