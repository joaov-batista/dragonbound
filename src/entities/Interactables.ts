import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { DEPTH } from '../core/constants';
import { events } from '../core/events';
import { ITEM_NAMES, game } from '../core/state';
import type { World } from '../core/world';
import type { IslandView } from '../world/IslandView';
import type { ItemId, Spawn } from '../world/islands/types';
import { flag, setFlag } from '../story/story';

export interface Interactable {
  kind: Spawn['t'] | 'npc'; id: string; x: number; y: number; range: number;
  prompt(): string | null; use(): void;
  /** Natural food for dragons? */
  food?: () => ItemId | null; eaten?: () => void;
  auto?: boolean; // collected on touch
  update?(dt: number): void;
}
export interface InteractCtx { world: World; view: IslandView; sail(): void; rest(x: number, y: number): void; nest(x: number, y: number): void }

/** Build the scene objects for every authored spawn that the player can use. */
export function buildInteractables(ctx: InteractCtx, spawns: Spawn[]): Interactable[] {
  const { world: w, view } = ctx, sc = w.scene, st = game.islandState(w.island.id), out: Interactable[] = [];
  const img = (key: string, x: number, y: number, depth: number = DEPTH.propsBack + 1): Phaser.GameObjects.Image => sc.add.image(x, y + 1, 'props', key).setOrigin(0.5, 1).setDepth(depth);
  for (const s of spawns) {
    switch (s.t) {
      case 'pickup': {
        if (st.taken.includes(s.id)) break;
        const relic = s.item === 'relic';
        const g = relic ? img('relic', s.x, s.y - 6, DEPTH.entities) : sc.add.image(s.x, s.y - 2, 'ui', s.item).setOrigin(0.5, 1).setDepth(DEPTH.entities);
        const glow = relic ? view.addLight(s.x, s.y - 12, 26, 0x60f0e0, 0.5) : null;
        sc.tweens.add({ targets: g, y: g.y - 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        let gone = false;
        out.push({ kind: 'pickup', id: s.id, x: s.x, y: s.y - 8, range: 14, auto: true, prompt: () => null,
          use: () => { if (gone) return; gone = true; st.taken.push(s.id); game.addItem(s.item); g.destroy(); glow?.destroy(); w.vfx.play('collect', s.x, s.y, { scale: 0.7 }); audio.play(relic ? 'chest' : 'pickup');
            if (s.secret) { setFlag(s.secret); const n = ['secret_cellar', 'secret_pier', 'secret_falls'].filter((k) => flag(k)).length; w.vfx.play('levelup', s.x, s.y, { scale: 0.7 }); events.emit('toast', { text: `Segredo de Vigiamar encontrado! (${n}/3)`, icon: 'star' }); }
            else if (relic) events.emit('toast', { text: `Fragmento antigo (${game.save.stats.relics})`, icon: s.item }); else w.vfx.floatText(s.x, s.y - 18, `+1 ${ITEM_NAMES[s.item]}`, 0xd8f0c0); },
          food: () => (gone || relic || s.item === 'shell' ? null : s.item), eaten: () => { if (!gone) { gone = true; g.destroy(); } } });
        break;
      }
      case 'bush': {
        const g = img('berrybush', s.x, s.y);
        const grown = (): boolean => (st.regrow[s.id] ?? 0) <= game.day;
        const sync = (): void => { g.setFrame(grown() ? 'berrybush' : 'berrybush_empty'); };
        sync();
        out.push({ kind: 'bush', id: s.id, x: s.x, y: s.y - 8, range: 22, prompt: () => (grown() ? 'Colher frutas' : null),
          use: () => { if (!grown()) return; st.regrow[s.id] = game.day + 0.35; sync(); game.addItem('berry', 2); audio.play('pickup'); w.vfx.puff(s.x, s.y - 10, 0x4f9a3c, 6); w.vfx.floatText(s.x, s.y - 22, '+2 Frutas', 0xd8f0c0); },
          food: () => (grown() ? 'berry' : null), eaten: () => { st.regrow[s.id] = game.day + 0.3; sync(); w.vfx.puff(s.x, s.y - 10, 0x4f9a3c, 5); }, update: () => { if (Math.random() < 0.01) sync(); } });
        break;
      }
      case 'fishspot': {
        const fx = w.vfx.play('ripples', s.x, s.y + 4, { loop: true, scale: 0.6, alpha: 0.8, depth: DEPTH.liquid + 2 });
        const ready = (): boolean => (st.regrow[s.id] ?? 0) <= game.day;
        out.push({ kind: 'fishspot', id: s.id, x: s.x, y: s.y, range: 36, prompt: () => (ready() ? 'Pescar' : null),
          use: () => { if (!ready()) return; st.regrow[s.id] = game.day + 0.12; game.addItem('fish'); audio.play('splash'); w.vfx.play('splash', s.x, s.y + 2, { scale: 0.6 }); w.vfx.floatText(s.x, s.y - 14, '+1 Peixe', 0xd8f0c0); },
          food: () => (ready() ? 'fish' : null), eaten: () => { st.regrow[s.id] = game.day + 0.1; w.vfx.play('splash', s.x, s.y + 2, { scale: 0.5 }); }, update: () => { fx?.setVisible(ready()); } });
        break;
      }
      case 'campfire': {
        img('campfire', s.x, s.y);
        w.vfx.play('campfire', s.x, s.y - 2, { loop: true, scale: 0.55, depth: DEPTH.propsBack + 2 });
        view.addLight(s.x, s.y - 14, 90, 0xffa040, 0.45);
        out.push({ kind: 'campfire', id: s.id, x: s.x, y: s.y - 8, range: 26, prompt: () => 'Descansar e salvar', use: () => ctx.rest(s.x, s.y) });
        break;
      }
      case 'torch': {
        img('brazier', s.x, s.y);
        w.vfx.play('torch', s.x, s.y - 14, { loop: true, scale: 0.5, depth: DEPTH.propsBack + 2 });
        view.addLight(s.x, s.y - 26, 60, 0xffa040, 0.4);
        break;
      }
      case 'chest': {
        const opened = st.taken.includes(s.id), g = img(opened ? 'chest_open' : 'chest', s.x, s.y);
        let open = opened;
        out.push({ kind: 'chest', id: s.id, x: s.x, y: s.y - 8, range: 24, prompt: () => (open ? null : 'Abrir baú'),
          use: () => { if (open) return; open = true; st.taken.push(s.id); g.setFrame('chest_open'); game.addItem(s.loot, s.n); audio.play('chest'); w.vfx.play('collect', s.x, s.y, {}); w.vfx.floatText(s.x, s.y - 24, `+${s.n} ${ITEM_NAMES[s.loot]}`, 0xf2c14e); } });
        break;
      }
      case 'sign': {
        img('sign', s.x, s.y);
        out.push({ kind: 'sign', id: 'sign' + s.x, x: s.x, y: s.y - 8, range: 22, prompt: () => 'Ler', use: () => { audio.play('ui'); events.emit('dialog', { text: s.text }); } });
        break;
      }
      case 'dock':
        out.push({ kind: 'dock', id: 'dock' + s.x, x: s.x, y: s.y - 4, range: 44, prompt: () => 'Zarpar de barco', use: () => ctx.sail() });
        break;
      case 'nest': {
        img('nest', s.x, s.y);
        out.push({ kind: 'nest', id: s.id, x: s.x, y: s.y - 6, range: 26, prompt: () => 'Examinar ninho', use: () => ctx.nest(s.x, s.y) });
        break;
      }
      case 'waterfall': {
        if (!sc.textures.exists('waterfall')) makeWaterfallTexture(sc);
        const ts = sc.add.tileSprite(s.x - 12, s.y, 26, s.h, 'waterfall').setOrigin(0, 0).setDepth(DEPTH.propsBack + 3).setAlpha(0.9);
        w.vfx.play('splash', s.x, s.y + s.h + 6, { loop: true, scale: 0.9, depth: DEPTH.liquid + 2 });
        out.push({ kind: 'waterfall', id: 'wf' + s.x, x: s.x, y: s.y, range: 0, prompt: () => null, use: () => undefined, update: (dt) => { ts.tilePositionY -= 130 * dt; } });
        break;
      }
      case 'vent': {
        const em = sc.add.particles(s.x, s.y - 4, 'ui', { frame: 'white', lifespan: 1800, speedY: { min: -70, max: -40 }, speedX: { min: -8, max: 8 }, scale: { start: 0.6, end: 2.2 }, alpha: { start: 0.5, end: 0 }, tint: [0x6a5a60, 0x4a3a44, 0xd06030], frequency: 130 }).setDepth(DEPTH.propsBack + 2);
        void em;
        break;
      }
      default: break;
    }
  }
  return out;
}

function makeWaterfallTexture(sc: Phaser.Scene): void {
  const t = sc.textures.createCanvas('waterfall', 26, 32)!, c = t.context;
  c.fillStyle = '#6fd0e8'; c.fillRect(0, 0, 26, 32);
  for (let x = 0; x < 26; x++) for (let y = 0; y < 32; y++) {
    const v = (Math.sin(x * 1.9) * 43758.5453 + y * (0.6 + (x % 3) * 0.2)) % 7;
    if (v > 5.2) { c.fillStyle = '#ffffff'; c.fillRect(x, y, 1, 2); } else if (v < 1.2) { c.fillStyle = '#3fa6c8'; c.fillRect(x, y, 1, 1); }
  }
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1, 32); c.fillRect(25, 0, 1, 32);
  t.refresh();
}
