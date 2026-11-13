import { migrate, type SaveData } from './schema';

const DB = 'dragonbound', STORE = 'saves', SLOT = 'slot1', LS_KEY = 'dragonbound.save.slot1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('IndexedDB indisponível')); return; }
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE); };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error ?? new Error('falha ao abrir IndexedDB'));
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode), rq = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(rq.result); };
    t.onerror = () => { db.close(); rej(t.error ?? new Error('transação falhou')); };
    t.onabort = () => { db.close(); rej(t.error ?? new Error('transação abortada')); };
  }));
}

/** Persistence: IndexedDB first, localStorage as a fallback (private mode, old WebViews). */
export const SaveManager = {
  async save(data: SaveData): Promise<void> {
    data.savedAt = Date.now();
    const json = JSON.stringify(data);
    try { await tx('readwrite', (s) => s.put(json, SLOT)); }
    catch { try { localStorage.setItem(LS_KEY, json); } catch { throw new Error('Não foi possível salvar (armazenamento indisponível).'); } }
  },
  async load(): Promise<SaveData | null> {
    let json: string | null | undefined;
    try { json = await tx<string | undefined>('readonly', (s) => s.get(SLOT) as IDBRequest<string | undefined>); } catch { json = null; }
    if (!json) { try { json = localStorage.getItem(LS_KEY); } catch { json = null; } }
    if (!json) return null;
    return migrate(JSON.parse(json));
  },
  async exists(): Promise<boolean> { try { return (await this.load()) !== null; } catch { return false; } },
  async clear(): Promise<void> {
    try { await tx('readwrite', (s) => s.delete(SLOT)); } catch { /* ignore */ }
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  },
  exportString(data: SaveData): string { return JSON.stringify(data); },
  importString(json: string): SaveData { return migrate(JSON.parse(json)); },
  /** Offer the save as a downloadable file (works on desktop and mobile browsers). */
  download(data: SaveData): void {
    const blob = new Blob([this.exportString(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `dragonbound-save-dia${Math.floor(data.day)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  /** Opens a file picker and resolves with the migrated save. */
  pickFile(): Promise<SaveData> {
    return new Promise((res, rej) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json,.json';
      inp.onchange = () => {
        const f = inp.files?.[0]; if (!f) { rej(new Error('nenhum arquivo')); return; }
        f.text().then((t) => res(this.importString(t))).catch(rej);
      };
      inp.click();
    });
  },
};
