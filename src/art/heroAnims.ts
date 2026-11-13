/** Shared between the asset generator and the runtime animation setup. */
export interface AnimDef { n: number; fps: number; loop: boolean }
export const HERO_FRAME = 48;
export const HERO_ANIMS = {
  idle: { n: 6, fps: 7, loop: true },
  run: { n: 8, fps: 14, loop: true },
  jump: { n: 2, fps: 10, loop: false },
  fall: { n: 2, fps: 10, loop: true },
  dash: { n: 2, fps: 16, loop: false },
  wall: { n: 1, fps: 1, loop: false },
  attack1: { n: 4, fps: 20, loop: false },
  attack2: { n: 4, fps: 20, loop: false },
  attack3: { n: 5, fps: 16, loop: false },
  airattack: { n: 4, fps: 20, loop: false },
  parry: { n: 3, fps: 14, loop: false },
  hurt: { n: 1, fps: 1, loop: false },
  death: { n: 5, fps: 8, loop: false },
  sneak: { n: 6, fps: 8, loop: true },
  offer: { n: 2, fps: 3, loop: true },
  pet: { n: 4, fps: 8, loop: true },
  calm: { n: 2, fps: 3, loop: true },
  whistle: { n: 2, fps: 6, loop: false },
  ride: { n: 2, fps: 1, loop: false },
  swim: { n: 4, fps: 7, loop: true },
} as const satisfies Record<string, AnimDef>;
export type HeroAnim = keyof typeof HERO_ANIMS;
