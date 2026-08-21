// The store. One in-memory copy of every row the user can see, plus the
// selectors the views read. Mutations are optimistic: local state changes and
// the UI repaints in the same frame, then the write goes out. Nothing in the
// interface ever waits for the network.
import { uid, todayISO, iso, fromISO, addDays, startOfWeek, DAY_MINUTES, by } from './util.js';
import { TABLES, pull, pullPrefs, enqueue, flush, watch, sb } from './net.js';
import { cacheGet, cacheSet, metaGet, metaSet } from './idb.js';

export const DEFAULT_PREFS = {
  lang: 'en', theme: 'system', accent: '#E8604A', density: 'comfortable',
  focus_start: 540, focus_end: 1020, week_starts: 0, slot_min: 15, buffer_min: 0,
  clock24: false, reminders: true, haptics: true, tone: 'chime', remind_lead: 5,
  tabs: ['today', 'calendar', 'tasks', 'goals', 'settings'], onboarded: false,
  nickname: null, leaderboard_opt_in: true,
  ideal_statement: '', ideal_areas: [], ideal_set_at: null
};

export const S = {
  user: null,
  profile: null,
  org: null,
  role: null,
  members: [],
  // True for a "Continue as guest" session: no account, no network, and —
  // the whole point — nothing written to IndexedDB or Supabase. See the
  // guards in save()/remove()/savePrefs() below.
  guest: false,
  prefs: { ...DEFAULT_PREFS },
  categories: [], routines: [], events: [], tasks: [],
  goals: [], milestones: [], checkins: [], activity: [],
  // view state (never synced)
  route: 'today',
  day: todayISO(),
  weekOffset: 0,
  calMode: 'week',          // week | month | agenda
  goalArea: 'all',
  taskFilter: 'open',
  online: navigator.onLine,
  sync: 'idle',
  pending: 0,
  ready: false
};

const subs = new Set();
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
export function notify(reason = '') { subs.forEach(fn => { try { fn(reason); } catch (e) { console.error(e); } }); }

// ------------------------------------------------------------------ merge

const alive = r => !r.deleted_at;

function mergeRows(table, rows) {
  if (!rows?.length) return;
  const list = S[table];
  const index = new Map(list.map((r, i) => [r.id, i]));
  for (const row of rows) {
    const at = index.get(row.id);
    if (at == null) { index.set(row.id, list.push(row) - 1); continue; }
    const local = list[at];
    // Last writer wins per row. A local row still sitting in the outbox has no
    // server updated_at yet and is kept.
    if (!local.updated_at || !row.updated_at || row.updated_at >= local.updated_at) list[at] = row;
  }
  S[table] = list.filter(alive);
}

async function persistCache() {
  await Promise.all(TABLES.map(t => cacheSet(t, S[t])));
  await cacheSet('prefs', S.prefs);
}

// ------------------------------------------------------------------ boot

export async function loadFromCache() {
  const cached = await Promise.all(TABLES.map(t => cacheGet(t, [])));
  TABLES.forEach((t, i) => { S[t] = (Array.isArray(cached[i]) ? cached[i] : []).filter(alive); });
  S.prefs = { ...DEFAULT_PREFS, ...(await cacheGet('prefs', {})) };
}

export async function syncNow({ full = false } = {}) {
  if (!navigator.onLine) return;
  const since = full ? null : await metaGet('lastPull', null);
  const { rows, at } = await pull(since);
  TABLES.forEach(t => mergeRows(t, rows[t]));
  const p = await pullPrefs(S.user.id);
  if (p) S.prefs = { ...DEFAULT_PREFS, ...p };
  await metaSet('lastPull', at);
  await persistCache();
  notify('sync');
}

export function startRealtime() {
  watch((table, row) => {
    if (table === 'prefs') {
      if (row.user_id === S.user?.id) { S.prefs = { ...DEFAULT_PREFS, ...row }; notify('prefs'); }
      return;
    }
    mergeRows(table, [row]);
    notify('realtime');
    cacheSet(table, S[table]);
  });
}

// ------------------------------------------------------------------ writes

const now = () => new Date().toISOString();

// Upsert one row. Pass { id } to update, omit it to create.
export function save(table, patch, { silent = false } = {}) {
  const list = S[table];
  const existing = patch.id ? list.find(r => r.id === patch.id) : null;
  const row = {
    ...(existing || {}),
    ...patch,
    id: patch.id || existing?.id || uid(),
    user_id: S.user?.id,
    updated_at: now()
  };
  delete row._local;
  if (existing) list[list.indexOf(existing)] = row; else list.push(row);
  // Guest sessions live in memory only — never queued for Supabase, never
  // written to IndexedDB, gone the moment the tab closes.
  if (!S.guest) { enqueue(table, row); cacheSet(table, S[table]); }
  if (!silent) notify('save:' + table);
  return row;
}

