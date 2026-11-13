/** Small blackboard written by gameplay scenes and read by the UI scene every frame. */
export const hud = {
  mode: 'ground' as 'ground' | 'flight' | 'boat' | 'oceanFlight' | 'title',
  stamina: 0, staminaMax: 0, boatHp: 100,
  focusId: null as string | null, bondHold: 0,
  prompt: null as string | null, promptAction: 'interact' as string,
  compass: null as { angle: number; label: string } | null,
  fps: 60, entities: 0, fxCount: 0,
  /** Minimap feed from the active gameplay scene. Island maps are a texture the scene paints ('mm-island'); bump mmVersion when it changes. */
  minimap: null as null | { kind: 'ocean'; x: number; y: number; a: number; flying: boolean } | { kind: 'island'; tex: string; fx: number; fy: number; flying: boolean; facing: number },
  mmVersion: 0,
  /** Depth-lane indicator: lane depths available on this island, the active one, and whether moving back/front is possible right here. */
  lanes: null as null | { depths: number[]; active: number; canBack: boolean; canFront: boolean },
  /** Active boss bar. */
  boss: null as null | { name: string; hp: number; max: number },
  /** Bond Surge meter (0..1) and its element colour; the ultimate is ready at 1 */
  surge: 0, surgeColor: 0xffffff,
  inMenu: false, dialog: null as string | null,
};
