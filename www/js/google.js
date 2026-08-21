// Google Calendar, read-only — kept live in the background.
//
// Sign-in deliberately does NOT ask for calendar access (that is a
// sensitive scope; see auth.js), so the first sync asks for it separately.
// Once granted, syncGoogleCalendar() runs on launch and on a timer, so
// Google events simply appear rather than waiting for anyone to press an
// import button. Password accounts fall back to the .ics import.
import { S, save, remove, mine, setLocalDeleteHook } from './state.js';
import { providerToken } from './auth.js';
import { sb } from './net.js';
import { todayISO, addDays } from './util.js';
import { metaGet, metaSet } from './idb.js';

const API = 'https://www.googleapis.com/calendar/v3';

export async function googleConnected() {
  return !!(await providerToken());
}

export async function googleCalendars() {
  const token = await providerToken();
  if (!token) return [];
  const res = await fetch(`${API}/users/me/calendarList?minAccessRole=reader`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.items || []).map(c => ({ id: c.id, name: c.summary, primary: !!c.primary }));
}

// Pulls timed events from a calendar into Cadence blocks. All-day events are
// skipped: a 24-hour block would swamp the day's spine and say nothing.
// Re-importing is safe — an event already imported is updated, not duplicated.
export async function importGoogle({ calendarId = 'primary', days = 30, marks = {} } = {}) {
  const token = await providerToken();
  if (!token) throw new Error('Sign in with Google first');
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + days * 864e5);
  const url = `${API}/calendars/${encodeURIComponent(calendarId)}/events`
    + `?timeMin=${from.toISOString()}&timeMax=${to.toISOString()}`
    + `&singleEvents=true&orderBy=startTime&maxResults=250`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    // A 403 here has two very different causes needing different fixes, so
    // read the body rather than guessing:
    //   missing scope       -> the user never granted calendar access
    //   accessNotConfigured -> the Calendar API is off in Google Cloud
    // Treating the second as the first would send someone into a re-consent
    // loop that can never succeed.
    if (res.status === 403) {
      let detail = '';
      try {
        const body = await res.json();
        detail = [body?.error?.errors?.[0]?.reason, body?.error?.status, body?.error?.message]
          .filter(Boolean).join(' ');
      } catch { /* non-JSON body — fall through to the consent case */ }

      if (/accessNotConfigured|SERVICE_DISABLED|has not been used in project/i.test(detail)) {
        const e = new Error('Turn on the Google Calendar API in Google Cloud, then try again');
        e.code = 'calendar-api-disabled';
        throw e;
      }
      const e = new Error('needs-calendar-consent');
      e.code = 'needs-calendar-consent';
      throw e;
    }
    throw new Error(res.status === 401 ? 'Google session expired — sign in again' : 'Google refused the request');
  }
  const json = await res.json();

  // Routines we pushed up live in Google as recurring events, and the pull
  // asks for singleEvents=true — so Google expands each one into dozens of
  // individual instances. Importing those would duplicate every routine as
  // a pile of one-off blocks sitting on top of the routine itself, so any
  // instance belonging to a routine we own is skipped here.
  const ownRoutineGoogleIds = new Set(mine('routines')
    .map(r => String(r.external_id || ''))
    .filter(x => x.startsWith('g:'))
    .map(x => x.slice(2)));

  const existing = new Map(mine('events').filter(e => e.external_id).map(e => [e.external_id, e]));
  const seen = new Set();
  let n = 0;
  (json.items || []).forEach(ev => {
    if (!ev.start?.dateTime || !ev.end?.dateTime || ev.status === 'cancelled') return;
    if (ev.recurringEventId && ownRoutineGoogleIds.has(ev.recurringEventId)) return;
    // A master recurring event is the routine itself, not a block on a day.
    // Importing it as a one-off would collide with the routine that owns it
    // and leave both halves fighting over the same external_id forever.
    // (singleEvents=true usually means Google returns only instances, but
    // relying on that is how the fight starts again if it ever changes.)
    if (Array.isArray(ev.recurrence) && ev.recurrence.length) return;
    if (ownRoutineGoogleIds.has(ev.id)) return;
    const s = new Date(ev.start.dateTime), e = new Date(ev.end.dateTime);
    const day = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
    const start = s.getHours() * 60 + s.getMinutes();
    const end = Math.min(1440, Math.max(start + 5, e.getHours() * 60 + e.getMinutes() + (e.getDate() !== s.getDate() ? 1440 : 0)));
    const key = 'g:' + ev.id;
    seen.add(key);
    const prev = existing.get(key);
    const mark = marks[key];

    if (prev && mark) {
      const remoteChanged = (ev.updated || '') !== mark.g;
      const localChanged = (prev.updated_at || '') !== mark.l;

      // Neither side moved since the last sync — writing would only churn
      // updated_at and make both sides look dirty forever.
      if (!remoteChanged && !localChanged) return;

      // Edited here but not in Google: leave the local row completely alone.
      // Overwriting it with Google's older copy would silently revert the
      // edit, and the push half below is what actually carries it upward.
      if (!remoteChanged && localChanged) return;

      // Both sides moved: most recent edit wins. Losing here is not silent —
      // the push half will send the local version up on this same pass.
      if (remoteChanged && localChanged) {
        const remoteAt = Date.parse(ev.updated || 0) || 0;
        const localAt = Date.parse(prev.updated_at || 0) || 0;
        if (localAt >= remoteAt) return;   // keep local, let the push overwrite Google
      }
    }

    const row = save('events', {
      id: prev?.id,
      title: ev.summary || 'Busy',
      day, start_min: start, end_min: end,
      notes: ev.location || null,
      external_id: key
    });
    // Record what was just accepted from Google so neither half mistakes it
    // for a fresh local edit and pushes it straight back.
    marks[key] = { g: ev.updated || '', l: row.updated_at || '' };
    n++;
  });

  // Anything we previously pulled in that Google no longer returns has been
  // deleted or moved out of range on their side, so it should disappear here
  // too. Scoped to the window we just fetched, so events outside it are never
  // touched. Without this, a cancelled meeting would haunt the calendar
  // forever — the whole point of a live sync is that it reflects reality.
  const fromDay = todayISO();
  const toDay = addDays(todayISO(), days);
  mine('events')
    .filter(e => String(e.external_id || '').startsWith('g:'))
    .filter(e => e.day >= fromDay && e.day <= toDay)
    .filter(e => !seen.has(e.external_id))
    .forEach(e => {
      // Remote deletion: drop it locally WITHOUT queueing a Google delete,
      // since Google is where it already went away.
      const ext = e.external_id;
      suppressDeleteQueue = true;
      try { remove('events', e.id); } finally { suppressDeleteQueue = false; }
      delete marks[ext];
    });

  return n;
}

