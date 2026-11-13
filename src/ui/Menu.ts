import Phaser from 'phaser';
import { audio } from '../audio/AudioManager';
import { events } from '../core/events';
import { hud } from '../core/hud';
import { saveSettings, settings, type Quality } from '../core/settings';
import { VERSION } from '../core/constants';
import { ITEM_NAMES, USABLE, game } from '../core/state';
import { STAGE_LABEL, bondStage, type DragonRecord } from '../dragons/DragonRecord';
import { SPECIES } from '../dragons/genetics/species';
import { TRAITS, type Trait } from '../dragons/genetics/types';
import { DragonTextures } from '../dragons/rendering/DragonTextures';
import { ACTIONS, ACTION_LABELS, findConflicts, keyLabel, padBindLabel, rebindKey, rebindPad, type Action } from '../input/actions';
import { input } from '../input/InputManager';
import { SaveManager } from '../save/SaveManager';
import { OCEAN_H, OCEAN_W, allSites } from '../world/generation/archipelago';
import type { ItemId } from '../world/islands/types';
import { COL, LINE, panel, txt, wrap } from './kit';
import type { TouchControls } from './TouchControls';

interface Row { label: string; value?: string; icon?: string; tint?: number; select?: () => void; adjust?: (dir: number) => void; hint?: string }
const TABS = [['inv', 'Itens'], ['dragons', 'Dragões'], ['map', 'Mapa'], ['options', 'Opções'], ['controls', 'Controles'], ['system', 'Sistema']] as const;
type TabId = (typeof TABS)[number][0];

const ITEM_DESC: Record<ItemId, string> = {
  berry: 'Doces e comuns. Muitos dragões de floresta e de enseada adoram. Cura 1 coração.', fish: 'Fresco. O favorito de dragões costeiros e das tempestades. Cura 1 coração.',
  meat: 'Carne de caça. Dragões de fogo e de caverna costumam aceitar. Cura 1 coração.', herb: 'Erva curativa. Cura 2 corações — e fecha os ferimentos de um dragão.',
  shroom: 'Cogumelo que brilha no escuro. Iguaria para dragões de caverna.', ember: 'Cristal quente como brasa. Petisco dos Cinzais. Não coma.',
  shell: 'Concha que reluz ao sol. Dragões curiosos ou brincalhões não resistem. Use para mostrar.', relic: 'Fragmento dos antigos Vinculados. Dizem que, reunidos, contam uma história.',
};
const TRAIT_WORDS: Record<Trait, [string, string]> = {
  courage: ['Medroso', 'Corajoso'], curiosity: ['Indiferente', 'Curioso'], aggression: ['Manso', 'Agressivo'], intelligence: ['Instintivo', 'Esperto'], sociability: ['Solitário', 'Sociável'],
  independence: ['Dependente', 'Independente'], territoriality: ['Andarilho', 'Territorial'], loyalty: ['Volúvel', 'Leal'], sensitivity: ['Imperturbável', 'Sensível'], protectiveness: ['Desapegado', 'Protetor'],
};
const FEAR_WORDS = { fire: 'fogo', water: 'água', storm: 'tempestades', noise: 'barulho', suddenMove: 'movimentos bruscos', darkness: 'escuro', crowding: 'ser cercado' };
const LIKE_WORDS = { shiny: 'coisas brilhantes', music: 'assobios', petting: 'carinho', play: 'brincar', quiet: 'silêncio', warmth: 'calor' };
const ELEM = { fire: 'Fogo', water: 'Água', nature: 'Natureza', storm: 'Tempestade', earth: 'Terra', ice: 'Gelo' };

/** Pause menu overlay: inventory, dragon registry, map, options, control remapping, saves. */
export class Menu {
  open = false;
  private root: Phaser.GameObjects.Container;
  private tab: TabId = 'inv'; private idx = -1; private rows: Row[] = []; private scroll = 0;
  private skip = false; private repeat = 0; private capture: string | null = null; private dragonIdx = 0; private status = '';
  private hit: { x: number; y: number; w: number; h: number; fn: () => void }[] = [];

