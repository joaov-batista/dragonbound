import Phaser from 'phaser';
import { BIOMES } from '../art/themes';
import { Enemy } from '../entities/Enemy';
import { Player } from '../player/Player';
import { Npc } from '../entities/Npc';
import { VfxManager, type VfxManifest } from '../vfx/VfxManager';

/** Loads every atlas, shows a progress bar, registers animations, then opens the title. */
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload(): void {
    const W = this.scale.width, H = this.scale.height;
    this.cameras.main.setBackgroundColor(0x0c0e1a);
    const frame = this.add.rectangle(W / 2, H / 2 + 20, 162, 8, 0x2a2f48), fill = this.add.rectangle(W / 2 - 80, H / 2 + 20, 0, 4, 0x7fe8d0).setOrigin(0, 0.5);
    void frame;
    this.load.on('progress', (v: number) => fill.setSize(160 * v, 4));
    this.load.setPath('');
    for (const a of ['hero', 'props', 'enemies', 'ocean', 'ui', 'people']) this.load.atlas(a, `sprites/${a}.png`, `sprites/${a}.json`);
    for (const b of BIOMES) { this.load.image(b, `tilesets/${b}.png`); for (const l of ['sky', 'clouds', 'far', 'mid']) this.load.image(`${b}_${l}`, `tilesets/${b}_${l}.png`); }
    this.load.bitmapFont('jersey', 'fonts/jersey.png', 'fonts/jersey.xml');
    this.load.json('vfx-manifest', 'vfx/manifest.json');
    this.load.once('filecomplete-json-vfx-manifest', (_k: string, _t: string, data: VfxManifest) => VfxManager.preload(this, data));
  }
  create(): void {
    Player.createAnims(this); Npc.createAnims(this); Enemy.createAnims(this);
    VfxManager.createAnims(this, this.cache.json.get('vfx-manifest') as VfxManifest);
    document.getElementById('boot')?.remove();
    this.scene.launch('UI');
    this.scene.start('Title');
  }
}
