import * as THREE from 'three';
import { Pix, ramp, mix } from '../src/art/Pix';
import { pixTexture } from './pixtex';

/**
 * The open world: one big island (gentle rolling meadows, forests, a mountain and beaches) in an
 * endless sea. Heights are a pure function of (x, z) so every system can query the ground.
 * 1 unit = 1 metre; sprites are drawn at 16 px per metre.
 */
export const WORLD = 2400;           // playable square (m)
export const SEA = 0;                // sea level
const R0 = 760;                      // island radius

// ── noise ──────────────────────────────────────────────────────────────────
function hash(x: number, y: number, s: number): number { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, oct: number, s: number): number { let t = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 17) * a; n += a; a *= 0.5; f *= 2; } return t / n; }
const smooth = (a: number, b: number, t: number): number => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

/** Where the mountain stands (north-east of the island). */
export const PEAK = new THREE.Vector2(260, -300);
/** The starting meadow (south-west) — wide and flat, for walking side by side with a dragon. */
export const MEADOW = new THREE.Vector2(-260, 260);

/** Ground height at (x, z). Below 0 is sea floor. */
export function height(x: number, z: number): number {
  const d = Math.hypot(x, z) / R0 + (fbm(x * 0.0021, z * 0.0021, 3, 7) - 0.5) * 0.5;
  const land = smooth(1.05, 0.72, d);                         // 0 at sea, 1 inland
  const hills = (fbm(x * 0.0045, z * 0.0045, 4, 3) - 0.35) * 26; // rolling hills
  const mdist = Math.hypot(x - PEAK.x, z - PEAK.y);
  const ridge = 1 - Math.abs(fbm(x * 0.006, z * 0.006, 3, 11) * 2 - 1);
  const mountain = Math.pow(smooth(420, 0, mdist), 1.6) * (110 + ridge * 40);
  const flat = smooth(260, 120, Math.hypot(x - MEADOW.x, z - MEADOW.y)); // the meadow is levelled out
  const base = 4 + hills * (1 - flat * 0.85) + flat * 2;
  return land * (base + mountain) + (1 - land) * -14 + (land > 0 && land < 1 ? -3 * (1 - land) : 0);
}
/** Ground normal (for slope tests). */
export function slope(x: number, z: number): number { const e = 1.5; return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e); }

// ── terrain mesh ───────────────────────────────────────────────────────────
const COL = { sand: 0xe6d59a, grass: 0x7cc252, grassDark: 0x5ea644, forest: 0x46863a, rock: 0x8a8478, rockDark: 0x6a6460, snow: 0xf2f4f8, seabed: 0xc8b878 };
function groundColor(x: number, z: number, h: number): number {
  const s = slope(x, z), n = fbm(x * 0.03, z * 0.03, 2, 5);
  if (h < 1.6) return h < -1 ? COL.seabed : COL.sand;
  if (h > 118 + n * 14) return COL.snow;
  if (s > 0.75 || h > 92 + n * 10) return mix(COL.rock, COL.rockDark, n);
  const forest = forestAt(x, z);
  return mix(mix(COL.grass, COL.grassDark, n * 0.9), COL.forest, forest * 0.8);
}
/** 0..1 forest density. */
export function forestAt(x: number, z: number): number {
  return smooth(0.52, 0.68, fbm(x * 0.004 + 40, z * 0.004 - 20, 3, 21)) * (1 - smooth(260, 140, Math.hypot(x - MEADOW.x, z - MEADOW.y)) * 0.85);
}

function pixelGrassTex(): THREE.Texture {
  const p = new Pix(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1; const v = 0.86 + Math.abs(n) * 0.22; const c = Math.round(255 * Math.min(1, v)); p.px(x, y, (c << 16) | (c << 8) | c); }
  for (let k = 0; k < 40; k++) { const x = (k * 37) % 32, y = (k * 61) % 32; p.px(x, y, 0xffffff); p.px(x, (y + 1) % 32, 0xe8e8e8); }
  const t = pixTexture(p); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.NearestMipmapNearestFilter; t.generateMipmaps = true; return t;
}

