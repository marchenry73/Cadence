// Calendar interchange via .ics — the universal file format Google, Outlook
// and Apple Calendar all read and write. No OAuth or API keys needed, so
// this works today; a live two-way Google Calendar sync (auto-push/pull
// without a file) is a separate project that needs your own Google Cloud
// OAuth credentials — ask if you want that wired in next.
import { S, occurrencesOn, save } from './state.js';
import { todayISO, addDays, fromISO } from './util.js';

const pad = n => String(n).padStart(2, '0');

function toICSDate(dayISO, min) {
  const d = fromISO(dayISO);
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
}

export function buildICS(daysBack = 7, daysAhead = 120) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cadence//EN', 'CALSCALE:GREGORIAN'];
  for (let i = -daysBack; i < daysAhead; i++) {
    const day = addDays(todayISO(), i);
    occurrencesOn(day).forEach(o => {
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + o.key.replace(/[^a-z0-9]/gi, '') + '-' + day + '@cadence');
      lines.push('DTSTAMP:' + toICSDate(todayISO(), 0) + 'Z');
      lines.push('DTSTART:' + toICSDate(day, o.start));
      lines.push('DTEND:' + toICSDate(day, o.end));
      lines.push('SUMMARY:' + String(o.title || '').replace(/\r?\n/g, ' '));
      if (o.notes) lines.push('DESCRIPTION:' + String(o.notes).replace(/\r?\n/g, '\\n'));
      lines.push('END:VEVENT');
    });
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS() {
  const blob = new Blob([buildICS()], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'cadence-calendar.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// A DTSTART comes in three shapes and they mean different things:
//   20260908T140000Z  an instant in UTC - must be converted to local
//   20260908T140000   a floating local wall-clock time - taken as written
//   20260908          a date with no time at all - an all-day event
// Reading the digits and ignoring the Z put every Google and Outlook export
// out by the local offset, silently.
function parseICSDate(v) {
  const raw = String(v || '').trim();
  const dateOnly = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return { day: `${y}-${mo}-${d}`, min: 0, allDay: true };
  }
  const m = raw.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se, zulu] = m;
  if (zulu) {
    // Let Date do the offset, including whatever DST applied on that date.
    const inst = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se || 0)));
    const pad2 = n => String(n).padStart(2, '0');
    return {
      day: `${inst.getFullYear()}-${pad2(inst.getMonth() + 1)}-${pad2(inst.getDate())}`,
      min: inst.getHours() * 60 + inst.getMinutes(),
    };
  }
  return { day: `${y}-${mo}-${d}`, min: Number(h) * 60 + Number(mi) };
}

// Non-recurring VEVENTs import fully. A recurring event (RRULE present)
// imports only its first occurrence — full recurrence expansion is a
// follow-up if you need it.
export function parseICS(text) {
  const out = [];
  const blocks = String(text || '').split('BEGIN:VEVENT').slice(1);
  for (const raw of blocks) {
    const body = raw.split('END:VEVENT')[0];
    const get = key => { const m = body.match(new RegExp('^' + key + '[^:\\r\\n]*:(.+)$', 'm')); return m ? m[1].trim() : null; };
    const start = parseICSDate(get('DTSTART'));
    if (!start) continue;
    const endRaw = parseICSDate(get('DTEND'));
    const summary = (get('SUMMARY') || 'Imported event').replace(/\\,/g, ',').replace(/\\n/g, ' ');
    // An event that runs past midnight keeps the part that belongs to its
    // start day rather than collapsing to a default hour, because a block
    // in this app lives inside one day.
    const end = endRaw
      ? (endRaw.day === start.day ? endRaw.min : 1440)
      : Math.min(1440, start.min + 60);
    out.push({ title: summary, day: start.day, start: start.min, end, allDay: !!start.allDay });
  }
  return out;
}

// Returns { imported, skippedAllDay } rather than a bare count, so the
// caller can tell the user what did not come through. All-day events have
// nowhere to go: this app has no all-day row, and a 00:00-24:00 block would
// collide with everything else on the day and push the rest into pile chips.
// Reporting them is the honest half of the fix; rendering them needs an
// all-day row, which is a feature rather than a repair.
export function importICSEvents(events) {
  let imported = 0, skippedAllDay = 0;
  events.forEach(e => {
    if (e.allDay) { skippedAllDay++; return; }
    if (e.end <= e.start) return;
    save('events', { title: e.title, day: e.day, start_min: e.start, end_min: e.end });
    imported++;
  });
  return { imported, skippedAllDay };
}

export function pickICSFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics,text/calendar';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
