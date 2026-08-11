// Google Calendar, read-only.
// Signing in with Google already asks for calendar.readonly, so importing is
// one API call away — no second consent screen, no OAuth setup of your own.
// Password accounts fall back to the .ics import, which still works everywhere.
import { S, save, mine } from './state.js';
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
  if (!res.ok) throw new Error(res.status === 401 ? 'Google session expired — sign in again' : 'Google refused the request');
  const json = await res.json();

  const existing = new Map(mine('events').filter(e => e.external_id).map(e => [e.external_id, e]));
  let n = 0;
  (json.items || []).forEach(ev => {
    if (!ev.start?.dateTime || !ev.end?.dateTime || ev.status === 'cancelled') return;
    const s = new Date(ev.start.dateTime), e = new Date(ev.end.dateTime);
    const day = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
    const start = s.getHours() * 60 + s.getMinutes();
    const end = Math.min(1440, Math.max(start + 5, e.getHours() * 60 + e.getMinutes() + (e.getDate() !== s.getDate() ? 1440 : 0)));
    const key = 'g:' + ev.id;
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
  return n;
}