export function buildTerrain(scene: THREE.Scene): void {
  const N = 220, size = WORLD, geo = new THREE.PlaneGeometry(size, size, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, height(x, z)); uv.setXY(i, x / 3, z / 3); }
  const g2 = geo.toNonIndexed(); // flat shading with per-face colour
  const p2 = g2.attributes.position as THREE.BufferAttribute, cols = new Float32Array(p2.count * 3), c = new THREE.Color();
  for (let i = 0; i < p2.count; i += 3) {
    const cx = (p2.getX(i) + p2.getX(i + 1) + p2.getX(i + 2)) / 3, cz = (p2.getZ(i) + p2.getZ(i + 1) + p2.getZ(i + 2)) / 3, cy = (p2.getY(i) + p2.getY(i + 1) + p2.getY(i + 2)) / 3;
    c.setHex(groundColor(cx, cz, cy)).convertSRGBToLinear();
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g2.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g2.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: pixelGrassTex() });
  const mesh = new THREE.Mesh(g2, mat); mesh.receiveShadow = false;
  scene.add(mesh);
}

// ── sea and sky ────────────────────────────────────────────────────────────
export function buildSea(scene: THREE.Scene): THREE.Texture {
  const p = new Pix(32, 32), deep = ramp(0x2a7fb8);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.px(x, y, deep[2]);
  for (let k = 0; k < 18; k++) { const x = (k * 13) % 32, y = (k * 7) % 32; for (let j = 0; j < 4; j++) p.px(x + j, y, deep[4]); p.px(x + 1, y + 1, deep[3]); }
  const t = pixTexture(p); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1200, 1200); t.minFilter = THREE.NearestMipmapNearestFilter; t.generateMipmaps = true;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshLambertMaterial({ map: t, transparent: true, opacity: 0.88, color: 0xdff4ff }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = SEA; sea.renderOrder = 1;
  scene.add(sea);
  return t;
}

export function buildSky(scene: THREE.Scene): THREE.Mesh {
  const geo = new THREE.SphereGeometry(9000, 24, 12), cols: number[] = [], c = new THREE.Color();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 9000; c.setHex(y > 0 ? mix(0xbfe4ff, 0x3f7fd0, Math.min(1, y * 2.2)) : 0xbfe4ff).convertSRGBToLinear(); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1; scene.add(sky);
  return sky;
}

// ── vegetation: cross-quad pixel trees, bushes and grass, instanced ─────────
function paintTree(kind: 'round' | 'pine' | 'bush' | 'grass' | 'rock'): Pix {
  if (kind === 'grass') { const p = new Pix(16, 12), g = ramp(0x6dba4a); for (let k = 0; k < 6; k++) { const x = 2 + k * 2.2; p.line(x, 11, x + (k % 2 ? 1 : -1), 3 + (k % 3) * 2, g[k % 2 ? 3 : 2]); } p.outline(0x1f3a1a); return p; }
  if (kind === 'rock') { const p = new Pix(24, 16), r = ramp(0x8a8478); p.ball(12, 10, 10, 6, r); p.ball(8, 9, 4, 3, ramp(0x9a948a)); p.outline(0x2a2624); return p; }
  if (kind === 'bush') { const p = new Pix(28, 20), g = ramp(0x4f9a3c); p.ball(9, 12, 8, 7, g); p.ball(18, 11, 9, 8, g); p.ball(14, 8, 7, 6, ramp(0x5fae44)); p.outline(0x1f3a1a); return p; }
  if (kind === 'pine') {
    const p = new Pix(40, 72), g = ramp(0x2f6f3a), w = ramp(0x6a4a30);
    p.rect(18, 56, 5, 16, w[2]); p.rect(18, 56, 2, 16, w[1]);
    for (let k = 0; k < 4; k++) { const y = 6 + k * 13, hw = 7 + k * 4.5; p.poly([[20, y], [20 + hw, y + 18], [20 - hw, y + 18]], g[k % 2 ? 2 : 1]); p.line(20, y + 1, 20 + hw - 2, y + 17, g[3]); }
    p.outline(0x142a18); return p;
  }
  const p = new Pix(48, 64), g = ramp(0x4f9a3c), w = ramp(0x7a5436);
  p.limb(24, 63, 24, 34, 3.4, 2.4, w); p.limb(24, 44, 15, 34, 1.6, 1, w); p.limb(24, 40, 33, 31, 1.6, 1, w);
  for (const [x, y, r] of [[16, 28, 11], [32, 27, 12], [24, 18, 13], [24, 32, 11]] as const) p.ball(x, y, r, r * 0.9, g);
  for (let k = 0; k < 20; k++) p.px(12 + (k * 7) % 26, 12 + (k * 11) % 24, g[4]);
  p.outline(0x1f3a1a); return p;
}

