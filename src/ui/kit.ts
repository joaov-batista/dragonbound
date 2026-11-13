import Phaser from 'phaser';

export const FONT = 'jersey', FS = 16, LINE = 13;
export const COL = { text: 0xf4f0e6, dim: 0x9aa4c4, gold: 0xf2c14e, teal: 0x7fe8d0, red: 0xff7060, dark: 0x0c0e1a, green: 0x8fe07a };

export function txt(scene: Phaser.Scene, x: number, y: number, s: string, tint: number = COL.text, shadow = true): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(Math.round(x), Math.round(y), FONT, s, FS).setTint(tint);
  if (shadow) t.setDropShadow(1, 1, 0x0c0e1a, 0.9);
  return t;
}
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, frame = 'panel'): Phaser.GameObjects.NineSlice {
  return scene.add.nineslice(Math.round(x), Math.round(y), 'ui', frame, Math.max(12, w), Math.max(12, h), 5, 5, 5, 5).setOrigin(0);
}
/** Horizontal bar; returns a setter for 0..1. */
export function bar(scene: Phaser.Scene, parent: Phaser.GameObjects.Container | null, x: number, y: number, w: number, color: number): { set(v: number): void; objs: Phaser.GameObjects.GameObject[] } {
  const bg = scene.add.rectangle(x, y, w, 5, 0x0c0e1a).setOrigin(0), mid = scene.add.rectangle(x + 1, y + 1, w - 2, 3, 0x2a2f48).setOrigin(0), fill = scene.add.rectangle(x + 1, y + 1, w - 2, 3, color).setOrigin(0);
  parent?.add([bg, mid, fill]);
  return { set: (v) => fill.setSize(Math.max(0, Math.min(1, v)) * (w - 2), 3), objs: [bg, mid, fill] };
}
/** Word-wrap for bitmap text (Jersey averages ~5px per glyph). */
export function wrap(scene: Phaser.Scene, s: string, maxW: number): string {
  const probe = scene.add.bitmapText(0, -100, FONT, '', FS), out: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    const test = line ? line + ' ' + word : word;
    probe.setText(test);
    if (probe.width > maxW && line) { out.push(line); line = word; } else line = test;
  }
  if (line) out.push(line);
  probe.destroy();
  return out.join('\n');
}
