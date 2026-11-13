export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'parry', 'interact', 'mount', 'ability', 'call', 'sneak', 'item', 'itemNext', 'gesture', 'pause', 'map'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  left: 'Esquerda', right: 'Direita', up: 'Cima', down: 'Baixo', jump: 'Pular / Bater asas', attack: 'Atacar', dash: 'Dash / Esquiva',
  parry: 'Aparar', interact: 'Interagir / Acariciar', mount: 'Montar / Desmontar', ability: 'Habilidade do dragão', call: 'Assobiar / Chamar',
  sneak: 'Andar devagar', item: 'Oferecer / Usar item', itemNext: 'Próximo item', gesture: 'Gesto de calma', pause: 'Pausa', map: 'Mapa',
};

/** A gamepad binding: button index, or axis index with direction. */
export type PadBind = { b: number } | { a: number; d: 1 | -1 };
export interface Bindings {
  keys: Record<Action, string[]>; // KeyboardEvent.code
  pad: Record<Action, PadBind[]>;
  deadzone: number; sensitivity: number; invertFlightY: boolean;
}

export function defaultBindings(): Bindings {
  return {
    keys: {
      left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
      jump: ['Space'], attack: ['KeyJ'], dash: ['KeyK'], parry: ['KeyL'], interact: ['KeyE'], mount: ['KeyR'], ability: ['KeyI'],
      call: ['KeyC'], sneak: ['ShiftLeft'], item: ['KeyF'], itemNext: ['KeyG'], gesture: ['KeyH'], pause: ['Escape', 'Enter'], map: ['KeyM'],
    },
    pad: {
      left: [{ a: 0, d: -1 }], right: [{ a: 0, d: 1 }], up: [{ a: 1, d: -1 }], down: [{ a: 1, d: 1 }],
      jump: [{ b: 0 }], attack: [{ b: 2 }], dash: [{ b: 1 }], interact: [{ b: 3 }], parry: [{ b: 4 }], ability: [{ b: 5 }],
      sneak: [{ b: 6 }], mount: [{ b: 7 }], call: [{ b: 12 }], gesture: [{ b: 13 }], itemNext: [{ b: 14 }], item: [{ b: 15 }], pause: [{ b: 9 }], map: [{ b: 8 }],
    },
    deadzone: 0.22, sensitivity: 1, invertFlightY: false,
  };
}

export const padBindEq = (x: PadBind, y: PadBind): boolean => ('b' in x && 'b' in y ? x.b === y.b : 'a' in x && 'a' in y ? x.a === y.a && x.d === y.d : false);

/** Lists pairs of actions sharing the same physical input. */
export function findConflicts(b: Bindings): { input: string; actions: Action[] }[] {
  const byInput = new Map<string, Action[]>();
  for (const a of ACTIONS) {
    for (const k of b.keys[a]) byInput.set('key:' + k, [...(byInput.get('key:' + k) ?? []), a]);
    for (const p of b.pad[a]) { const id = 'pad:' + ('b' in p ? 'b' + p.b : 'a' + p.a + (p.d > 0 ? '+' : '-')); byInput.set(id, [...(byInput.get(id) ?? []), a]); }
  }
  return [...byInput.entries()].filter(([, v]) => v.length > 1).map(([input, actions]) => ({ input, actions }));
}

/** Rebind helpers return a new object; the input slot is removed from any other action to avoid conflicts. */
export function rebindKey(b: Bindings, action: Action, slot: number, code: string): Bindings {
  const keys = { ...b.keys };
  for (const a of ACTIONS) keys[a] = keys[a].filter((k) => k !== code || a === action);
  const cur = [...keys[action].filter((k) => k !== code)];
  cur[Math.min(slot, cur.length)] = code;
  keys[action] = cur.slice(0, 2);
  return { ...b, keys };
}
export function rebindPad(b: Bindings, action: Action, bind: PadBind): Bindings {
  const pad = { ...b.pad };
  for (const a of ACTIONS) pad[a] = pad[a].filter((p) => !padBindEq(p, bind));
  pad[action] = [bind];
  return { ...b, pad };
}

export type PadKind = 'xbox' | 'playstation' | 'switch' | 'generic';
export function padKind(id: string): PadKind {
  const s = id.toLowerCase();
  if (/dualshock|dualsense|playstation|054c|sony/.test(s)) return 'playstation';
  if (/switch|pro controller|057e|nintendo|joy-con/.test(s)) return 'switch';
  if (/xbox|xinput|045e|microsoft/.test(s)) return 'xbox';
  return 'generic';
}
const PAD_NAMES: Record<PadKind, string[]> = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'Guia'],
  playstation: ['X', 'O', 'Quad', 'Tri', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'PS'],
  switch: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '-', '+', 'L3', 'R3', 'D↑', 'D↓', 'D←', 'D→', 'Home'],
  generic: ['B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'B15', 'B16'],
};
export function padBindLabel(p: PadBind | undefined, kind: PadKind): string {
  if (!p) return '—';
  if ('b' in p) return (PAD_NAMES[kind][p.b] ?? 'B' + p.b).replace('D↑', 'D-cima').replace('D↓', 'D-baixo').replace('D←', 'D-esq').replace('D→', 'D-dir');
  return `Eixo ${p.a}${p.d > 0 ? '+' : '-'}`;
}
export function keyLabel(code: string | undefined): string {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', 'Seta ').replace('Left', 'Esq').replace('Right', 'Dir').replace('Up', 'Cima').replace('Down', 'Baixo').replace('Space', 'Espaço').replace('Escape', 'Esc').replace('Shift', 'Shift ').replace('Control', 'Ctrl ');
}
