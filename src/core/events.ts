/** Tiny typed pub/sub used to decouple gameplay systems from UI and audio. */
type Handler<T> = (payload: T) => void;

export interface GameEvents {
  toast: { text: string; icon?: string };
  prompt: { text: string | null; action?: string };
  areaTitle: { title: string; subtitle?: string };
  dialog: { text: string } | null;
  hudDirty: undefined;
  focusDragon: string | null;
  settingsChanged: undefined;
  saved: undefined;
  bonded: { id: string };
  openMenu: { tab?: string } | undefined;
  closeMenu: undefined;
  modeChanged: 'ground' | 'flight' | 'boat' | 'menu';
  talk: import('../story/story').Talk;
  openShop: { who: string };
  /** a bonded dragon was called back, told to follow, kept or released (from the menu) */
  partyChanged: { id: string; how: 'summon' | 'follow' | 'keep' | 'release' };
}

class Bus {
  private map = new Map<string, Set<Handler<never>>>();
  on<K extends keyof GameEvents>(k: K, h: Handler<GameEvents[K]>): () => void {
    let s = this.map.get(k);
    if (!s) this.map.set(k, (s = new Set()));
    s.add(h as Handler<never>);
    return () => s!.delete(h as Handler<never>);
  }
  emit<K extends keyof GameEvents>(k: K, ...p: GameEvents[K] extends undefined ? [] : [GameEvents[K]]): void {
    this.map.get(k)?.forEach((h) => (h as Handler<GameEvents[K]>)(p[0] as GameEvents[K]));
  }
}
export const events = new Bus();
