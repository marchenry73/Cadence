// Google Calendar, read-only — kept live in the background.
//
// Sign-in deliberately does NOT ask for calendar access (that is a
// sensitive scope; see auth.js), so the first sync asks for it separately.
// Once granted, syncGoogleCalendar() runs on launch and on a timer, so
// Google events simply appear rather than waiting for anyone to press an
// import button. Password accounts fall back to the .ics import.
import { S, save, remove, mine } from './state.js';
import { providerToken } from './auth.js';
import { todayISO, addDays } from './util.js';

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
export async function importGoogle({ calendarId = 'primary', days = 30 } = {}) {
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

  const existing = new Map(mine('events').filter(e => e.external_id).map(e => [e.external_id, e]));
  const seen = new Set();
  let n = 0;
  (json.items || []).forEach(ev => {
    if (!ev.start?.dateTime || !ev.end?.dateTime || ev.status === 'cancelled') return;
    const s = new Date(ev.start.dateTime), e = new Date(ev.end.dateTime);
    const day = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
    const start = s.getHours() * 60 + s.getMinutes();
    const end = Math.min(1440, Math.max(start + 5, e.getHours() * 60 + e.getMinutes() + (e.getDate() !== s.getDate() ? 1440 : 0)));
    const key = 'g:' + ev.id;
    seen.add(key);
    const prev = existing.get(key);
    save('events', {
      id: prev?.id,
      title: ev.summary || 'Busy',
      day, start_min: start, end_min: end,
      notes: ev.location || null,
      external_id: key
    });
    n++;
  });

  // Anything we previously pulled in that Google no longer returns has been
  // deleted or moved out of range on their side, so it should disappear here
  // too. Scoped to the window we just fetched, so events outside it are never
  // touched. Without this, a cancelled meeting would haunt the calendar
  // forever — the whole point of a live sync is that it reflects reality.
  const fromDay = todayISO();
  const toDay = addDays(todayISO(), days);
  let removed = 0;
  mine('events')
    .filter(e => String(e.external_id || '').startsWith('g:'))
    .filter(e => e.day >= fromDay && e.day <= toDay)
    .filter(e => !seen.has(e.external_id))
    .forEach(e => { remove('events', e.id); removed++; });

  return n;
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
    const n = await importGoogle({ days: 30 });
    lastSyncAt = Date.now();
    blocked = null;
    return n;
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
