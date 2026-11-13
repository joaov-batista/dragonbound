import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { events } from '../core/events';
import { hud } from '../core/hud';
import { ITEM_NAMES, game } from '../core/state';
import { input } from '../input/InputManager';
import { BUYS, NAMES, PRICES, STOCK, buy, sell, sellPrice } from '../story/story';
import type { ItemId } from '../world/islands/types';
import { COL, LINE, panel, txt } from './kit';

/** Market stall: buy from the keeper's stock or sell what they want, for coins. */
export class Shop {
  open = false; private who = ''; private mode: 'buy' | 'sell' = 'buy'; private idx = 0; private msg = '';
  private root: Phaser.GameObjects.Container; private hit: { x: number; y: number; w: number; h: number; fn: () => void }[] = [];
  constructor(private scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(820).setVisible(false);
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!this.open) return; for (const h of this.hit) if (p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h) { h.fn(); return; } });
  }
  show(who: string): void { this.who = who; this.open = true; this.mode = 'buy'; this.idx = 0; this.msg = ''; hud.inMenu = true; this.root.setVisible(true); audio.play('ui'); this.draw(); }
  hide(): void { this.open = false; hud.inMenu = false; this.root.setVisible(false); audio.play('uiBack'); events.emit('hudDirty'); }
  private rows(): ItemId[] { return (this.mode === 'buy' ? STOCK[this.who] : BUYS[this.who]) ?? []; }
  private act(i: ItemId): void {
    const ok = this.mode === 'buy' ? buy(i) : sell(i);
    this.msg = ok ? (this.mode === 'buy' ? `Comprou 1 ${ITEM_NAMES[i]}` : `Vendeu 1 ${ITEM_NAMES[i]}`) : this.mode === 'buy' ? 'Moedas insuficientes.' : 'Você não tem isso.';
    audio.play(ok ? 'pickup' : 'deny'); this.draw();
  }
  update(): void {
    if (!this.open) return;
    if (input.pressed('pause') || input.pressed('dash')) { this.hide(); return; }
    const n = this.rows().length;
    if (input.pressed('down')) { this.idx = (this.idx + 1) % Math.max(1, n); this.draw(); }
    if (input.pressed('up')) { this.idx = (this.idx + n - 1) % Math.max(1, n); this.draw(); }
    if (input.pressed('left') || input.pressed('right')) { this.mode = this.mode === 'buy' ? 'sell' : 'buy'; this.idx = 0; audio.play('ui'); this.draw(); }
    if (input.pressed('jump') || input.pressed('interact') || input.pressed('attack')) { const r = this.rows()[this.idx]; if (r) this.act(r); }
  }
  draw(): void {
    const sc = this.scene, W = sc.scale.width, H = sc.scale.height, w = Math.min(300, W - 20), x = Math.round((W - w) / 2), y = 24, h = H - 48;
    this.root.removeAll(true); this.hit = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.root.add(o); return o; };
    add(sc.add.rectangle(0, 0, W, H, 0x06040c, 0.6).setOrigin(0)); add(panel(sc, x, y, w, h));
    add(txt(sc, x + 8, y + 4, NAMES[this.who] ?? this.who, COL.gold));
    add(sc.add.image(x + w - 46, y + 11, 'ui', 'coin').setScale(0.7)); add(txt(sc, x + w - 36, y + 4, `${game.save.player.items.coin ?? 0}`));
    (['buy', 'sell'] as const).forEach((m, i) => {
      const bx = x + 8 + i * 70, on = this.mode === m;
      add(panel(sc, bx, y + 20, 66, 18, on ? 'btn_focus' : 'btn')); add(txt(sc, bx + 33, y + 22, m === 'buy' ? 'Comprar' : 'Vender', on ? 0xffffff : COL.dim).setOrigin(0.5, 0));
      this.hit.push({ x: bx, y: y + 20, w: 66, h: 18, fn: () => { this.mode = m; this.idx = 0; this.draw(); } });
    });
    this.rows().forEach((it, i) => {
      const ry = y + 46 + i * (LINE + 3), on = i === this.idx, price = this.mode === 'buy' ? PRICES[it] ?? 0 : sellPrice(it);
      if (on) add(sc.add.rectangle(x + 5, ry, w - 10, LINE + 2, 0xb8552e, 0.85).setOrigin(0));
      add(sc.add.image(x + 14, ry + 7, 'ui', it).setScale(0.62));
      add(txt(sc, x + 24, ry - 1, `${ITEM_NAMES[it]}  (tem ${game.save.player.items[it] ?? 0})`, on ? 0xffffff : COL.text));
      add(txt(sc, x + w - 12, ry - 1, `${price}`, COL.gold).setOrigin(1, 0)); add(sc.add.image(x + w - 8 - txt(sc, -999, -999, `${price}`).width - 10, ry + 7, 'ui', 'coin').setScale(0.5));
      this.hit.push({ x: x + 5, y: ry, w: w - 10, h: LINE + 2, fn: () => { if (this.idx === i) this.act(it); else { this.idx = i; this.draw(); } } });
    });
    if (!this.rows().length) add(txt(sc, x + 10, y + 48, this.mode === 'buy' ? 'Nada à venda hoje.' : 'Não compro nada disso.', COL.dim));
    add(txt(sc, x + 8, y + h - 30, this.msg || (input.lastDevice === 'touch' ? 'Toque para escolher, toque de novo para negociar' : '←/→ comprar/vender · Pular: negociar · Dash: sair'), this.msg ? COL.gold : COL.dim));
    const cx = x + w - 52, cy = y + h - 16;
    add(panel(sc, cx, cy - 4, 44, 16, 'btn')); add(txt(sc, cx + 22, cy - 3, 'Sair').setOrigin(0.5, 0));
    this.hit.push({ x: cx, y: cy - 4, w: 44, h: 16, fn: () => this.hide() });
  }
}