  constructor(private scene: Phaser.Scene, private touch: TouchControls, private onTitle: () => void) {
    this.root = scene.add.container(0, 0).setDepth(800).setVisible(false);
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.open || this.touch.editing) return;
      for (const h of this.hit) if (p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h) { h.fn(); return; }
    });
    scene.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => { if (this.open) { this.idx = Phaser.Math.Clamp(this.idx + Math.sign(dy), 0, this.rows.length - 1); this.draw(); } });
  }

  show(tab?: string): void {
    this.open = true; hud.inMenu = true; this.status = ''; this.skip = true;
    if (tab && TABS.some((t) => t[0] === tab)) this.tab = tab as TabId;
    this.idx = -1; this.scroll = 0; this.root.setVisible(true); audio.play('ui'); this.draw();
  }
  hide(): void {
    if (this.touch.editing) { this.touch.editing = false; }
    input.cancelCapture(); this.capture = null;
    this.open = false; hud.inMenu = false; this.root.setVisible(false); audio.play('uiBack'); saveSettings(); input.save();
  }

  private setTab(t: TabId): void { this.tab = t; this.idx = -1; this.scroll = 0; this.status = ''; audio.play('ui'); this.draw(); }

  // ── tab contents ─────────────────────────────────────────────────────────
  private buildRows(): Row[] {
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    const vol = (k: 'master' | 'music' | 'sfx' | 'ambience' | 'voices', label: string): Row => ({ label, value: pct(settings[k]), adjust: (d) => { settings[k] = Phaser.Math.Clamp(Math.round((settings[k] + d * 0.1) * 10) / 10, 0, 1); saveSettings(); audio.play('ui'); } });
    switch (this.tab) {
      case 'inv': return (Object.keys(ITEM_NAMES) as ItemId[]).filter((i) => (game.save.player.items[i] ?? 0) > 0 || i === game.save.player.selected).map((i) => ({
        label: ITEM_NAMES[i], value: `x${game.save.player.items[i] ?? 0}`, icon: i, tint: i === game.save.player.selected ? COL.gold : COL.text, hint: ITEM_DESC[i],
        select: USABLE.includes(i) ? () => { game.save.player.selected = i; events.emit('hudDirty'); audio.play('ui'); } : undefined }));
      case 'dragons': return this.known().map((r, i) => ({ label: r.met && (r.observed > 0.25 || r.bonded) ? r.name : '???', value: STAGE_LABEL[bondStage(r)], icon: 'el_' + SPECIES[r.genes.species].element, tint: r.genes.id === game.save.companion ? COL.gold : r.bonded ? COL.teal : COL.text,
        select: () => { this.dragonIdx = i; if (r.bonded && game.save.companion !== r.genes.id) { game.save.companion = r.genes.id; r.follow = true; this.status = `${r.name} agora é seu companheiro.`; audio.play('bond', 0.4); } } }));
      case 'map': return [];
      case 'options': return [
        vol('master', 'Volume geral'), vol('music', 'Música'), vol('sfx', 'Efeitos'), vol('ambience', 'Ambiente'), vol('voices', 'Vozes dos dragões'),
        { label: 'Qualidade gráfica', value: { low: 'Baixa', medium: 'Média', high: 'Alta' }[settings.quality], adjust: (d) => { const q: Quality[] = ['low', 'medium', 'high']; settings.quality = q[(q.indexOf(settings.quality) + d + 3) % 3]; saveSettings(); } },
        { label: 'Partículas', value: pct(settings.particles), adjust: (d) => { settings.particles = Phaser.Math.Clamp(Math.round((settings.particles + d * 0.25) * 4) / 4, 0.25, 1); saveSettings(); } },
        { label: 'Limite de FPS', value: `${settings.fpsCap}`, adjust: () => { settings.fpsCap = settings.fpsCap === 60 ? 30 : 60; this.scene.game.loop.setFPSLimit(settings.fpsCap); saveSettings(); } },
        { label: 'Mostrar FPS', value: settings.showFps ? 'Sim' : 'Não', adjust: () => { settings.showFps = !settings.showFps; saveSettings(); } },
        { label: 'Tremor de tela', value: pct(settings.screenShake), adjust: (d) => { settings.screenShake = Phaser.Math.Clamp(Math.round((settings.screenShake + d * 0.5) * 2) / 2, 0, 1); saveSettings(); } },
        { label: 'Controles na tela', value: { auto: 'Automático', on: 'Sempre', off: 'Nunca' }[settings.touchEnabled], adjust: (d) => { const o = ['auto', 'on', 'off'] as const; settings.touchEnabled = o[(o.indexOf(settings.touchEnabled) + d + 3) % 3]; saveSettings(); } },
        { label: 'Tamanho dos botões', value: pct(settings.touchScale), adjust: (d) => { settings.touchScale = Phaser.Math.Clamp(Math.round((settings.touchScale + d * 0.1) * 10) / 10, 0.7, 1.5); this.touch.layout(); saveSettings(); } },
        { label: 'Opacidade dos botões', value: pct(settings.touchOpacity), adjust: (d) => { settings.touchOpacity = Phaser.Math.Clamp(Math.round((settings.touchOpacity + d * 0.1) * 10) / 10, 0.2, 1); saveSettings(); } },
        { label: 'Mover botões na tela', value: '>', select: () => { this.touch.editing = true; this.touch.setVisible(true); this.status = 'Arraste os botões. Toque em Concluir para salvar.'; } },
        { label: 'Restaurar posição dos botões', select: () => { this.touch.resetLayout(); this.status = 'Posições restauradas.'; } },
        { label: 'Tela cheia', value: this.scene.scale.isFullscreen ? 'Sim' : 'Não', select: () => { if (this.scene.scale.isFullscreen) this.scene.scale.stopFullscreen(); else this.scene.scale.startFullscreen(); } },
      ];
      case 'controls': {
        const pad = input.lastDevice === 'gamepad';
        const rows: Row[] = ACTIONS.map((a) => ({ label: ACTION_LABELS[a], value: `${keyLabel(input.bindings.keys[a][0])}${input.bindings.keys[a][1] ? ' / ' + keyLabel(input.bindings.keys[a][1]) : ''}   |   ${padBindLabel(input.bindings.pad[a][0], input.padKind)}`,
          tint: this.capture === a ? COL.gold : COL.text, select: () => this.startCapture(a, pad) }));
        rows.push({ label: 'Zona morta do analógico', value: `${Math.round(input.bindings.deadzone * 100)}%`, adjust: (d) => { input.bindings.deadzone = Phaser.Math.Clamp(Math.round((input.bindings.deadzone + d * 0.02) * 100) / 100, 0.05, 0.6); input.save(); } },
          { label: 'Sensibilidade do analógico', value: `${Math.round(input.bindings.sensitivity * 100)}%`, adjust: (d) => { input.bindings.sensitivity = Phaser.Math.Clamp(Math.round((input.bindings.sensitivity + d * 0.1) * 10) / 10, 0.5, 2); input.save(); } },
          { label: 'Inverter eixo vertical no voo', value: input.bindings.invertFlightY ? 'Sim' : 'Não', adjust: () => { input.bindings.invertFlightY = !input.bindings.invertFlightY; input.save(); } },
          { label: 'Restaurar controles padrão', select: () => { input.resetDefaults(); this.status = 'Controles restaurados.'; } });
        return rows;
      }
      case 'system': return [
        { label: 'Continuar', select: () => this.hide() },
        { label: `Dragonbound ${VERSION} (beta)`, value: 'em desenvolvimento' },
        { label: 'Salvar agora', select: () => { game.persist().then(() => { this.status = 'Jogo salvo.'; this.draw(); }).catch((e: Error) => { this.status = e.message; this.draw(); }); } },
        { label: 'Exportar save (arquivo)', select: () => { SaveManager.download(game.save); this.status = 'Arquivo de save gerado.'; } },
        { label: 'Importar save (arquivo)', select: () => { SaveManager.pickFile().then(async (s) => { game.loadFrom(s); await game.persist(); this.hide(); this.onTitle(); }).catch((e: Error) => { this.status = 'Falha ao importar: ' + e.message; this.draw(); }); } },
        { label: 'Voltar ao menu principal', select: () => { void game.persist().catch(() => undefined); this.hide(); this.onTitle(); } },
      ];
    }
  }
  private known(): DragonRecord[] { return Object.values(game.save.dragons).filter((r) => r.met || r.bonded).sort((a, b) => Number(b.bonded) - Number(a.bonded) || b.trust - a.trust); }

  private startCapture(a: Action, pad: boolean): void {
    this.capture = a; this.status = pad ? 'Pressione um botão ou mova um eixo do controle…' : 'Pressione uma tecla… (Esc cancela)';
    const done = (): void => { this.capture = null; input.save(); const c = findConflicts(input.bindings); this.status = c.length ? `Conflito: ${c[0].actions.map((x) => ACTION_LABELS[x]).join(' e ')}` : 'Controle atualizado.'; audio.play('pickup'); this.draw(); };
    if (pad) input.captureNextPad((b) => { input.bindings = rebindPad(input.bindings, a, b); done(); });
    else input.captureNextKey((code) => { if (code !== 'Escape') input.bindings = rebindKey(input.bindings, a, 0, code); done(); });
  }

  // ── input ───────────────────────────────────────────────────────────────
  update(dt: number): void {
    if (!this.open) return;
    if (this.touch.editing || this.capture) return;
    if (this.skip) { this.skip = false; return; } // the press that opened the menu must not also close it
    const inp = input; this.repeat -= dt;
    const nav = (a: Action): boolean => inp.pressed(a) || (inp.down(a) && this.repeat <= 0);
    let dirty = false;
    if (inp.pressed('pause') || inp.pressed('dash')) { this.hide(); return; }
    if (nav('down')) { this.idx = Math.min(this.rows.length - 1, this.idx + 1); this.repeat = inp.pressed('down') ? 0.3 : 0.09; dirty = true; }
    else if (nav('up')) { this.idx = Math.max(-1, this.idx - 1); this.repeat = inp.pressed('up') ? 0.3 : 0.09; dirty = true; }
    else if (nav('left') || nav('right')) {
      const d = inp.down('right') ? 1 : -1; this.repeat = inp.pressed('left') || inp.pressed('right') ? 0.3 : 0.12;
      if (this.idx < 0 || !this.rows[this.idx]?.adjust) { if (this.idx < 0 || this.tab === 'map' || this.tab === 'inv' || this.tab === 'dragons' || this.tab === 'system') { const k = TABS.findIndex((t) => t[0] === this.tab); this.setTab(TABS[(k + d + TABS.length) % TABS.length][0]); return; } }
      else { this.rows[this.idx].adjust!(d); dirty = true; }
    } else if (inp.pressed('jump') || inp.pressed('interact') || inp.pressed('attack')) {
      const r = this.rows[this.idx];
      if (r?.select) { r.select(); dirty = true; } else if (r?.adjust) { r.adjust(1); dirty = true; }
    }
    if (this.tab === 'dragons' && this.idx >= 0 && this.dragonIdx !== this.idx) { this.dragonIdx = this.idx; dirty = true; }
    if (dirty && this.open) { if (!this.capture) audio.play('ui', 0.5); this.draw(); }
  }

  // ── rendering ───────────────────────────────────────────────────────────
  draw(): void {
    const sc = this.scene, W = sc.scale.width, H = sc.scale.height;
    this.root.removeAll(true); this.hit = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.root.add(o); return o; };
    add(sc.add.rectangle(0, 0, W, H, 0x06040c, 0.72).setOrigin(0));
    if (this.touch.editing) {
      add(txt(sc, W / 2, 30, 'Arraste os botões para onde preferir', COL.gold).setOrigin(0.5, 0));
      const b = add(panel(sc, W / 2 - 40, H / 2 - 12, 80, 24, 'btn_focus')); void b;
      add(txt(sc, W / 2, H / 2 - 7, 'Concluir').setOrigin(0.5, 0));
      this.hit.push({ x: W / 2 - 40, y: H / 2 - 12, w: 80, h: 24, fn: () => { this.touch.editing = false; saveSettings(); this.status = 'Posições salvas.'; this.draw(); } });
      // while editing, taps go to the widgets; only the button above is live
      const prev = this.hit[0];
      sc.input.once('pointerdown', (p: Phaser.Input.Pointer) => { if (p.x >= prev.x && p.x < prev.x + prev.w && p.y >= prev.y && p.y < prev.y + prev.h) prev.fn(); else this.draw(); });
      return;
    }
    const mx = Math.max(8, Math.round((W - 420) / 2)), pw = W - mx * 2, top = 8;
    add(panel(sc, mx, top + 18, pw, H - top - 30));
    // tabs
    const tw = Math.floor(pw / TABS.length);
    TABS.forEach(([id, label], i) => {
      const x = mx + i * tw, on = id === this.tab;
      add(panel(sc, x, top, tw - 1, 20, on ? (this.idx < 0 ? 'btn_focus' : 'btn') : 'panel_light'));
      add(txt(sc, x + tw / 2, top + 3, label, on ? COL.text : COL.dim).setOrigin(0.5, 0));
      this.hit.push({ x, y: top, w: tw, h: 20, fn: () => this.setTab(id) });
    });
    this.rows = this.buildRows();
    this.idx = Math.min(this.idx, this.rows.length - 1);
    const listX = mx + 8, listY = top + 26, listH = H - top - 30 - 30, vis = Math.floor(listH / LINE);
    const split = this.tab === 'inv' || this.tab === 'dragons';
    const listW = split ? Math.floor(pw * 0.38) : pw - 16;
    if (this.idx >= 0) { if (this.idx < this.scroll) this.scroll = this.idx; if (this.idx >= this.scroll + vis) this.scroll = this.idx - vis + 1; }
    this.scroll = Phaser.Math.Clamp(this.scroll, 0, Math.max(0, this.rows.length - vis));
    for (let k = 0; k < vis && k + this.scroll < this.rows.length; k++) {
      const i = k + this.scroll, r = this.rows[i], y = listY + k * LINE, on = i === this.idx;
      if (on) add(sc.add.rectangle(listX - 3, y + 1, listW + 6, LINE, 0xb8552e, 0.85).setOrigin(0));
      let x = listX;
      if (r.icon) { add(sc.add.image(x + 5, y + 7, 'ui', r.icon).setScale(0.62)); x += 13; }
      add(txt(sc, x, y - 2, r.label, on ? 0xffffff : r.tint ?? COL.text));
      if (r.value) add(txt(sc, listX + listW, y - 2, (r.adjust && on ? '< ' : '') + r.value + (r.adjust && on ? ' >' : ''), on ? COL.gold : COL.dim).setOrigin(1, 0));
      this.hit.push({ x: listX - 3, y, w: listW + 6, h: LINE, fn: () => {
        if (this.idx !== i) { this.idx = i; if (this.tab === 'dragons') this.dragonIdx = i; if (!r.adjust) r.select?.(); audio.play('ui', 0.5); }
        else if (r.adjust) r.adjust(sc.input.activePointer.x > listX + listW * 0.8 ? 1 : sc.input.activePointer.x > listX + listW * 0.55 ? -1 : 1); else r.select?.();
        if (this.open) this.draw();
      } });
    }
    if (this.rows.length > vis) add(txt(sc, listX + listW / 2, listY + vis * LINE - 3, this.scroll + vis < this.rows.length ? '...' : '', COL.dim).setOrigin(0.5, 0));
    const rx = listX + listW + 12, rw = pw - listW - 30;
    if (this.tab === 'inv') {
      const r = this.rows[Math.max(0, this.idx)];
      if (r?.hint) add(txt(sc, rx, listY, wrap(sc, r.hint, rw), COL.text));
      add(txt(sc, rx, H - 62, wrap(sc, `Fragmentos antigos: ${game.save.stats.relics}   Vínculos: ${game.save.stats.bonded}   Voos: ${game.save.stats.flights}   Dia ${Math.floor(game.day) + 1}`, rw), COL.dim));
      if (!this.rows.length) add(txt(sc, listX, listY, 'Mochila vazia.', COL.dim));
    } else if (this.tab === 'dragons') this.drawDragon(add, rx, listY, rw);
    else if (this.tab === 'map') this.drawMap(add, mx + 8, top + 24, pw - 16, H - top - 30 - 26);
    add(txt(sc, mx + 8, H - 24, this.status || this.helpLine(), this.status ? COL.gold : COL.dim));
  }

  private helpLine(): string {
    if (input.lastDevice === 'touch') return 'Toque para escolher  ·  toque de novo para alterar';
    return this.tab === 'controls' ? 'Confirmar: remapear (teclado ou controle, conforme o último usado)' : 'Setas: navegar/ajustar  ·  Pular: confirmar  ·  Dash/Pausa: voltar';
  }

  private drawDragon(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, x: number, y: number, w: number): void {
    const sc = this.scene, list = this.known(), r = list[Math.min(this.dragonIdx, list.length - 1)];
    if (!r) { add(txt(sc, x - w * 0.4, y, wrap(sc, 'Nenhum dragão registrado ainda. Observe-os em silêncio para aprender sobre cada um.', w * 1.3), COL.dim)); return; }
    const ph = game.phenotype(r), sp = SPECIES[r.genes.species], know = r.bonded ? 1 : r.observed;
    const key = DragonTextures.ensure(sc, r);
    add(sc.add.image(x + w - 46, y + 30, key, 'idle_0').setScale(0.8));
    const L: [string, number][] = [];
    L.push([know > 0.25 ? r.name : '???', COL.gold]);
    L.push([`${sp.name} · ${ELEM[sp.element]}`, COL.text]);
    const st = game.stage(r);
    L.push([`${{ egg: 'Ovo', hatchling: 'Filhote', juvenile: 'Jovem', adult: 'Adulto' }[st]}, ${r.genes.sex === 'f' ? 'fêmea' : 'macho'}`, COL.dim]);
    L.push([`Linhagem ${r.genes.lineage.line}, geração ${r.genes.lineage.generation}`, COL.dim]);
    L.push([`Vínculo: ${STAGE_LABEL[bondStage(r)]}  (${Math.round(r.trust)}%)`, COL.teal]);
    if (r.bonded) L.push([`Treino ${Math.round(r.training)}%  ·  ${game.canRide(r) ? 'pode ser montado' : ph.rideable ? 'ainda não montável' : 'porte pequeno'}`, COL.text]);
    if (know > 0.3) { const tr = TRAITS.map((t) => [t, ph.personality[t] + (r.drift[t] ?? 0)] as const).sort((a, b) => Math.abs(b[1] - 0.5) - Math.abs(a[1] - 0.5)).slice(0, know > 0.7 ? 4 : 2); L.push([tr.map(([t, v]) => TRAIT_WORDS[t][v > 0.5 ? 1 : 0]).join(', '), COL.text]); }
    else L.push(['Temperamento: observe mais…', COL.dim]);
    if (know > 0.55 || r.memories.some((m) => m.kind === 'fed')) L.push([`Comida favorita: ${ITEM_NAMES[ph.favoriteFood]}`, COL.green]);
    if (know > 0.75) { if (ph.fears.length) L.push([`Teme: ${ph.fears.map((f) => FEAR_WORDS[f]).join(', ')}`, COL.red]); L.push([`Gosta de: ${ph.likes.map((l) => LIKE_WORDS[l]).join(', ')}`, COL.green]); }
    if (know > 0.4) L.push([`Voo ${ph.stats.flySpeed} · Força ${ph.stats.power} · Vida ${ph.stats.maxHp}`, COL.dim]);
    const last = r.memories[r.memories.length - 1];
    if (last) L.push([`Lembrança: ${{ fed: 'você o alimentou', fedDisliked: 'comida ruim', pet: 'um carinho', petTooSoon: 'um susto com sua mão', startled: 'você o assustou', hurtByHuman: 'foi ferido por humano', freed: 'você o libertou', healed: 'você o curou', respected: 'você respeitou seu território', played: 'brincaram juntos', observed: 'viu você de longe', calmed: 'seu gesto de calma', bonded: 'o dia do vínculo', noise: 'um barulho assustador', music: 'seu assobio', foughtTogether: 'lutaram juntos', flew: 'voaram juntos' }[last.kind]}`, COL.dim]);
    let yy = y;
    const maxY = sc.scale.height - 40;
    for (const [s, c] of L) { if (yy + LINE > maxY) break; const t = add(txt(sc, x, yy - 2, wrap(sc, s, w - (yy < y + 50 ? 78 : 0)), c)); yy += Math.max(LINE, t.height - 3); }
  }

  private drawMap(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, x: number, y: number, w: number, h: number): void {
    const sc = this.scene, k = Math.min(w / OCEAN_W, h / OCEAN_H), ox = x + (w - OCEAN_W * k) / 2, oy = y + (h - OCEAN_H * k) / 2;
    add(sc.add.rectangle(ox, oy, OCEAN_W * k, OCEAN_H * k, 0x1f5f8c).setOrigin(0));
    const g = add(sc.add.graphics());
    g.lineStyle(1, 0x2f7fa8, 0.6); for (let i = 1; i < 8; i++) g.lineBetween(ox + (i * OCEAN_W * k) / 8, oy, ox + (i * OCEAN_W * k) / 8, oy + OCEAN_H * k);
    for (let i = 1; i < 6; i++) g.lineBetween(ox, oy + (i * OCEAN_H * k) / 6, ox + OCEAN_W * k, oy + (i * OCEAN_H * k) / 6);
    const disc = game.save.ocean.discovered; let here: { x: number; y: number } | null = null;
    for (const s of allSites(game.save.worldSeed)) {
      const sx = ox + s.x * k, sy = oy + s.y * k, known = disc.includes(s.id);
      if (!known) continue;
      g.fillStyle(s.biome === 'tropical' ? 0x5fae3c : s.biome === 'volcanic' ? 0x8a3a3a : 0x7c8894, 1); g.fillEllipse(sx, sy, Math.max(5, s.r * k * 2.4), Math.max(4, s.r * k * 1.5));
      g.lineStyle(1, 0xe6cf8f, 1); g.strokeEllipse(sx, sy, Math.max(5, s.r * k * 2.4), Math.max(4, s.r * k * 1.5));
      if (s.main) add(txt(sc, sx, sy + 6, s.name, COL.text).setOrigin(0.5, 0));
      if (s.id === game.save.player.island && !game.save.ocean.atSea) here = { x: sx, y: sy };
    }
    if (game.save.ocean.atSea) here = { x: ox + game.save.ocean.x * k, y: oy + game.save.ocean.y * k };
    if (here) { const m = add(sc.add.image(here.x, here.y - 4, 'ocean', 'marker')); sc.tweens.add({ targets: m, y: m.y - 3, duration: 400, yoyo: true, repeat: -1 }); }
    add(txt(sc, ox + 4, oy + 2, `Ilhas descobertas: ${disc.length}`, COL.dim));
  }
}
