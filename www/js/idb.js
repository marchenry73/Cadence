// Thin promise wrapper over IndexedDB. Two jobs:
//   cache  — the last known server rows per table, so the app paints
//            instantly on launch and works with no network.
//   outbox — mutations made while offline (or in flight), replayed in order.
import { CONFIG } from './config.js';

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(CONFIG.dbName, CONFIG.dbVersion);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('outbox'))
        db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, run) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = run(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const idb = {
  get: (store, key) => tx(store, 'readonly', s => s.get(key)),
  set: (store, key, val) => tx(store, 'readwrite', s => s.put(val, key)),
  del: (store, key) => tx(store, 'readwrite', s => s.delete(key)),
  clear: store => tx(store, 'readwrite', s => s.clear()),

  add: (store, val) => tx(store, 'readwrite', s => s.add(val)),
  all: store => tx(store, 'readonly', s => s.getAll()),
  delKey: (store, key) => tx(store, 'readwrite', s => s.delete(key)),

  async wipe() {
    await Promise.all(['cache', 'meta', 'outbox'].map(s => idb.clear(s).catch(() => {})));
  }
};

// Safe reads: a locked-down browser (private mode, storage disabled) must
// degrade to in-memory rather than crash the app.
export async function cacheGet(key, fallback = null) {
  try { const v = await idb.get('cache', key); return v ?? fallback; }
  catch { return fallback; }
}
export async function cacheSet(key, val) {
  try { await idb.set('cache', key, val); } catch { /* ignore */ }
}
export async function metaGet(key, fallback = null) {
  try { const v = await idb.get('meta', key); return v ?? fallback; }
  catch { return fallback; }
}
export async function metaSet(key, val) {
  try { await idb.set('meta', key, val); } catch { /* ignore */ }
}