// ------------------------------------------------------------- writing back
//
// Two-way sync, one-off events only for now (routines need
// routines.external_id, added by supabase-schema-v7-two-way-sync.sql).
//
// The two things that make this hard, and how they are handled:
//
// LOOPS. Pushing a change to Google makes Google's copy look "newly
// updated", so the next pull would treat it as a remote change and write it
// straight back. After every push the resulting Google timestamp is recorded
// in `marks`, and the pull ignores anything whose timestamp still matches.
//
// CONFLICTS. If a block changed on BOTH sides since the last sync, the more
// recent edit wins — compared on real timestamps, not on which side we
// happened to look at first.
//
// `marks` is deliberately device-local (IndexedDB, not a synced table): it
// records what THIS device last saw, and adding columns to the shared
// schema for it would be a migration for no benefit.
const MARKS_KEY = 'google.syncMarks';     // externalId -> { g, l }
const DELETES_KEY = 'google.pendingDeletes';

// Set while the pull half removes an event that Google already deleted.
// Without it, cleaning up after a remote deletion would queue a delete
// back TO Google for an event that is already gone.
let suppressDeleteQueue = false;

async function loadMarks() { return (await metaGet(MARKS_KEY, {})) || {}; }
async function saveMarks(m) { await metaSet(MARKS_KEY, m); }

// state.js calls this when a Google-linked row is deleted locally. The row is
// about to vanish from memory, so the intent is parked here and drained on
// the next sync.
export async function queueGoogleDelete(table, row) {
  if (suppressDeleteQueue) return;
  if (table !== 'events') return;                 // routines are not pushed yet
  const id = String(row.external_id || '');
  if (!id.startsWith('g:')) return;
  const q = (await metaGet(DELETES_KEY, [])) || [];
  if (!q.includes(id)) q.push(id);
  await metaSet(DELETES_KEY, q);
}

const gid = externalId => String(externalId || '').replace(/^g:/, '');

// Cadence stores local calendar days plus minutes-from-midnight; Google wants
// real timestamps with an offset. Building a Date in local time and letting
// toISOString convert is what keeps a 9am block 9am in the user's zone.
function toGoogleTimes(ev) {
  const [y, m, d] = String(ev.day).split('-').map(Number);
  const start = new Date(y, m - 1, d, Math.floor(ev.start_min / 60), ev.start_min % 60);
  const endMin = Math.max(ev.start_min + 5, ev.end_min);
  const end = new Date(y, m - 1, d, Math.floor(endMin / 60), endMin % 60);
  return {
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() }
  };
}