interface Veg { kind: 'round' | 'pine' | 'bush' | 'grass' | 'rock'; w: number; h: number; n: number }
export function buildVegetation(scene: THREE.Scene): void {
  const defs: Veg[] = [{ kind: 'round', w: 6, h: 8, n: 900 }, { kind: 'pine', w: 4.5, h: 8.5, n: 900 }, { kind: 'bush', w: 2.4, h: 1.7, n: 900 }, { kind: 'grass', w: 1.1, h: 0.8, n: 5000 }, { kind: 'rock', w: 2.2, h: 1.4, n: 500 }];
  let seed = 9;
  const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const v of defs) {
    const tex = pixTexture(paintTree(v.kind));
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    // two crossed quads, origin at the base
    const a = new THREE.PlaneGeometry(v.w, v.h); a.translate(0, v.h / 2, 0);
    const b = a.clone(); b.rotateY(Math.PI / 2);
    const geo = mergeGeos([a, b]);
    const inst = new THREE.InstancedMesh(geo, mat, v.n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let k = 0;
    for (let tries = 0; tries < v.n * 30 && k < v.n; tries++) {
      const x = (rnd() - 0.5) * 1700, z = (rnd() - 0.5) * 1700, h = height(x, z);
      if (h < 2.2 || slope(x, z) > 0.5) continue;
      const f = forestAt(x, z);
      if (v.kind === 'round' && (rnd() > f || h > 70)) continue;
      if (v.kind === 'pine' && (rnd() > f * 0.6 + (h > 50 ? 0.5 : 0) || h > 100)) continue;
      if (v.kind === 'bush' && rnd() > 0.35 + f * 0.4) continue;
      if (v.kind === 'rock' && rnd() > 0.2 + (h > 60 ? 0.6 : 0)) continue;
      if (v.kind === 'grass' && h > 80) continue;
      const sc = 0.75 + rnd() * 0.55;
      p.set(x, h - 0.1, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI); s.set(sc, sc, sc);
      m.compose(p, q, s); inst.setMatrixAt(k++, m);
    }
    inst.count = k; inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }
}
function mergeGeos(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = []; let off = 0;
  for (const g of gs) {
    const P = g.attributes.position, U = g.attributes.uv, N = g.attributes.normal, I = g.index!;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); uv.push(U.getX(i), U.getY(i)); nor.push(0, 1, 0); void N; }
    for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + off);
    off += P.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}

// ── clouds ─────────────────────────────────────────────────────────────────
export function buildClouds(scene: THREE.Scene): THREE.Sprite[] {
  const out: THREE.Sprite[] = [];
  for (let v = 0; v < 3; v++) {
    const w = 96 + v * 32, h = 40 + v * 8, p = new Pix(w, h), wh = 0xffffff, sh = 0xd8e6f4;
    for (let k = 0; k < 6 + v; k++) { const cx = 14 + ((w - 28) * k) / (5 + v), r = 9 + ((k * 37 + v * 11) % 9); p.ellipse(cx, h - 10 - r * 0.5, r * 1.3, r, wh); }
    p.rect(8, h - 12, w - 16, 7, wh);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (p.solid(x, y) && (y > h - 10 || !p.solid(x, y + 3))) p.px(x, y, sh);
    const tex = pixTexture(p);
    for (let k = 0; k < 22; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false }));
      const a = (k * 2.39996) + v, r = 200 + ((k * 97 + v * 51) % 900);
      s.position.set(Math.cos(a) * r, 80 + ((k * 31 + v * 17) % 90), Math.sin(a) * r); s.scale.set(w / 2.5, h / 2.5, 1);
      scene.add(s); out.push(s);
    }
  }
  return out;
}