// Soft delete: the row stays on the server with deleted_at set so other
// devices can learn about it, and disappears from every selector here.
export function remove(table, id) {
  const list = S[table];
  const row = list.find(r => r.id === id);
  if (!row) return;
  const tomb = { ...row, deleted_at: now(), updated_at: now() };
  S[table] = list.filter(r => r.id !== id);
  if (!S.guest) { enqueue(table, tomb); cacheSet(table, S[table]); }
  // A row linked to a Google event has to be deleted THERE too, but the
  // row is gone from memory the moment this returns — so the intent is
  // recorded now and drained by the next Google sync. Without this, a
  // deletion in Cadence would simply be re-imported on the next pull.
  if (!S.guest && row.external_id && onLocalDelete) {
    try { onLocalDelete(table, row); } catch (e) { console.warn(e); }
  }
  notify('remove:' + table);
}

// google.js registers here rather than state.js importing it, which would
// make the store depend on a sync backend it should know nothing about.
let onLocalDelete = null;
export function setLocalDeleteHook(fn) { onLocalDelete = fn; }

export function savePrefs(patch) {
  S.prefs = { ...S.prefs, ...patch };
  if (!S.guest) {
    const row = { ...S.prefs, user_id: S.user?.id, updated_at: now() };
    delete row.id;
    enqueue('prefs', row);
    cacheSet('prefs', S.prefs);
  }
  notify('prefs');
}

export function logActivity(kind, detail, minutes = 0) {
  save('activity', { kind, detail, minutes, at: now() }, { silent: true });
}

// ------------------------------------------------------------------ selectors

export const mine = table => S[table].filter(r => r.user_id === S.user?.id);
export const catById = id => S.categories.find(c => c.id === id) || null;
export const catColor = id => catById(id)?.color || S.prefs.accent;

export function categories() {
  return mine('categories').sort(by('sort'));
}