function toGoogleBody(ev) {
  return { summary: ev.title || 'Busy', description: ev.notes || undefined, ...toGoogleTimes(ev) };
}

async function gfetch(token, path, init = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
}

// Push local creates, edits and deletes up to Google. Returns how many rows
// were written, so a sync that only pushed still counts as having done work.
async function pushLocalChanges(token, calendarId, marks) {
  let pushed = 0;

  // --- deletes first, so a delete-then-recreate cannot resurrect a row ---
  const pending = (await metaGet(DELETES_KEY, [])) || [];
  const stillPending = [];
  for (const extId of pending) {
    try {
      const res = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(gid(extId))}`, { method: 'DELETE' });
      // 410 Gone / 404 mean it is already not there, which is the goal.
      if (res.ok || res.status === 410 || res.status === 404) { delete marks[extId]; pushed++; }
      else if (res.status === 401 || res.status === 403) { stillPending.push(extId); break; }
      else stillPending.push(extId);
    } catch { stillPending.push(extId); }
  }
  await metaSet(DELETES_KEY, stillPending);

  // --- creates and updates ---
  for (const ev of mine('events')) {
    const ext = String(ev.external_id || '');
    const localStamp = ev.updated_at || '';

    if (!ext) {
      // Born in Cadence — create it in Google and remember the link.
      try {
        const res = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: 'POST', body: JSON.stringify(toGoogleBody(ev))
        });
        if (!res.ok) continue;
        const created = await res.json();
        const newExt = 'g:' + created.id;
        const row = save('events', { id: ev.id, external_id: newExt }, { silent: true });
        // save() bumps updated_at, so mark against the POST-save stamp or the
        // next sync sees a phantom local change and PATCHes for nothing.
        marks[newExt] = { g: created.updated || '', l: row.updated_at || '' };
        pushed++;
      } catch { /* offline or refused — next sync retries */ }
      continue;
    }

    if (!ext.startsWith('g:')) continue;
    const mark = marks[ext];
    // Unchanged locally since the last sync — nothing to say.
    if (mark && mark.l === localStamp) continue;

    try {
      const res = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(gid(ext))}`, {
        method: 'PATCH', body: JSON.stringify(toGoogleBody(ev))
      });
      if (!res.ok) continue;
      const updated = await res.json();
      marks[ext] = { g: updated.updated || '', l: localStamp };
      pushed++;
    } catch { /* retry next sync */ }
  }

  return pushed;
}


// ------------------------------------------------------- routines -> Google
//
// A Cadence routine ("gym, weekdays, 6-6:45") maps onto a single recurring
// Google event with an RRULE, not 250 copies.
//
// This half stays dormant until routines.external_id exists in the database
// (supabase-schema-v7-two-way-sync.sql). Without that column there is nowhere
// to persist which Google event a routine maps to, and every sync would
// create a fresh duplicate. Rather than fail loudly or corrupt the calendar,
// it probes once and switches itself on when the column appears.
const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

let routineColumn = null;   // null = unknown, true/false once probed

async function routinesSupportSync() {
  if (routineColumn !== null) return routineColumn;
  try {
    const { error } = await sb.from('routines').select('external_id').limit(1);
    // 42703 = undefined_column. Anything else (including RLS returning no
    // rows) means the column is there.
    routineColumn = !(error && (error.code === '42703' || /external_id/.test(error.message || '')));
  } catch {
    routineColumn = false;
  }
  return routineColumn;
}

// Lets the app re-probe after the migration is applied without a reinstall.
export function resetRoutineSyncProbe() { routineColumn = null; }

function toRecurrence(routine) {
  const days = (routine.days || []).map(d => DOW[d]).filter(Boolean);
  if (!days.length) return null;
  return [`RRULE:FREQ=WEEKLY;BYDAY=${days.join(',')}`];
}

// A recurring event still needs a concrete first occurrence. Anchor it to the
// next day that actually matches the routine's weekday set, so Google does not
// invent an instance on a day the routine never runs.
function firstOccurrence(routine) {
  const days = routine.days || [];
  if (!days.length) return null;
  for (let i = 0; i < 14; i++) {
    const day = addDays(todayISO(), i);
    const [y, m, d] = day.split('-').map(Number);
    if (days.includes(new Date(y, m - 1, d).getDay())) return day;
  }
  return null;
}

