import Phaser from 'phaser';
import { mix } from '../art/Pix';
import { THEMES, type BiomeId } from '../art/themes';
import { DEPTH, GAME_H } from '../core/constants';

/** Parallax sky / clouds / far islands / mid silhouettes, fixed to the camera. */
export class Backdrop {
  private sky: Phaser.GameObjects.Image; private clouds: Phaser.GameObjects.TileSprite; private far: Phaser.GameObjects.TileSprite; private mid: Phaser.GameObjects.TileSprite;
  private fill: Phaser.GameObjects.Rectangle; private t = 0; private baseFill: number;
  constructor(private scene: Phaser.Scene, biome: BiomeId, private seaY: number) {
    const W = scene.scale.width, th = THEMES[biome];
    this.sky = scene.add.image(0, 0, `${biome}_sky`).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.sky);
    this.clouds = scene.add.tileSprite(0, 6, W, 96, `${biome}_clouds`).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.sky + 1);
    this.far = scene.add.tileSprite(0, 0, W, 160, `${biome}_far`).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.far);
    this.mid = scene.add.tileSprite(0, 0, W, 200, `${biome}_mid`).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.mid);
    this.baseFill = mix(th.mid, 0x000000, 0.18);
    this.fill = scene.add.rectangle(0, 0, W, GAME_H, this.baseFill).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.mid - 1);
  }
  update(dt: number, cam: Phaser.Cameras.Scene2D.Camera, tint: number): void {
    const W = this.scene.scale.width, z = cam.zoom;
    this.t += dt;
    const seaScreen = this.seaY - (cam.scrollY + (GAME_H * (1 - 1 / z)) / 2), ref = GAME_H * 0.62;
    this.sky.setDisplaySize(W, GAME_H).setTint(tint);
    this.clouds.setSize(W, 96).setTint(tint); this.clouds.tilePositionX = cam.scrollX * 0.04 + this.t * 3;
    this.clouds.y = 6 + Phaser.Math.Clamp((seaScreen - ref) * 0.05, -20, 30);
    this.far.setSize(W, 160).setTint(tint); this.far.tilePositionX = cam.scrollX * 0.1;
    this.far.y = Math.round(ref - 110 + Phaser.Math.Clamp((seaScreen - ref) * 0.22, -70, 200));
    this.mid.setSize(W, 200).setTint(tint); this.mid.tilePositionX = cam.scrollX * 0.28;
    this.mid.y = Math.round(ref - 96 + Phaser.Math.Clamp((seaScreen - ref) * 0.45, -120, 320));
    this.fill.setSize(W, GAME_H).setPosition(0, this.mid.y + 198).setFillStyle(mulColor(this.baseFill, tint));
  }
}
export function mulColor(a: number, b: number): number {
  return ((((a >> 16) & 255) * ((b >> 16) & 255)) / 255 << 16) | ((((a >> 8) & 255) * ((b >> 8) & 255)) / 255 << 8) | (((a & 255) * (b & 255)) / 255);
}
