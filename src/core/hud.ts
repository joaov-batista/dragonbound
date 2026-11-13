/** Small blackboard written by gameplay scenes and read by the UI scene every frame. */
export const hud = {
  mode: 'ground' as 'ground' | 'flight' | 'boat' | 'oceanFlight' | 'title',
  stamina: 0, staminaMax: 0, boatHp: 100,
  focusId: null as string | null, bondHold: 0,
  prompt: null as string | null, promptAction: 'interact' as string,
  compass: null as { angle: number; label: string } | null,
  fps: 60, entities: 0, fxCount: 0,
  /** Minimap feed from the active gameplay scene. Island maps are a texture the scene paints ('mm-island'); bump mmVersion when it changes. */
  minimap: null as null | { kind: 'ocean'; x: number; y: number; a: number; flying: boolean } | { kind: 'island'; fx: number; fy: number; flying: boolean; facing: number },
  mmVersion: 0,
  inMenu: false, dialog: null as string | null,
};