function routineBody(routine) {
  const recurrence = toRecurrence(routine);
  const day = firstOccurrence(routine);
  if (!recurrence || !day) return null;
  const [y, m, d] = day.split('-').map(Number);
  const endMin = Math.max(routine.start_min + 5, routine.end_min);
  return {
    summary: routine.title || 'Routine',
    description: routine.notes || undefined,
    start: { dateTime: new Date(y, m - 1, d, Math.floor(routine.start_min / 60), routine.start_min % 60).toISOString() },
    end: { dateTime: new Date(y, m - 1, d, Math.floor(endMin / 60), endMin % 60).toISOString() },
    recurrence
  };
}

async function pushRoutines(token, calendarId, marks) {
  if (!(await routinesSupportSync())) return 0;
  let pushed = 0;

  for (const r of mine('routines')) {
    const body = routineBody(r);
    if (!body) continue;                      // no weekdays set — nothing to express
    const ext = String(r.external_id || '');
    const localStamp = r.updated_at || '';

    if (!ext) {
      try {
        const res = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: 'POST', body: JSON.stringify(body)
        });
        if (!res.ok) continue;
        const created = await res.json();
        const newExt = 'g:' + created.id;
        const row = save('routines', { id: r.id, external_id: newExt }, { silent: true });
        marks[newExt] = { g: created.updated || '', l: row.updated_at || '' };
        pushed++;
      } catch { /* retry next sync */ }
      continue;
    }

    if (!ext.startsWith('g:')) continue;
    if (marks[ext] && marks[ext].l === localStamp) continue;   // unchanged here
    try {
      const res = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(gid(ext))}`, {
        method: 'PATCH', body: JSON.stringify(body)
      });
      if (!res.ok) continue;
      const updated = await res.json();
      marks[ext] = { g: updated.updated || '', l: localStamp };
      pushed++;
    } catch { /* retry next sync */ }
  }

  return pushed;
}

// ---------------------------------------------------------------- live sync
//
// The quiet background version of importGoogle: safe to call as often as you
// like, never throws, never nags. app.js calls it on launch, on a timer, and
// whenever the device comes back online, so Google events show up on their
// own instead of waiting for someone to find an import button.
//
// KNOWN LIMIT: Supabase hands back Google's access token but does not refresh
// it, and Google expires those after about an hour. When that happens the API
// starts returning 401 and syncing stops until the user signs in with Google
// again. Fixing it properly means exchanging the refresh token server-side
// (a Supabase Edge Function), which is a separate piece of work.
const SYNC_EVERY_MS = 10 * 60 * 1000;

let lastSyncAt = 0;
let blocked = null;   // 'needs-calendar-consent' | 'calendar-api-disabled' | 'expired'
let inFlight = false;

// Why the background sync is currently not running, or null if it is fine.
// Settings uses this to explain itself instead of silently doing nothing.
export function googleSyncBlockedReason() { return blocked; }

// Called after the user grants calendar access, so the next tick tries again
// instead of staying latched off.
export function resetGoogleSyncBlock() { blocked = null; lastSyncAt = 0; }

export async function syncGoogleCalendar({ force = false } = {}) {
  // A guest has no account to sync into, and nothing is persisted anyway.
  if (S.guest) return 0;
  if (inFlight) return 0;
  if (!navigator.onLine) return 0;
  // Latched off after a failure that repeating cannot fix — the user has to
  // grant consent or enable the API first. force bypasses it after they do.
  if (blocked && !force) return 0;
  if (!force && Date.now() - lastSyncAt < SYNC_EVERY_MS) return 0;

  const token = await providerToken();
  if (!token) return 0;          // password account, or not signed in with Google

  inFlight = true;
  try {
    const marks = await loadMarks();
    // Pull first so the push sees the freshest remote state, then push local
    // work up. Both directions share `marks`, which is what stops a change
    // that just came down from being sent straight back up again.
    const pulled = await importGoogle({ days: 30, marks });
    const pushed = await pushLocalChanges(token, 'primary', marks);
    const pushedRoutines = await pushRoutines(token, 'primary', marks);
    await saveMarks(marks);
    lastSyncAt = Date.now();
    blocked = null;
    return pulled + pushed + pushedRoutines;
  } catch (err) {
    if (err?.code === 'needs-calendar-consent') blocked = 'needs-calendar-consent';
    else if (err?.code === 'calendar-api-disabled') blocked = 'calendar-api-disabled';
    else if (/expired/i.test(err?.message || '')) blocked = 'expired';
    // Anything else (a flaky network, a 500 from Google) is not latched —
    // it just means this tick failed and the next one should try again.
    return 0;
  } finally {
    inFlight = false;
  }
}

// Deleting a Cadence block must delete it in Google too, not just locally.
setLocalDeleteHook(queueGoogleDelete);
