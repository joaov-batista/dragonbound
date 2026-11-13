import * as THREE from 'three';
import type { Frames } from './views';

export const PPM = 16; // sprite pixels per metre

/**
 * A pixel-art sprite standing in the 3D world. Cylindrical by default (stays upright and turns to
 * the camera, the HD-2D look); spherical with roll for things in flight. Frames come from a sheet.
 */
export class Billboard {
  readonly mesh: THREE.Mesh; readonly tex: THREE.Texture; readonly mat: THREE.MeshBasicMaterial;
  private cur = ''; private flipped = false;
  constructor(private sheet: THREE.Texture, private frames: Frames, cw: number, ch: number, feetPx: number, centerPx = cw / 2, scale = 1) {
    this.tex = sheet.clone(); this.tex.needsUpdate = true;
    const w = (cw / PPM) * scale, h = (ch / PPM) * scale;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(((cw / 2 - centerPx) / PPM) * scale, ((feetPx - ch / 2) / PPM) * scale, 0);
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
  }
  /** Switch to frame `name`, mirrored when `flip`. */
  set(name: string, flip = false): void {
    if (name === this.cur && flip === this.flipped) return;
    const f = this.frames[name]; if (!f) return;
    this.cur = name; this.flipped = flip;
    const img = this.sheet.image as { width: number; height: number }, W = img.width, H = img.height;
    this.tex.repeat.set((flip ? -f.w : f.w) / W, f.h / H);
    this.tex.offset.set((flip ? f.x + f.w : f.x) / W, 1 - (f.y + f.h) / H);
  }
  has(name: string): boolean { return !!this.frames[name]; }
  /** Turn to the camera: upright (yaw only), or fully facing it with a roll angle. */
  face(cam: THREE.Camera, spherical = false, roll = 0): void {
    if (spherical) { this.mesh.quaternion.copy(cam.quaternion); if (roll) this.mesh.rotateZ(roll); return; }
    const dx = cam.position.x - this.mesh.position.x, dz = cam.position.z - this.mesh.position.z;
    this.mesh.rotation.set(0, Math.atan2(dx, dz), roll);
  }
}

let blobTex: THREE.Texture | null = null;
/** Soft round contact shadow that sits on the ground under a sprite. */
export function blobShadow(size: number): THREE.Mesh {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d')!;
    const g = x.createRadialGradient(16, 16, 2, 16, 16, 16); g.addColorStop(0, 'rgba(10,12,24,0.55)'); g.addColorStop(1, 'rgba(10,12,24,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32); blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.6), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
  return m;
}

/** Which view of a character to show: by the angle between where it faces and where the camera looks from. */
export function viewFor(heading: number, cam: THREE.Vector3, at: THREE.Vector3): 'front' | 'back' | 'side' {
  const toCam = Math.atan2(cam.x - at.x, cam.z - at.z);
  let d = toCam - heading; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  const a = Math.abs(d);
  return a < 0.75 ? 'front' : a > 2.4 ? 'back' : 'side';
}
/** For side views: does the character appear to face screen-right? */
export function facesRight(heading: number, cam: THREE.Camera): boolean {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
  return Math.sin(heading) * right.x + Math.cos(heading) * right.z > 0;
}
