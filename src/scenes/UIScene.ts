import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { events } from '../core/events';
import { hud } from '../core/hud';
import { settings } from '../core/settings';
import { game } from '../core/state';
import { STAGE_LABEL, bondStage } from '../dragons/DragonRecord';
import { keyLabel, padBindLabel, type Action } from '../input/actions';
import { input } from '../input/InputManager';
import { COL, bar, panel, txt, wrap } from '../ui/kit';
import { Menu } from '../ui/Menu';
import { TouchControls } from '../ui/TouchControls';

/** HUD, prompts, toasts, dialogs, touch controls and the pause menu — drawn above every gameplay scene. */
export class UIScene extends Phaser.Scene {
  private hearts: Phaser.GameObjects.Image[] = [];
  private itemIcon!: Phaser.GameObjects.Image; private itemCount!: Phaser.GameObjects.BitmapText; private itemBox!: Phaser.GameObjects.NineSlice;
  private prompt!: Phaser.GameObjects.BitmapText; private promptBg!: Phaser.GameObjects.Rectangle; private holdBar!: ReturnType<typeof bar>;
  private dPanel!: Phaser.GameObjects.Container; private dName!: Phaser.GameObjects.BitmapText; private dInfo!: Phaser.GameObjects.BitmapText; private dTrust!: ReturnType<typeof bar>; private dFear!: ReturnType<typeof bar>; private dEl!: Phaser.GameObjects.Image;
  private stam!: ReturnType<typeof bar>; private stamIcon!: Phaser.GameObjects.Image; private fps!: Phaser.GameObjects.BitmapText;
  private toasts: { c: Phaser.GameObjects.Container; t: number }[] = [];
  private dialog: Phaser.GameObjects.Container | null = null; private title: Phaser.GameObjects.Container | null = null;
  private vignette!: Phaser.GameObjects.Image; private compass!: Phaser.GameObjects.BitmapText;
  touch!: TouchControls; menu!: Menu;
  private sawTouch = false; private dirty = true;

  constructor() { super('UI'); }