// Blocks on a given day: routine occurrences plus one-off events, with
// per-day overrides and skips resolved.
export function occurrencesOn(day, userId = S.user?.id) {
  const dow = fromISO(day).getDay();
  const evts = S.events.filter(e => e.user_id === userId && e.day === day);
  const overridden = new Set(evts.map(e => e.routine_id).filter(Boolean));
  const out = evts.map(e => ({
    key: 'e:' + e.id, kind: 'event', id: e.id, title: e.title,
    category_id: e.category_id, start: e.start_min, end: e.end_min,
    notes: e.notes, image_path: e.image_path, routine_id: e.routine_id,
    protected: !!e.protected, goal_id: e.goal_id || null
  }));
  S.routines.filter(r => r.user_id === userId).forEach(r => {
    if (!(r.days || []).includes(dow)) return;
    if ((r.skip_dates || []).includes(day)) return;
    if (overridden.has(r.id)) return;
    out.push({
      key: 'r:' + r.id + ':' + day, kind: 'routine', id: r.id, title: r.title,
      category_id: r.category_id, start: r.start_min, end: r.end_min,
      notes: r.notes, image_path: null, routine_id: r.id,
      protected: !!r.protected, goal_id: r.goal_id || null
    });
  });
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function dayLoad(day) {
  return occurrencesOn(day).reduce((a, b) => a + (b.end - b.start), 0);
}

// Free stretches across the whole 24-hour day.
export function freeGaps(day, minLen = 30) {
  const busy = occurrencesOn(day).map(o => [o.start, o.end]).sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = 0;
  for (const [s, e] of busy) {
    if (s - cursor >= minLen) gaps.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (DAY_MINUTES - cursor >= minLen) gaps.push([cursor, DAY_MINUTES]);
  return gaps;
}

export function overlapsOn(day, start, end, ignoreKey = null) {
  return occurrencesOn(day).filter(o => o.key !== ignoreKey && o.start < end && start < o.end);
}

export function nextUp(day = todayISO(), fromMin = null) {
  const m = fromMin ?? (day === todayISO() ? new Date().getHours() * 60 + new Date().getMinutes() : 0);
  const list = occurrencesOn(day);
  return list.find(o => o.end > m) || null;
}

export function openTasks() {
  return mine('tasks').filter(t => !t.done_at);
}

export function taskScore(t) {
  const dueBoost = t.due_date
    ? Math.max(0, 14 - Math.max(0, (fromISO(t.due_date) - fromISO(todayISO())) / 86400000)) : 0;
  return (t.importance || 5) * 2 + (t.urgency || 5) + dueBoost;
}

export function overdueTasks() {
  const today = todayISO();
  return openTasks().filter(t => t.due_date && t.due_date < today);
}

export function goalMilestones(goalId) {
  return S.milestones.filter(m => m.goal_id === goalId && m.user_id === S.user?.id).sort(by('sort'));
}

export function goalCheckins(goalId) {
  return S.checkins.filter(c => c.goal_id === goalId && c.user_id === S.user?.id)
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}

export function goalProgress(g) {
  const ms = goalMilestones(g.id);
  if (!ms.length) return g.progress || 0;
  return Math.round(ms.filter(m => m.done_at).length / ms.length * 100);
}

export function goalStale(g, days = 14) {
  const last = goalCheckins(g.id)[0];
  if (!last) return true;
  return (Date.now() - new Date(last.at).getTime()) / 86400000 > days;
}

// Completion streak: a day counts if anything was finished on it.
export function streak(days = 14) {
  const done = new Set();
  mine('tasks').forEach(t => { if (t.done_at) done.add(t.done_at.slice(0, 10)); });
  S.activity.filter(a => a.user_id === S.user?.id && a.kind === 'focus')
    .forEach(a => done.add((a.at || '').slice(0, 10)));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(todayISO(), -i);
    out.push({ day: d, hit: done.has(d) });
  }
  return out;
}

export function weekDays(offset = S.weekOffset) {
  const start = addDays(startOfWeek(todayISO(), S.prefs.week_starts), offset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthGrid(anchorDay = S.day) {
  const a = fromISO(anchorDay);
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const lead = (first.getDay() - S.prefs.week_starts + 7) % 7;
  const start = addDays(iso(first), -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function workloadWarning() {
  const heavy = weekDays().filter(d => dayLoad(d) > 10 * 60);
  return heavy.length ? heavy : null;
}

// ------------------------------------------------------------------ review
//
// "Planned" is what the calendar says. "Actual" is what you confirmed
// happened — the difference is the whole point of the weekly review, and no
// calendar app shows it. Confirmations live in `activity` rows keyed
// day|occurrence|category so they survive timezones and block edits.

const doneDetail = (day, occ) => `${day}|${occ.key}|${occ.category_id || 'none'}`;

export function isBlockDone(occ, day) {
  const prefix = `${day}|${occ.key}|`;
  return S.activity.some(a => a.user_id === S.user?.id && a.kind === 'block-done'
    && String(a.detail || '').startsWith(prefix));
}

export function markBlockDone(occ, day) {
  if (isBlockDone(occ, day)) return;
  save('activity', {
    kind: 'block-done', detail: doneDetail(day, occ),
    minutes: occ.end - occ.start, at: new Date().toISOString()
  }, { silent: true });
  notify('review');
}

export function unmarkBlockDone(occ, day) {
  const prefix = `${day}|${occ.key}|`;
  const row = S.activity.find(a => a.kind === 'block-done' && String(a.detail || '').startsWith(prefix));
  if (row) remove('activity', row.id);
}

// Planned vs confirmed minutes per category across a list of days.
export function categoryTotals(days) {
  const planned = {}, actual = {};
  days.forEach(day => occurrencesOn(day).forEach(o => {
    const k = o.category_id || 'none';
    planned[k] = (planned[k] || 0) + (o.end - o.start);
  }));
  S.activity.filter(a => a.user_id === S.user?.id && a.kind === 'block-done').forEach(a => {
    const parts = String(a.detail || '').split('|');
    if (!days.includes(parts[0])) return;
    const k = parts[2] || 'none';
    actual[k] = (actual[k] || 0) + (a.minutes || 0);
  });
  return { planned, actual };
}

export function goalHours(goalId, days) {
  let mins = 0;
  days.forEach(day => occurrencesOn(day).forEach(o => { if (o.goal_id === goalId) mins += o.end - o.start; }));
  return mins;
}

// Anything already scheduled and marked protected blocks new overlaps.
export function protectedClash(day, start, end, ignoreKey = null) {
  return occurrencesOn(day).find(o =>
    o.protected && o.key !== ignoreKey && o.start < end && start < o.end) || null;
}
