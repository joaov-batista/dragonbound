export const DRAGON_FW = 120, DRAGON_FH = 88, DRAGON_COLS = 8;
/** Feet anchor inside a frame (origin for sprites). */
export const DRAGON_OX = 56, DRAGON_OY = 82;
export const DRAGON_ANIMS = {
  idle: { n: 4, fps: 5, loop: true },
  walk: { n: 6, fps: 10, loop: true },
  fly: { n: 6, fps: 12, loop: true },
  sleep: { n: 2, fps: 1.2, loop: true },
  eat: { n: 3, fps: 6, loop: true },
  attack: { n: 3, fps: 10, loop: false },
  hurt: { n: 1, fps: 1, loop: false },
  play: { n: 4, fps: 8, loop: true },
  alert: { n: 2, fps: 3, loop: true },
  nuzzle: { n: 2, fps: 3, loop: true },
} as const;
export type DragonAnim = keyof typeof DRAGON_ANIMS;
export const DRAGON_FRAME_COUNT = Object.values(DRAGON_ANIMS).reduce((a, d) => a + d.n, 0);
