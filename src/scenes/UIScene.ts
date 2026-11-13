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
import { OCEAN_H, OCEAN_W, allSites } from '../world/generation/archipelago';
import { LANE_NAMES } from '../world/islands/lanes';
import { Menu } from '../ui/Menu';
import { Shop } from '../ui/Shop';
import { NAMES, tracked, type Talk } from '../story/story';
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
  touch!: TouchControls; menu!: Menu; shop!: Shop;
  private talk: { t: Talk; page: number; sel: number } | null = null; private talkFresh = false; private talkHit: { x: number; y: number; w: number; h: number; fn: () => void }[] = [];
  private qTitle!: Phaser.GameObjects.BitmapText; private qText!: Phaser.GameObjects.BitmapText; private qIcon!: Phaser.GameObjects.Image;
  private coinIcon!: Phaser.GameObjects.Image; private coinText!: Phaser.GameObjects.BitmapText;
  private bossName!: Phaser.GameObjects.BitmapText; private bossBar!: ReturnType<typeof bar>;
  private mm!: Phaser.GameObjects.Container; private mmImg!: Phaser.GameObjects.Image; private mmGfx!: Phaser.GameObjects.Graphics; private mmBg!: Phaser.GameObjects.NineSlice; private mmLabel!: Phaser.GameObjects.BitmapText;
  private laneGfx!: Phaser.GameObjects.Graphics; private laneLabel!: Phaser.GameObjects.BitmapText;
  private mmKind: string | null = null; private mmVer = -1; private mmDisc = -1;
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
    this.mm = this.add.container(0, 0).setDepth(600);
    this.mmBg = panel(this, 0, 0, 104, 74, 'panel'); this.mmImg = this.add.image(4, 4, 'ui', 'white').setOrigin(0); this.mmGfx = this.add.graphics(); this.mmLabel = txt(this, 52, 0, '', COL.dim).setOrigin(0.5, 0);
    this.laneGfx = this.add.graphics(); this.laneLabel = txt(this, 0, 0, '', COL.text);
    this.mm.add([this.mmBg, this.mmImg, this.mmGfx, this.mmLabel, this.laneGfx, this.laneLabel]);
    this.touch = new TouchControls(this);
    this.menu = new Menu(this, this.touch, () => this.toTitle());
    this.shop = new Shop(this);
    this.qIcon = this.add.image(12, 76, 'ui', 'scroll').setScale(0.7); this.qTitle = txt(this, 22, 69, '', COL.gold); this.qText = txt(this, 6, 81, '', COL.text);
    this.coinIcon = this.add.image(64, 34, 'ui', 'coin').setScale(0.7); this.coinText = txt(this, 72, 27, '');
    this.bossName = txt(this, 0, 0, '', 0xff9070).setOrigin(0.5, 0); this.bossBar = bar(this, null, 0, 0, 180, 0xe4533c);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      if (p.wasTouch) { this.sawTouch = true; input.lastDevice = 'touch'; }
      if (this.talk && !this.menu.open && !this.shop.open) { for (const h of this.talkHit) if (p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h) { h.fn(); return; } this.advanceTalk(); return; }
      if (!this.menu.open && p.x < 60 && p.y > 18 && p.y < 50 && hud.mode === 'ground') { game.cycleItem(1); audio.play('ui'); }
    });
    this.input.keyboard?.on('keydown', () => audio.unlock());

    const offs = [
      events.on('toast', (t) => this.toast(t.text, t.icon)), events.on('dialog', (d) => { if (d) this.openTalk({ speaker: '', lines: [d.text] }); else this.closeTalk(); }),
      events.on('talk', (t) => this.openTalk(t)), events.on('openShop', (o) => this.shop.show(o.who)), events.on('areaTitle', (t) => this.areaTitle(t.title, t.subtitle)),
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
    const W = this.scale.width, t = txt(this, icon ? 9 : 0, 0, wrap(this, text, Math.min(280, W - 240)));
    const c = this.add.container(0, 0).setDepth(700), w = t.width + (icon ? 9 : 0) + 10;
    c.add(this.add.rectangle(-5, -1, w, t.height + 5, 0x0c0e1a, 0.78).setOrigin(0)); c.add(t);
    if (icon) c.add(this.add.image(2, 7, 'ui', icon).setScale(0.6));
    c.setData('w', w); c.setData('h', t.height + 7);
    this.toasts.push({ c, t: 3.2 + text.length * 0.03 });
    if (this.toasts.length > 4) this.toasts.shift()!.c.destroy();
  }

  /** Conversation box: speaker name, pages of text, optional choices (and a market button for shopkeepers). */
  private openTalk(t: Talk): void {
    const choices = [...(t.choices ?? [])];
    if (t.shop) { const who = Object.entries(NAMES).find(([, n]) => n === t.speaker)?.[0]; if (who) choices.unshift({ label: 'Ver mercadorias', run: () => events.emit('openShop', { who }) }, { label: 'Até mais', run: () => undefined }); }
    this.talk = { t: { ...t, choices: choices.length ? choices : undefined }, page: 0, sel: 0 }; this.talkFresh = true;
    audio.play('ui'); this.drawTalk();
  }
  private closeTalk(): void { this.talk = null; hud.dialog = null; this.dialog?.destroy(); this.dialog = null; this.talkHit = []; }
  private advanceTalk(): void {
    const k = this.talk; if (!k) return;
    const last = k.page >= k.t.lines.length - 1;
    if (!last) { k.page++; audio.play('ui', 0.5); this.drawTalk(); return; }
    if (k.t.choices) { const c = k.t.choices[k.sel]; this.closeTalk(); audio.play('ui'); c.run(); return; }
    this.closeTalk(); audio.play('uiBack');
  }
  private drawTalk(): void {
    this.dialog?.destroy(); this.dialog = null; this.talkHit = [];
    const k = this.talk; if (!k) { hud.dialog = null; return; }
    const text = k.t.lines[k.page]; hud.dialog = text;
    const W = this.scale.width, H = this.scale.height, w = Math.min(380, W - 24), t = txt(this, 10, k.t.speaker ? 17 : 6, wrap(this, text, w - 20));
    const last = k.page >= k.t.lines.length - 1, ch = last ? k.t.choices ?? [] : [];
    const h = t.height + (k.t.speaker ? 30 : 22) + ch.length * 16, x0 = Math.round((W - w) / 2), y0 = H - h - (this.touch.visible ? 96 : 14);
    const c = this.add.container(x0, y0).setDepth(750);
    c.add([panel(this, 0, 0, w, h, 'panel'), t]);
    if (k.t.speaker) c.add(txt(this, 10, 3, k.t.speaker, COL.gold));
    ch.forEach((o, i) => {
      const cy = t.y + t.height + 2 + i * 16, on = i === k.sel;
      c.add(this.add.rectangle(8, cy, w - 16, 15, on ? 0xb8552e : 0x2c3554, 0.9).setOrigin(0)); c.add(txt(this, 14, cy, (on ? '> ' : '  ') + o.label, on ? 0xffffff : COL.text));
      this.talkHit.push({ x: x0 + 8, y: y0 + cy, w: w - 16, h: 15, fn: () => { if (this.talk) { this.talk.sel = i; this.advanceTalk(); } } });
    });
    if (!ch.length) c.add(txt(this, w - 8, h - 15, input.lastDevice === 'touch' ? 'toque' : `${this.label('interact')}${last ? 'fechar' : 'continuar'}`, COL.gold).setOrigin(1, 0));
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

  /** Corner minimap: archipelago at sea, terrain profile on an island. */
  private drawMinimap(show: boolean, W: number): void {
    const m = hud.minimap;
    this.mm.setVisible(show && !!m && !hud.dialog);
    if (!m || !show) return;
    const g = this.mmGfx; g.clear();
    if (m.kind === 'ocean') {
      const disc = game.save.ocean.discovered.length;
      if (this.mmKind !== 'ocean' || this.mmDisc !== disc) { this.paintOceanMap(); this.mmDisc = disc; this.mmKind = 'ocean'; this.mmImg.setTexture('mm-ocean'); }
      const k = 96 / OCEAN_W, px = 4 + m.x * k, py = 4 + m.y * k, a = m.a;
      g.fillStyle(m.flying ? 0x7fe8d0 : 0xffffff, 1).lineStyle(1, 0x0c0e1a, 1);
      g.fillTriangle(px + Math.cos(a) * 5, py + Math.sin(a) * 5, px + Math.cos(a + 2.4) * 3.5, py + Math.sin(a + 2.4) * 3.5, px + Math.cos(a - 2.4) * 3.5, py + Math.sin(a - 2.4) * 3.5);
      g.strokeTriangle(px + Math.cos(a) * 5, py + Math.sin(a) * 5, px + Math.cos(a + 2.4) * 3.5, py + Math.sin(a + 2.4) * 3.5, px + Math.cos(a - 2.4) * 3.5, py + Math.sin(a - 2.4) * 3.5);
      this.mmBg.setSize(104, 74); this.mmLabel.setText(''); this.laneGfx.clear(); this.laneLabel.setText('');
    } else {
      if (this.mmKind !== m.tex || this.mmVer !== hud.mmVersion) { this.mmKind = m.tex; this.mmVer = hud.mmVersion; if (this.textures.exists(m.tex)) this.mmImg.setTexture(m.tex); }
      const px = 4 + Phaser.Math.Clamp(m.fx, 0, 1) * 96, py = 4 + Phaser.Math.Clamp(m.fy, 0, 1) * 40;
      const blink = Math.floor(this.time.now / 300) % 2 === 0, rx = Math.round(px), ry = Math.round(py);
      g.fillStyle(0x0c0e1a, 1).fillRect(rx - 3, ry - 5, 7, 7).fillStyle(m.flying ? 0x7fe8d0 : 0xffe070, 1).fillRect(rx - 2, ry - 4, 5, 5);
      if (blink) g.lineStyle(1, 0xffffff, 0.9).strokeRect(rx - 4, ry - 6, 9, 9);
      g.fillStyle(0xf2c14e, 1).fillTriangle(px + m.facing * 6, py - 2, px + m.facing * 3, py - 4, px + m.facing * 3, py);
      this.mmBg.setSize(104, 48);
      this.mmLabel.setText('');
      // depth-lane widget: three planes in perspective (back = narrow, front = wide)
      const L = hud.lanes, lg = this.laneGfx; lg.clear();
      if (L) {
        const y0 = 52;
        this.mmBg.setSize(104, 84);
        L.depths.forEach((d, i) => {
          const w = 30 + i * 14, x = 52 - w / 2, y = y0 + i * 9, on = d === L.active;
          const reachable = (d === L.active - 1 && L.canBack) || (d === L.active + 1 && L.canFront);
          lg.fillStyle(on ? 0xf2c14e : reachable ? 0x3a4468 : 0x1d2238, 1).fillRect(x, y, w, 6);
          lg.lineStyle(1, on ? 0xffffff : reachable ? 0xd8dcef : 0x3a4468, 1).strokeRect(x, y, w, 6);
        });
        this.laneLabel.setText(LANE_NAMES[L.active] ?? '').setOrigin(0.5, 0).setPosition(52, y0 + 26);
      } else this.laneLabel.setText('');
    }
    const top = this.touch.visible ? 30 : 4;
    this.mm.setPosition(W - 108, top);
  }
  private paintOceanMap(): void {
    const k = 96 / OCEAN_W, w = 96, h = Math.round(OCEAN_H * k);
    if (this.textures.exists('mm-ocean')) this.textures.remove('mm-ocean');
    const t = this.textures.createCanvas('mm-ocean', w, h)!, c = t.context;
    const grd = c.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#1f5f8c'); grd.addColorStop(1, '#174a72'); c.fillStyle = grd; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 1; i < 6; i++) { c.fillRect(Math.round((i * w) / 6), 0, 1, h); c.fillRect(0, Math.round((i * h) / 4), w, 1); }
    const disc = game.save.ocean.discovered, col = { tropical: '#5fae3c', volcanic: '#c0503a', storm: '#8a9ab4' } as const;
    for (const s of allSites(game.save.worldSeed)) {
      const known = disc.includes(s.id);
      if (!known && !s.main) continue;
      c.globalAlpha = known ? 1 : 0.45; c.fillStyle = known ? col[s.biome] : '#c8d4e8';
      c.beginPath(); c.ellipse(s.x * k, s.y * k, Math.max(1.5, s.r * 1.25 * k), Math.max(1, s.r * 0.72 * k), 0, 0, Math.PI * 2); c.fill();
      if (known) { c.strokeStyle = '#e6cf8f'; c.lineWidth = 1; c.stroke(); }
      if (!known) { c.fillStyle = '#f4f0e6'; c.font = '7px monospace'; c.fillText('?', s.x * k - 2, s.y * k + 3); }
    }
    c.globalAlpha = 1; t.refresh();
  }

  override update(_t: number, delta: number): void {
    const dt = delta / 1000, W = this.scale.width, H = this.scale.height, p = game.save.player;
    const inGame = hud.mode !== 'title';
    if (hud.mode === 'title') input.update(); // gameplay scenes poll input themselves
    this.menu.update(dt); this.shop.update();
    if (this.talkFresh) this.talkFresh = false; // the press that opened the conversation must not also advance it
    else if (this.talk && !this.menu.open && !this.shop.open) {
      const ch = this.talk.page >= this.talk.t.lines.length - 1 ? this.talk.t.choices : undefined;
      if (ch && input.pressed('down')) { this.talk.sel = (this.talk.sel + 1) % ch.length; this.drawTalk(); }
      if (ch && input.pressed('up')) { this.talk.sel = (this.talk.sel + ch.length - 1) % ch.length; this.drawTalk(); }
      if (input.pressed('interact') || input.pressed('jump') || input.pressed('attack')) this.advanceTalk();
      else if (input.pressed('pause') || input.pressed('dash')) { this.closeTalk(); audio.play('uiBack'); }
    }
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
    this.drawMinimap(showHud, W);
    const tq = showHud && !hud.dialog ? tracked() : null;
    this.qIcon.setVisible(!!tq); this.qTitle.setVisible(!!tq); this.qText.setVisible(!!tq);
    if (tq) { const y0 = ground ? 66 : 44; this.qIcon.setY(y0 + 7); this.qTitle.setText(tq.def.title).setY(y0); this.qText.setText(wrap(this, tq.stage.text, Math.min(170, W * 0.38))).setY(y0 + 12); }
    this.coinIcon.setVisible(ground); this.coinText.setVisible(ground).setText(`${p.items.coin ?? 0}`);
    const bs = showHud ? hud.boss : null;
    this.bossName.setVisible(!!bs); this.bossBar.objs.forEach((o) => (o as Phaser.GameObjects.Rectangle).setVisible(!!bs));
    if (bs) { const by = H - (this.touch.visible ? 150 : 46); this.bossName.setText(bs.name).setPosition(Math.round(W / 2), by - 14); this.bossBar.objs.forEach((o, i) => (o as Phaser.GameObjects.Rectangle).setPosition(W / 2 - 90 + (i ? 1 : 0), by + (i ? 1 : 0))); this.bossBar.set(bs.hp / bs.max); }
    this.compass.setVisible(showHud && !!hud.compass);
    if (hud.compass) this.compass.setText(hud.compass.label).setPosition(Math.round(W / 2), 6 + (r ? 44 : 0));
  }
}