  create(): void {
    const W = this.scale.width;
    this.vignette = this.add.image(0, 0, 'ui', 'vignette').setOrigin(0).setDepth(-1);
    for (let i = 0; i < 10; i++) this.hearts.push(this.add.image(12 + i * 13, 12, 'ui', 'heart').setScale(0.8));
    this.itemBox = panel(this, 4, 22, 24, 24, 'panel'); this.itemIcon = this.add.image(16, 34, 'ui', 'berry'); this.itemCount = txt(this, 30, 30, 'x0');
    this.stamIcon = this.add.image(12, 56, 'ui', 'stamina').setScale(0.7); this.stam = bar(this, null, 22, 54, 64, 0x7fe0a0);
    this.promptBg = this.add.rectangle(0, 0, 10, 16, 0x0c0e1a, 0.7).setOrigin(0.5, 0); this.prompt = txt(this, 0, 0, '').setOrigin(0.5, 0);
    this.holdBar = bar(this, null, W / 2 - 40, 0, 80, COL.teal);
    this.dPanel = this.add.container(0, 4);
    const bg = panel(this, 0, 0, 150, 40, 'panel'); this.dName = txt(this, 22, 1, ''); this.dInfo = txt(this, 6, 13, '', COL.dim); this.dEl = this.add.image(11, 10, 'ui', 'el_fire').setScale(0.8);
    this.dPanel.add([bg, this.dName, this.dInfo, this.dEl, this.add.image(11, 30, 'ui', 'trust').setScale(0.55), this.add.image(81, 30, 'ui', 'fear').setScale(0.55)]);
    this.dTrust = bar(this, this.dPanel, 18, 28, 54, COL.teal); this.dFear = bar(this, this.dPanel, 88, 28, 54, 0xf0c040);
    this.fps = txt(this, 4, 0, '', COL.dim); this.compass = txt(this, 0, 0, '', COL.gold).setOrigin(0.5, 0);
    this.touch = new TouchControls(this);
    this.menu = new Menu(this, this.touch, () => this.toTitle());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      if (p.wasTouch) { this.sawTouch = true; input.lastDevice = 'touch'; }
      if (hud.dialog && !this.menu.open) { hud.dialog = null; this.showDialog(null); audio.play('uiBack'); return; }
      if (!this.menu.open && p.x < 60 && p.y > 18 && p.y < 50 && hud.mode === 'ground') { game.cycleItem(1); audio.play('ui'); }
    });
    this.input.keyboard?.on('keydown', () => audio.unlock());

    const offs = [
      events.on('toast', (t) => this.toast(t.text, t.icon)), events.on('dialog', (d) => this.showDialog(d?.text ?? null)), events.on('areaTitle', (t) => this.areaTitle(t.title, t.subtitle)),
      events.on('hudDirty', () => { this.dirty = true; }), events.on('openMenu', (o) => this.menu.show(o?.tab)), events.on('closeMenu', () => this.menu.hide()),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => offs.forEach((f) => f()));
    this.scale.on('resize', () => { this.dirty = true; if (this.menu.open) this.menu.draw(); });
  }

  private toTitle(): void {
    for (const k of ['Island', 'Ocean']) if (this.scene.isActive(k) || this.scene.isPaused(k)) this.scene.stop(k);
    hud.mode = 'title'; hud.prompt = null; hud.dialog = null;
    this.scene.start('Title');
  }

  private label(action: string): string {
    if (input.lastDevice === 'touch') return '';
    const a = action as Action;
    return input.lastDevice === 'gamepad' ? `[${padBindLabel(input.bindings.pad[a]?.[0], input.padKind)}] ` : `[${keyLabel(input.bindings.keys[a]?.[0])}] `;
  }

  toast(text: string, icon?: string): void {
    const W = this.scale.width, t = txt(this, icon ? 9 : 0, 0, wrap(this, text, Math.min(280, W - 60)));
    const c = this.add.container(0, 0).setDepth(700), w = t.width + (icon ? 9 : 0) + 10;
    c.add(this.add.rectangle(-5, -1, w, t.height + 5, 0x0c0e1a, 0.78).setOrigin(0)); c.add(t);
    if (icon) c.add(this.add.image(2, 7, 'ui', icon).setScale(0.6));
    c.setData('w', w); c.setData('h', t.height + 7);
    this.toasts.push({ c, t: 3.2 + text.length * 0.03 });
    if (this.toasts.length > 4) this.toasts.shift()!.c.destroy();
  }

  private showDialog(text: string | null): void {
    this.dialog?.destroy(); this.dialog = null; hud.dialog = text;
    if (!text) return;
    const W = this.scale.width, H = this.scale.height, w = Math.min(380, W - 24), t = txt(this, 10, 6, wrap(this, text, w - 20));
    const h = t.height + 26, c = this.add.container(Math.round((W - w) / 2), H - h - (this.touch.visible ? 96 : 14)).setDepth(750);
    c.add([panel(this, 0, 0, w, h, 'panel'), t, txt(this, w - 8, h - 17, input.lastDevice === 'touch' ? 'toque para continuar' : `${this.label('interact')}continuar`, COL.gold).setOrigin(1, 0)]);
    this.dialog = c;
  }

  private areaTitle(title: string, subtitle?: string): void {
    this.title?.destroy();
    const W = this.scale.width, c = this.add.container(W / 2, 62).setDepth(650).setAlpha(0);
    const t = this.add.bitmapText(0, 0, 'jersey', title, 32).setOrigin(0.5, 0).setTint(COL.text).setDropShadow(2, 2, 0x0c0e1a, 1);
    c.add([this.add.rectangle(0, 34, Math.max(120, t.width + 30), 1, COL.gold), t]);
    if (subtitle) c.add(txt(this, 0, 37, subtitle, COL.gold).setOrigin(0.5, 0));
    this.title = c;
    this.tweens.add({ targets: c, alpha: 1, duration: 600, hold: 2200, yoyo: true, onComplete: () => { c.destroy(); if (this.title === c) this.title = null; } });
  }

  override update(_t: number, delta: number): void {
    const dt = delta / 1000, W = this.scale.width, H = this.scale.height, p = game.save.player;
    const inGame = hud.mode !== 'title';
    if (hud.mode === 'title') input.update(); // gameplay scenes poll input themselves
    this.menu.update(dt);
    // touch overlay visibility
    const wantTouch = settings.touchEnabled === 'on' || (settings.touchEnabled === 'auto' && this.sawTouch && input.lastDevice === 'touch');
    if (wantTouch !== this.touch.visible) this.touch.setVisible(wantTouch && (inGame || this.touch.editing));
    if (!inGame && this.touch.visible && !this.touch.editing) this.touch.setVisible(false);
    this.touch.update();
    this.vignette.setDisplaySize(W, H).setVisible(inGame && settings.quality !== 'low');

    // hearts + item
    const showHud = inGame && !this.menu.open;
    for (let i = 0; i < this.hearts.length; i++) this.hearts[i].setVisible(showHud && i < p.maxHp).setFrame(i < p.hp ? 'heart' : 'heart_empty');
    const ground = showHud && hud.mode === 'ground';
    this.itemBox.setVisible(ground); this.itemIcon.setVisible(ground); this.itemCount.setVisible(ground);
    if (this.dirty && ground) { this.itemIcon.setFrame(p.selected); this.itemCount.setText(`x${p.items[p.selected] ?? 0}`); this.dirty = false; }
    // stamina / hull
    const flying = showHud && (hud.mode === 'flight' || hud.mode === 'oceanFlight'), boat = showHud && hud.mode === 'boat';
    this.stam.objs.forEach((o) => (o as Phaser.GameObjects.Rectangle).setVisible(flying || boat)); this.stamIcon.setVisible(flying || boat).setFrame(boat ? 'boat' : 'stamina').setY(ground ? 56 : 30);
    this.stam.objs.forEach((o) => (o as Phaser.GameObjects.Rectangle).setY((ground ? 54 : 28) + (o === this.stam.objs[0] ? 0 : 1)));
    if (flying) this.stam.set(hud.stamina / Math.max(1, hud.staminaMax)); else if (boat) this.stam.set(hud.boatHp / 100);
    // prompt
    const text = showHud && !hud.dialog ? hud.prompt : null;
    this.prompt.setVisible(!!text); this.promptBg.setVisible(!!text);
    const py = H - (this.touch.visible ? 132 : 30);
    if (text) { this.prompt.setText(this.label(hud.promptAction) + text).setPosition(Math.round(W / 2), py); this.promptBg.setPosition(Math.round(W / 2), py - 1).setSize(this.prompt.width + 12, 16); }
    const holding = showHud && hud.bondHold > 0.02;
    this.holdBar.objs.forEach((o, i) => (o as Phaser.GameObjects.Rectangle).setVisible(holding).setPosition(W / 2 - 40 + (i ? 1 : 0), py + 18 + (i ? 1 : 0)));
    if (holding) this.holdBar.set(hud.bondHold);
    // focused dragon
    const r = showHud && hud.focusId ? game.save.dragons[hud.focusId] : null;
    this.dPanel.setVisible(!!r).setX(Math.round(W / 2 - 75));
    if (r) {
      const ph = game.phenotype(r), known = r.bonded || r.observed > 0.25;
      this.dName.setText(known ? r.name : '???').setTint(r.bonded ? COL.teal : COL.text);
      this.dInfo.setText(r.trapped ? 'Preso numa rede!' : r.observed < 0.12 && !r.bonded ? 'Observe em silêncio…' : `${STAGE_LABEL[bondStage(r)]}${r.hunger > 0.65 ? ' · faminto' : ''}${r.injured ? ' · ferido' : ''}`);
      this.dEl.setFrame('el_' + ph.element); this.dTrust.set(r.trust / 100); this.dFear.set(r.fear / 100);
    }
    // toasts
    let ty = (r ? 50 : 8) + (this.title ? 58 : 0);
    for (let i = this.toasts.length - 1; i >= 0; i--) { const t = this.toasts[i]; t.t -= dt; if (t.t <= 0) { t.c.destroy(); this.toasts.splice(i, 1); } }
    for (const t of this.toasts) { t.c.setVisible(!this.menu.open).setPosition(Math.round(W / 2 - (t.c.getData('w') as number) / 2 + 5), ty).setAlpha(Math.min(1, t.t * 2)); ty += t.c.getData('h') as number; }
    this.fps.setVisible(settings.showFps).setText(settings.showFps ? `${Math.round(hud.fps)} fps · ${hud.entities} ent · ${hud.fxCount} fx` : '').setPosition(4, H - 14);
    this.compass.setVisible(showHud && !!hud.compass);
    if (hud.compass) this.compass.setText(hud.compass.label).setPosition(Math.round(W / 2), 6 + (r ? 44 : 0));
  }
}
