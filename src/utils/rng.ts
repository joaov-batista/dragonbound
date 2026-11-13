/** Deterministic PRNG utilities (mulberry32). All procedural systems take an Rng so results are reproducible. */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashInts(...v: number[]): number {
  let h = 0x811c9dc5;
  for (const n of v) {
    h ^= n | 0; h = Math.imul(h, 0x01000193);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  }
  return h >>> 0;
}

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export const rand = (r: Rng, a: number, b: number): number => a + (b - a) * r();
export const randInt = (r: Rng, a: number, b: number): number => Math.floor(rand(r, a, b + 1));
export const pick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
export const chance = (r: Rng, p: number): boolean => r() < p;
/** Approximate gaussian (mean 0, sd 1). */
export const gauss = (r: Rng): number => (r() + r() + r() + r() - 2) * 1.7320508;

export function weighted<T>(r: Rng, items: ReadonlyArray<readonly [T, number]>): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let t = r() * total;
  for (const [v, w] of items) { t -= w; if (t <= 0) return v; }
  return items[items.length - 1][0];
}

/** Deterministic RFC-4122-shaped id from an RNG. */
export function uuidFrom(r: Rng): string {
  const h = (n: number): string => { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(r() * 16).toString(16); return s; };
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(r() * 4)]}${h(3)}-${h(12)}`;
}

export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const approach = (v: number, target: number, step: number): number => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
