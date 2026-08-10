// Network layer: Supabase client, incremental pull, offline outbox, realtime.
//
// Every mutation is a full-row upsert. Deletes are soft (deleted_at), which is
// what lets a device that was offline learn about a deletion when it syncs by
// "updated_at > last pull". Conflicts resolve last-writer-wins per row, which
// is the point of the table split: two devices editing different blocks no
// longer overwrite each other.
import { CONFIG } from './config.js';
import { idb, metaGet, metaSet } from './idb.js';

export const TABLES = [
  'categories', 'routines', 'events', 'tasks', 'goals', 'milestones', 'checkins', 'activity'
];

export let sb = null;

export function initNet() {
  if (sb) return sb;
  if (!window.supabase?.createClient) throw new Error('Supabase SDK failed to load');
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 8 } }
  });
  window.cadenceDB = sb; // console access, e.g. await window.cadenceDB.rpc('migrate_state_blob')
  return sb;
}

const isNetworkError = e => {
  const m = String(e?.message || e || '').toLowerCase();
  return !navigator.onLine || m.includes('failed to fetch') || m.includes('network')
    || m.includes('timeout') || m.includes('load failed');
};

// ---------------------------------------------------------------- pull

// Rows changed since `since` (ISO string, or null for everything).
// RLS returns the user's own rows plus org-mates' rows for the Team view.
export async function pull(since) {
  const out = {};
  const stamp = new Date().toISOString();
  await Promise.all(TABLES.map(async table => {
    let q = sb.from(table).select('*');
    if (since) q = q.gt('updated_at', since);
    if (table === 'activity') q = q.order('at', { ascending: false }).limit(400);
    const { data, error } = await q;
    if (error) throw error;
    out[table] = data || [];
  }));
  return { rows: out, at: stamp };
}

export async function pullPrefs(userId) {
  const { data, error } = await sb.from('prefs').select('*').eq('user_id', userId).maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function savePrefs(row) {
  const { error } = await sb.from('prefs').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
}

// ---------------------------------------------------------------- outbox

let flushing = false;
let flushTimer = null;
const listeners = new Set();

export function onSyncState(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function announce(detail) { listeners.forEach(fn => { try { fn(detail); } catch {} }); }

export async function outboxCount() {
  try { return (await idb.all('outbox')).length; } catch { return 0; }
}

// Queue one row write. Ops for the same row collapse: the newest full row wins,
// so a burst of edits to one block does not become a burst of requests.
export async function enqueue(table, row) {
  try {
    const key = row.id || row.user_id;
    const pending = await idb.all('outbox');
    const dupe = pending.find(op => op.table === table && (op.row?.id || op.row?.user_id) === key);
    if (dupe) await idb.delKey('outbox', dupe.seq);
    await idb.add('outbox', { table, row, at: Date.now() });
  } catch { /* storage unavailable — the request below is the only chance */ }
  scheduleFlush(0);
}

export function scheduleFlush(delay = 400) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flush(); }, delay);
}

export async function flush() {
  if (flushing || !sb) return;
  if (!navigator.onLine) { announce({ state: 'offline' }); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;

  flushing = true;
  announce({ state: 'syncing' });
  try {
    let ops = await idb.all('outbox');
    ops.sort((a, b) => a.seq - b.seq);
    for (const op of ops) {
      try {
        const conflict = op.table === 'prefs' ? 'user_id' : 'id';
        const { error } = await sb.from(op.table).upsert(op.row, { onConflict: conflict });
        if (error) throw error;
        await idb.delKey('outbox', op.seq);
      } catch (e) {
        if (isNetworkError(e)) { announce({ state: 'offline' }); break; }
        // Rejected by the server (RLS, constraint, bad shape). Dropping it is
        // correct: retrying forever would block every later write behind it.
        await idb.delKey('outbox', op.seq);
        const bad = await metaGet('rejected', []);
        bad.unshift({ at: new Date().toISOString(), table: op.table, id: op.row?.id, message: String(e.message || e) });
        await metaSet('rejected', bad.slice(0, 20));
        announce({ state: 'rejected', message: String(e.message || e) });
      }
    }
    const left = (await idb.all('outbox')).length;
    announce({ state: left ? 'pending' : 'synced', pending: left });
  } catch (e) {
    announce({ state: 'error', message: String(e.message || e) });
  } finally {
    flushing = false;
  }
}

// ---------------------------------------------------------------- realtime

let channel = null;

export function watch(onRow) {
  unwatch();
  channel = sb.channel('cadence-rows');
  [...TABLES, 'prefs'].forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
      const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
      if (row) onRow(table, row, payload.eventType);
    });
  });
  channel.subscribe();
  return channel;
}

export function unwatch() {
  if (channel) { try { sb.removeChannel(channel); } catch {} channel = null; }
}

// ---------------------------------------------------------------- rpc

export async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw error;
  return data;
}
