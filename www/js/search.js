// Find anything, instantly.
//
// The app had no search at all: an event you knew existed could only be
// found by paging through the calendar until you saw it.
//
// Two things make this better than the search in a normal calendar rather
// than merely equal to it:
//
//   1. It searches EVERYTHING — one-off events, recurring routines, tasks
//      and goals. Google and Apple search events only, so "where did I put
//      that thing about the passport?" fails if it happened to be a task.
//
//   2. It is local and synchronous. Every row is already in memory, so
//      results appear as you type with no request and no spinner, and it
//      works offline. That is a direct consequence of the offline-first
//      store, not a trick.
import { S, mine, catById, occurrencesOn } from './state.js';
import { todayISO, addDays, fromISO, esc } from './util.js';
import { openSheet, closeSheet, registerActions, $ } from './ui.js';
import { openBlockSheet } from './sheets.js';


// Case- and accent-insensitive, so "cafe" finds "Café".
const norm = s => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '');

function score(haystack, needle) {
  const h = norm(haystack), n = norm(needle);
  if (!n) return 0;
  const at = h.indexOf(n);
  if (at === -1) return 0;
  // Prefix beats word-start beats anywhere, so typing "st" surfaces
  // "Standup" above "Breakfast".
  if (at === 0) return 3;
  if (/\s/.test(h[at - 1])) return 2;
  return 1;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Tomorrow" reads faster than a date, and for anything further out the
// date plus its weekday beats either alone.
export function whenLabel(day) {
  const today = todayISO();
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  if (day === addDays(today, -1)) return 'Yesterday';
  const diff = Math.round((fromISO(day) - fromISO(today)) / 86400000);
  const d = fromISO(day);
  const label = `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  if (diff > 0 && diff <= 7) return `${label} · in ${diff}d`;
  if (diff < 0 && diff >= -7) return `${label} · ${-diff}d ago`;
  return label;
}

/**
 * @returns {Array<{kind,id,title,sub,day,when,color,key}>} best matches first
 */
export function searchAll(query, limit = 30) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const out = [];
  const col = id => (id ? (catById(id)?.color || null) : null);

  // --- one-off events, dated so they can be jumped to ---
  for (const e of mine('events')) {
    const s = score(e.title, q) * 2 + score(e.notes, q);
    if (!s) continue;
    out.push({
      kind: 'event', id: e.id, title: e.title, day: e.day,
      sub: catById(e.category_id)?.name || '', color: col(e.category_id),
      when: whenLabel(e.day), key: 'e:' + e.id, sort: s
    });
  }

  // --- routines: no single date, so say the shape instead ---
  for (const r of mine('routines')) {
    const s = score(r.title, q) * 2 + score(r.notes, q);
    if (!s) continue;
    const days = (r.days || []).map(d => DOW[d]).join(' ');
    // Jump to the next day this routine actually runs, so tapping a result
    // lands somewhere it is visible rather than on an arbitrary date.
    let day = todayISO();
    for (let i = 0; i < 8; i++) {
      const cand = addDays(todayISO(), i);
      if ((r.days || []).includes(fromISO(cand).getDay())) { day = cand; break; }
    }
    out.push({
      kind: 'routine', id: r.id, title: r.title, day,
      sub: catById(r.category_id)?.name || '', color: col(r.category_id),
      when: days || 'Routine', key: 'r:' + r.id + ':' + day, sort: s
    });
  }

  // --- tasks: the ones a calendar-only search would miss entirely ---
  for (const tk of mine('tasks')) {
    const s = score(tk.title, q) * 2 + score(tk.notes, q);
    if (!s) continue;
    out.push({
      kind: 'task', id: tk.id, title: tk.title, day: tk.due_date || null,
      sub: tk.done_at ? 'Done' : (catById(tk.category_id)?.name || 'Task'),
      color: col(tk.category_id), done: !!tk.done_at,
      when: tk.due_date ? whenLabel(tk.due_date) : 'No due date',
      key: null, sort: s - (tk.done_at ? 1 : 0)   // finished tasks rank lower
    });
  }

  // --- goals ---
  for (const g of mine('goals')) {
    const s = score(g.title, q) * 2 + score(g.area, q);
    if (!s) continue;
    out.push({
      kind: 'goal', id: g.id, title: g.title, day: g.target_date || null,
      sub: g.area || 'Goal', color: null,
      when: g.target_date ? whenLabel(g.target_date) : 'No target date',
      key: null, sort: s
    });
  }

  return out
    .sort((a, b) => b.sort - a.sort || (a.day || '9999').localeCompare(b.day || '9999'))
    .slice(0, limit);
}

// ------------------------------------------------------------------ the UI
//
// A sheet rather than a route: search is something you do *from* wherever
// you are and then leave, and pushing a whole screen for it would lose the
// context you were searching from.
const ICONS = {
  event: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  routine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6"/><path d="M18 3v4h-4M6 21v-4h4"/></svg>',
  task: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 12l5 5L20 6"/></svg>',
  goal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M5 3v18M5 4h11l-3 4 3 4H5"/></svg>'
};

function resultsHTML(q) {
  const rows = searchAll(q);
  if (q.trim().length < 2) {
    return `<div class="sr-hint">Search events, routines, tasks and goals.</div>`;
  }
  if (!rows.length) {
    return `<div class="sr-hint">Nothing matches “${esc(q.trim())}”.</div>`;
  }
  // A listbox of options, so the selection can move without focus leaving
  // the input the user is typing in.
  return `<div class="sr-list" id="srList" role="listbox" aria-label="Search results">${rows.map((r, i) => `
    <button class="sr-row tap${i === 0 ? ' is-active' : ''}" data-act="searchGo" role="option"
      id="sr-${i}" aria-selected="${i === 0 ? 'true' : 'false'}"
      data-kind="${r.kind}" data-id="${esc(r.id)}"
      data-day="${esc(r.day || '')}" data-key="${esc(r.key || '')}">
      <span class="sr-icon" style="${r.color ? `color:${r.color}` : ''}">${ICONS[r.kind] || ''}</span>
      <span class="sr-main">
        <span class="sr-title${r.done ? ' is-done' : ''}">${esc(r.title)}</span>
        <span class="sr-sub">${esc(r.sub)}</span>
      </span>
      <span class="sr-when mono">${esc(r.when)}</span>
    </button>`).join('')}</div>`;
}

export function openSearch() {
  openSheet({
    title: 'Search',
    body: `
      <div class="field">
        <input class="input" id="searchInput" autocomplete="off" autocapitalize="none"
               placeholder="Find anything…" aria-label="Search"
               role="combobox" aria-expanded="true" aria-controls="srList" aria-autocomplete="list">
      </div>
      <div id="searchResults">${resultsHTML('')}</div>`
  });
  const input = $('#searchInput');
  if (!input) return;
  // Everything is already in memory, so this can run on every keystroke
  // with no debounce and still feel instant.
  // Which result Enter will open. Reset on every re-query, because the row
  // that was third for "den" is not the row that is third for "dent".
  let sel = 0;
  const rowsNow = () => [...document.querySelectorAll('.sr-row')];
  const mark = () => {
    const rows = rowsNow();
    if (!rows.length) { input.removeAttribute('aria-activedescendant'); return; }
    sel = Math.max(0, Math.min(sel, rows.length - 1));
    rows.forEach((r, i) => {
      r.classList.toggle('is-active', i === sel);
      r.setAttribute('aria-selected', i === sel ? 'true' : 'false');
    });
    input.setAttribute('aria-activedescendant', rows[sel].id);
    rows[sel].scrollIntoView({ block: 'nearest' });
  };
  const paint = () => {
    const host = $('#searchResults');
    if (host) host.innerHTML = resultsHTML(input.value);
    sel = 0;
    mark();
  };
  input.addEventListener('input', paint);
  input.addEventListener('keydown', e => {
    const rows = rowsNow();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!rows.length) return;
      e.preventDefault();
      // Wraps, so holding one arrow cannot strand you at an end.
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      mark();
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      if (!rows.length) return;
      e.preventDefault();
      sel = e.key === 'Home' ? 0 : rows.length - 1;
      mark();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // The row the user can SEE is selected, not whatever is first.
      rows[sel]?.click();
    }
  });
  mark();
  setTimeout(() => input.focus(), 60);
}

registerActions({
  openSearch: () => openSearch(),
  searchGo: d => {
    closeSheet();
    if (d.kind === 'task') {
      // A finished task is findable but lives behind the "done" filter,
      // which defaults to "open". Landing on Tasks without switching it
      // showed a screen the result was not on.
      const task = mine('tasks').find(x => x.id === d.id);
      if (task) S.taskFilter = task.done_at ? 'done' : 'open';
      // The same marker blocks already use to point at themselves.
      S.lastTouched = { table: 'tasks', id: d.id, at: Date.now() };
      window.cadenceGoRoute('tasks');
      return;
    }
    if (d.kind === 'goal') {
      S.lastTouched = { table: 'goals', id: d.id, at: Date.now() };
      window.cadenceGoRoute('goals');
      return;
    }
    // Events and routines live on a day, so land on that day with the
    // block already open rather than leaving the user to hunt for it.
    if (d.day) window.cadenceGoDay(d.day, 'today');
    if (d.key) setTimeout(() => {
      const occ = occurrencesOn(d.day).find(o => o.key === d.key);
      if (occ) openBlockSheet({ occ, day: d.day });
    }, 260);
  }
});
