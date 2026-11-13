import { ramp, type Ramp } from './Pix';

export type BiomeId = 'tropical' | 'volcanic' | 'storm';
export interface Theme {
  id: BiomeId;
  top: Ramp; soil: Ramp; sand: Ramp; rock: Ramp; ruin: Ramp; moss: number; wood: Ramp;
  leaf: Ramp; leaf2: Ramp; trunk: Ramp;
  skyTop: number; skyMid: number; skyLow: number; cloud: number; cloudShade: number;
  sea: number; seaDeep: number; far: number; mid: number; bgTint: number;
  water: number; ambient: number;
}

export const THEMES: Record<BiomeId, Theme> = {
  tropical: {
    id: 'tropical',
    top: ramp(0x5fae3c), soil: ramp(0x8a5a3c), sand: ramp(0xe6cf8f), rock: ramp(0x6f7486), ruin: ramp(0x9b9a86), moss: 0x6fa83a, wood: ramp(0x9a6a3e),
    leaf: ramp(0x3f9a48), leaf2: ramp(0x2f7d5a), trunk: ramp(0x6e4a34),
    skyTop: 0x2f7fc4, skyMid: 0x6fc3e6, skyLow: 0xf6e3b4, cloud: 0xffffff, cloudShade: 0xc9e2f2,
    sea: 0x2f9fc0, seaDeep: 0x1f6f9c, far: 0x7fb7c8, mid: 0x3f8f7a, bgTint: 0x232a3f,
    water: 0x3fb6d0, ambient: 0xffffff,
  },
  volcanic: {
    id: 'volcanic',
    top: ramp(0x5a4a52), soil: ramp(0x3d3038), sand: ramp(0x4a4450), rock: ramp(0x4b3d48), ruin: ramp(0x6a5a58), moss: 0xd0622a, wood: ramp(0x4a3a36),
    leaf: ramp(0x7a3a2a), leaf2: ramp(0x5a2a2a), trunk: ramp(0x2f2630),
    skyTop: 0x2a1a30, skyMid: 0x8a3a3a, skyLow: 0xf2a04a, cloud: 0x6a4a52, cloudShade: 0x3a2a3a,
    sea: 0x5a3f5c, seaDeep: 0x3a2a48, far: 0x8a4a4a, mid: 0x4a2c38, bgTint: 0x1c1018,
    water: 0x6a4a7a, ambient: 0xffd8c0,
  },
  storm: {
    id: 'storm',
    top: ramp(0x5c7a70), soil: ramp(0x4c4a58), sand: ramp(0x8a8c98), rock: ramp(0x56607a), ruin: ramp(0x7c8894), moss: 0x7a6aa8, wood: ramp(0x5a5262),
    leaf: ramp(0x3a6a6a), leaf2: ramp(0x2c5466), trunk: ramp(0x3c3644),
    skyTop: 0x1c2438, skyMid: 0x3c4c68, skyLow: 0x8a9cb0, cloud: 0x5a6a84, cloudShade: 0x303c54,
    sea: 0x3a5a78, seaDeep: 0x22344e, far: 0x5a6e8a, mid: 0x34465e, bgTint: 0x141a28,
    water: 0x4a7a9a, ambient: 0xc8d8f0,
  },
};
export const BIOMES: BiomeId[] = ['tropical', 'volcanic', 'storm'];
