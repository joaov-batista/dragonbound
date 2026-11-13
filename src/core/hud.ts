/** Small blackboard written by gameplay scenes and read by the UI scene every frame. */
export const hud = {
  mode: 'ground' as 'ground' | 'flight' | 'boat' | 'oceanFlight' | 'title',
  stamina: 0, staminaMax: 0, boatHp: 100,
  focusId: null as string | null, bondHold: 0,
  prompt: null as string | null, promptAction: 'interact' as string,
  compass: null as { angle: number; label: string } | null,
  fps: 60, entities: 0, fxCount: 0,
  inMenu: false, dialog: null as string | null,
};
