import * as THREE from 'three';
import type { Pix } from '../src/art/Pix';

/** Upload a Pix (procedural pixel art) as a crisp, nearest-filtered texture. */
export function pixTexture(p: Pix): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = p.w; c.height = p.h;
  const ctx = c.getContext('2d')!, img = ctx.createImageData(p.w, p.h);
  img.data.set(p.data); ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
