// "When should I do this?" — the scheduling suggestion engine.
//
// Every other calendar makes you pick a time and then tells you if you were
// wrong. This picks for you: it walks the real open gaps across the next
// several days and scores each candidate slot, so deciding to do something
// and deciding when stop being two separate chores.
//
// Nothing here writes anything. It returns ranked candidates; the caller
// decides what to do with them.
import { S, freeGaps, protectedClash } from './state.js';
import { todayISO, addDays, minutesNow, fromISO, snap } from './util.js';

const DEFAULT_HORIZON = 7;

// Nobody wants to be told to start something at 3am. Suggestions are
// confined to waking hours even when the calendar is technically wide open
// overnight — an empty 2am is not a real opportunity.
const WAKE_START = 6 * 60;    // 06:00
const WAKE_END = 22 * 60;     // 22:00 — must finish by here

// A slot is scored 0–100 on four things people actually care about, in the
// order they care about them. The weights are the opinion: protecting the
// hours you said were yours matters more than shaving a day off the wait.
const W = {
  focus: 34,     // inside the focus window you set in Settings
  daypart: 22,   // matches when this kind of work usually goes well
  soon: 26,      // sooner is better, sharply so when a due date looms
  elbow: 18      // breathing room around it, not wedged between two blocks
};

// Deep/creative work lands better in the morning; admin and errands survive
// the afternoon slump fine. Without a category we stay neutral rather than
// pretending to know.
const MORNING_WORDS = /deep|write|writing|draft|study|read|design|code|plan|think|create/i;
const ERRAND_WORDS = /call|email|admin|errand|shop|clean|tidy|invoice|book|schedule/i;

function daypartFit(title, catName, startMin) {
  const text = `${title || ''} ${catName || ''}`;
  const hour = startMin / 60;
  const morning = hour >= 6 && hour < 12;
  const afternoon = hour >= 12 && hour < 17;
  const evening = hour >= 17 && hour < 22;
  const night = hour >= 22 || hour < 6;

  if (night) return 0;                       // almost never the right answer
  if (MORNING_WORDS.test(text)) return morning ? 1 : afternoon ? 0.45 : 0.25;
  if (ERRAND_WORDS.test(text)) return afternoon ? 1 : morning ? 0.7 : evening ? 0.6 : 0.3;
  return morning ? 0.85 : afternoon ? 0.8 : evening ? 0.6 : 0.2;
}

// How much of the slot sits inside the user's declared focus window.
function focusOverlap(start, end) {
  const fs = S.prefs.focus_start ?? 540, fe = S.prefs.focus_end ?? 1020;
  const overlap = Math.max(0, Math.min(end, fe) - Math.max(start, fs));
  return overlap / Math.max(1, end - start);
}

// Sooner is better, and a due date makes it much better. Anything landing
// after the due date is heavily penalised rather than silently offered.
function soonness(day, dueDate) {
  const dayIdx = Math.round((fromISO(day) - fromISO(todayISO())) / 86400000);
  const base = Math.max(0, 1 - (dayIdx / DEFAULT_HORIZON));
  if (!dueDate) return base;
  if (day > dueDate) return 0;                       // past due — never preferred
  const daysToDue = Math.round((fromISO(dueDate) - fromISO(day)) / 86400000);
  // A day or two of buffer is the sweet spot: not frantic, not forgotten.
  // Landing it ON the due date still beats being late, but leaves no room
  // for the day to go sideways, so it scores a shade lower.
  if (daysToDue === 0) return 0.82;
  if (daysToDue <= 2) return 1;
  return Math.max(base, 1 - (daysToDue / (DEFAULT_HORIZON * 1.5)));
}

// Room to breathe: a slot exactly the size of the task means starting late
// makes you late. More slack (up to ~an hour) reads as more comfortable.
function elbowRoom(gapLen, need) {
  const slack = gapLen - need;
  if (slack <= 0) return 0;
  return Math.min(1, slack / 60);
}

/**
 * Rank the best times to do something.
 *
 * @param {object} opts
 * @param {string} opts.title      what the thing is (used for day-part fit)
 * @param {number} opts.estMin     how long it needs, in minutes
 * @param {string|null} opts.dueDate  'YYYY-MM-DD' or null
 * @param {string|null} opts.categoryId
 * @param {number} opts.horizonDays how many days out to look
 * @param {number} opts.limit      how many suggestions to return
 * @returns {Array<{day,start,end,score,why}>} best first
 */
export function suggestTimes({
  title = '', estMin = 30, dueDate = null, categoryId = null,
  horizonDays = DEFAULT_HORIZON, limit = 3
} = {}) {
  const need = Math.max(5, Number(estMin) || 30);
  const catName = categoryId ? (S.categories.find(c => c.id === categoryId)?.name || '') : '';
  const today = todayISO();
  // An overdue task still needs a slot — arguably more urgently than
  // anything else. Drop the due-date ceiling rather than returning nothing,
  // which is what the "don't suggest past the due date" rule would do here.
  const cap = dueDate && dueDate >= today ? dueDate : null;
  const out = [];

  for (let i = 0; i < horizonDays; i++) {
    const day = addDays(today, i);
    if (cap && day > cap) break;                  // never suggest past the due date

    const isToday = day === today;
    // Don't suggest a start time that has already passed, and give at least
    // 10 minutes of lead time rather than "start this second."
    const earliest = Math.max(WAKE_START, isToday ? snap(minutesNow() + 10, 15) : 0);

    for (const [gapStart, gapEnd] of freeGaps(day, need)) {
      const from = Math.max(gapStart, earliest);
      const gapLen = Math.min(gapEnd, WAKE_END) - from;
      if (gapLen < need) continue;

      // Try the start of the gap, and also the start of the focus window if
      // that falls inside this gap — often a much better answer than "as
      // early as physically possible."
      const candidates = new Set([snap(from, 15)]);
      const fs = S.prefs.focus_start ?? 540;
      if (fs > from && fs + need <= gapEnd) candidates.add(snap(fs, 15));

      for (const start of candidates) {
        const end = start + need;
        if (end > gapEnd || end > WAKE_END) continue;
        if (protectedClash(day, start, end)) continue;

        const parts = {
          focus: focusOverlap(start, end),
          daypart: daypartFit(title, catName, start),
          soon: soonness(day, cap),
          elbow: elbowRoom(gapLen, need)
        };
        const score = Math.round(
          parts.focus * W.focus + parts.daypart * W.daypart +
          parts.soon * W.soon + parts.elbow * W.elbow
        );
        out.push({ day, start, end, score, parts, why: explain(parts, day, cap) });
      }
    }
  }

  out.sort((a, b) => b.score - a.score || a.day.localeCompare(b.day) || a.start - b.start);

  // One suggestion per day at most — three options on the same afternoon is
  // not a real choice.
  const seen = new Set();
  const spread = [];
  for (const s of out) {
    if (seen.has(s.day)) continue;
    seen.add(s.day);
    spread.push(s);
    if (spread.length >= limit) break;
  }
  return spread;
}

// The single most compelling true reason this slot won, so the suggestion
// can justify itself instead of being a black box.
function explain(parts, day, dueDate) {
  if (dueDate && day <= dueDate && parts.soon >= 1) return 'comfortably before it’s due';
  if (parts.focus >= 0.99) return 'inside your focus hours';
  if (parts.daypart >= 0.95) return 'good time of day for this';
  if (parts.elbow >= 0.8) return 'plenty of room around it';
  if (parts.soon >= 0.8) return 'soonest sensible slot';
  if (parts.focus > 0.5) return 'mostly inside your focus hours';
  return 'your next real opening';
}
