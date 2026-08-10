// Small, dependency-free helpers. Dates are handled as local-time
// calendar days ("YYYY-MM-DD") and minutes-from-midnight integers, so no
// timezone maths ever touches the calendar grid.

export const pad = n => String(n).padStart(2, '0');

export function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  // RFC4122-shaped fallback for old WebViews
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => iso(new Date());

export function fromISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s, n) {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function startOfWeek(s, weekStarts = 0) {
  const d = fromISO(s);
  const shift = (d.getDay() - weekStarts + 7) % 7;
  d.setDate(d.getDate() - shift);
  return iso(d);
}

export const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export const DAY_MINUTES = 1440;

// The app is 24-hour end to end: every grid runs 00:00 → 24:00.
export function fmtTime(min, clock24 = false) {
  const m = ((Math.round(min) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h = Math.floor(m / 60), mm = m % 60;
  if (clock24) return `${pad(h)}:${pad(mm)}`;
  const ap = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return mm ? `${hh}:${pad(mm)}${ap}` : `${hh}${ap}`;
}

export function fmtRange(a, b, clock24) {
  return `${fmtTime(a, clock24)} – ${fmtTime(b, clock24)}`;
}

export function fmtDur(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function parseTime(str, fallback = 540) {
  const s = String(str || '').trim();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return fallback;
  let h = Number(m[1]);
  const mm = Number(m[2] || 0);
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return Math.min(DAY_MINUTES, h * 60 + mm);
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const snap = (v, step) => Math.round(v / step) * step;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0] || '').join('').toUpperCase() || '?';
}

export function hexA(hex, a) {
  const h = String(hex || '#7C6AF0').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function throttle(fn, ms = 60) {
  let last = 0, queued = null;
  return (...a) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...a); }
    else { clearTimeout(queued); queued = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (now - last)); }
  };
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Sort helper that keeps undefined/null last.
export const by = (key, dir = 1) => (a, b) => {
  const x = a[key], y = b[key];
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  return x < y ? -dir : x > y ? dir : 0;
};
