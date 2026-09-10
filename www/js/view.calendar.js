// Calendar — week grid, month grid, agenda list. All three read the same
// occurrencesOn() selector as Today, so nothing can disagree about what's
// scheduled where.
import { S, weekDays, monthGrid, occurrencesOn, dayLoad, catColor, catById, categoryTotals, save, isBlockDone } from './state.js';
import { t, dateLabel, monthLabel, monthParts, dayNames } from './i18n.js';
import { esc, fmtRange, fmtTime, fmtDur, todayISO, addDays, fromISO, iso, hexA, snap, minutesNow, DAY_MINUTES } from './util.js';
import { openBlockSheet } from './sheets.js';
import { registerActions, haptic, toast, openSheet } from './ui.js';
import { packOverlaps, laneStyle, revealMinute, openingMinute, capDensity, overflowW, typeScale, GAP_PX, offHoursBand, inFocusMin, placeInGrid } from './layout.js';
import { whenLabel } from './search.js';

// The week grid ignored the density preference entirely.
// Settings offers Comfortable / Compact, Today honours it (68px vs 52px per
// hour), and the week view - the densest surface in the app, the one where
// the setting matters most - was pinned at 44 and never read it. Choosing
// Compact changed one screen out of two.
//
// Week stays tighter than Today at both steps because it carries seven
// columns rather than one, and Compact keeps the 44 it always had, so the
// existing look is preserved for anyone who had chosen it.
const weekPph = () => S.prefs.density === 'compact' ? 44 : 56;

// Drag a block sideways onto another day column (and up/down to retime it).
// Dropping on a different day moves the block to that day; a routine
// occurrence becomes a one-off on the new day, leaving the series alone.
function installWeekDrag(root) {
  const grid = root.querySelector('.wk-grid');
  if (!grid) return;
  const cols = () => [...grid.querySelectorAll('.wk-col')];
  const colAt = x => cols().find(c => {
    const r = c.getBoundingClientRect();
    return x >= r.left && x <= r.right;
  }) || null;

  let el = null, sx = 0, sy = 0, offY = 0, moved = false, fromDay = '';

  grid.addEventListener('pointerdown', e => {
    const b = e.target.closest('.wk-block');
    if (!b) return;
    el = b; sx = e.clientX; sy = e.clientY; moved = false;
    fromDay = b.dataset.day;
    offY = e.clientY - b.getBoundingClientRect().top;
    b.setPointerCapture?.(e.pointerId);
  });

  grid.addEventListener('pointermove', e => {
    if (!el) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    if (!moved) { moved = true; el.classList.add('is-dragging'); haptic('light'); }
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    const over = colAt(e.clientX);
    cols().forEach(c => c.classList.toggle('drop-target', c === over && c.dataset.day !== fromDay));
  });

  const finish = e => {
    if (!el) return;
    const node = el; el = null;
    node.classList.remove('is-dragging');
    node.style.transform = '';
    cols().forEach(c => c.classList.remove('drop-target'));
    if (!moved) return;
    node.dataset.justDragged = '1';
    const col = colAt(e.clientX);
    const bodyEl = col?.querySelector('.wk-body');
    if (!col || !bodyEl) return;
    const toDay = col.dataset.day;
    const occ = occurrencesOn(fromDay).find(o => o.key === node.dataset.key);
    if (!occ) return;
    const dur = occ.end - occ.start;
    const rel = e.clientY - offY - bodyEl.getBoundingClientRect().top;
    const newStart = Math.max(0, Math.min(DAY_MINUTES - dur, snap((rel / weekPph()) * 60, 15)));
    if (toDay === fromDay && newStart === occ.start) return;
    if (occ.kind === 'routine') {
      save('events', {
        title: occ.title, day: toDay, start_min: newStart, end_min: newStart + dur,
        category_id: occ.category_id, routine_id: occ.routine_id, notes: occ.notes
      });
    } else {
      save('events', { id: occ.id, day: toDay, start_min: newStart, end_min: newStart + dur });
    }
    haptic('success');
    toast(toDay === fromDay ? t('msg.saved') : `Moved to ${dateLabel(toDay, { weekday: 'short' })}`, 'good');
    window.cadenceRerender();
  };
  grid.addEventListener('pointerup', finish);
  grid.addEventListener('pointercancel', finish);
}

function modeTabs() {
  return `<div class="segmented cal-modes">
    ${['week', 'month', 'agenda'].map(m => `<button class="seg-item${S.calMode === m ? ' on' : ''}"
      data-act="calMode" data-mode="${m}">${esc(t('cal.' + m))}</button>`).join('')}
  </div>`;
}

// Which period you are looking at, and how to leave it. Agenda is a rolling
// horizon from today rather than a period, so it gets no stepper.
function periodNav() {
  if (S.calMode === 'agenda') return '';
  const week = S.calMode === 'week';
  const days = week ? weekDays(S.calWeekOffset) : null;
  const label = week
    ? `${dateLabel(days[0], { month: 'short', day: 'numeric' })} – ${dateLabel(days[6], { month: 'short', day: 'numeric' })}`
    : monthLabel(S.day);
  const here = week ? S.calWeekOffset === 0 : S.day.slice(0, 7) === todayISO().slice(0, 7);
  return `<div class="cal-nav">
    <button class="icon-btn" data-act="calStep" data-dir="-1"
      aria-label="${esc(week ? t('cal.prevWeek') : t('cal.prevMonth'))}">‹</button>
    <button class="cal-period tap" data-act="calToday" ${here ? 'disabled' : ''}>
      <span>${esc(label)}</span>
    </button>
    <button class="icon-btn" data-act="calStep" data-dir="1"
      aria-label="${esc(week ? t('cal.nextWeek') : t('cal.nextMonth'))}">›</button>
  </div>`;
}

// Where the week actually goes, shown above the grid you are already
// looking at. The Review screen answers this backwards ("what happened");
// this answers it forwards ("what have I committed to"), which is the
// question you have while planning rather than after the fact.
//
// Hours come from the same categoryTotals() the Review uses, so the two
// screens can never disagree about the same week.
function weekSummary(days) {
  const { planned } = categoryTotals(days);
  const rows = Object.entries(planned)
    .map(([id, mins]) => ({
      id,
      mins,
      name: id === 'none' ? t('common.none') : (catById(id)?.name || t('common.none')),
      color: id === 'none' ? 'var(--text-faint)' : catColor(id)
    }))
    .filter(r => r.mins > 0)
    .sort((a, b) => b.mins - a.mins);

  const committed = rows.reduce((a, b) => a + b.mins, 0);
  // Waking hours, not all 168 — "free" against a number that includes
  // sleep would flatter every week into looking wide open.
  const wakingWeek = 16 * 60 * days.length;
  const open = Math.max(0, wakingWeek - committed);

  if (!rows.length) {
    return `<div class="wk-summary"><div class="wk-sum-empty">${esc(t('cal.emptyWeek'))}</div></div>`;
  }

  return `<div class="wk-summary">
    <div class="wk-sum-head">
      <span class="eyebrow">${esc(t('cal.weekShape'))}</span>
      <span class="dim small mono">${esc(fmtDur(committed))} ${esc(t('today.committed').toLowerCase())} · ${esc(fmtDur(open))} ${esc(t('today.open').toLowerCase())}</span>
    </div>
    <div class="wk-bar">
      ${rows.map(r => `<i style="width:${(r.mins / committed * 100).toFixed(2)}%;background:${r.color}" title="${esc(r.name)}"></i>`).join('')}
    </div>
    <div class="wk-chips">
      ${rows.map(r => `<span class="wk-chip">
        <i style="background:${r.color}"></i>${esc(r.name)}
        <b class="mono">${esc(fmtDur(r.mins))}</b>
      </span>`).join('')}
    </div>
  </div>`;
}

function weekView() {
  const days = weekDays(S.calWeekOffset);
  const pph = weekPph();
  // Same two layers as the Today spine, built from the same helper, so the
  // two grids cannot drift apart on a case one of them handles.
  const wkRules = `repeating-linear-gradient(to bottom, var(--line-hour) 0, var(--line-hour) 1px, transparent 1px, transparent ${pph}px)`;
  const nowMin = minutesNow();
  const today = todayISO();
  const weekHasToday = days.includes(today);
  const nowTop = (nowMin / 60) * pph;

  // Real column width, so "can this be read?" is answered by measurement
  // rather than a guess. Derived from the live scroller rather than a
  // post-mount measure and re-render, which would paint the wrong density
  // for a frame on every render.
  const scrollerW = document.getElementById('scroller')?.clientWidth || 760;
  const hPad = window.matchMedia('(min-width:960px)').matches ? 64 : 32;
  // Read once for the whole grid rather than per column: the px numbers
  // below were all measured at a 16px root, and the gutter (.wk-gutter) is
  // 3.25rem now, so at a larger browser font it is wider than 52.
  const scale = typeScale();
  const chipW = overflowW(scale);
  const colW = Math.max(60, (scrollerW - hPad - 52 * scale) / 7);

  // Gutter labels within ~12 minutes of the now-line step aside so the live
  // time can take that slot — the axis should never read "2pm" beside a
  // line that says 2:17.
  const hours = Array.from({ length: 25 }, (_, h) => {
    const hide = weekHasToday && Math.abs(h * 60 - nowMin) < 12;
    return `<div class="wk-hour${hide ? ' is-hidden' : ''}" style="top:${h * pph}px">
    <span>${h < 24 ? esc(fmtTime(h * 60, S.prefs.clock24)) : ''}</span></div>`;
  }).join('');
  const nowGutter = weekHasToday
    ? `<div class="wk-now-time mono" style="top:${nowTop}px" aria-hidden="true">${esc(fmtTime(nowMin, S.prefs.clock24))}</div>`
    : '';

  const cols = days.map(d => {
    const isToday = d === today;
    const dow = fromISO(d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    // Concurrent meetings sit side by side until side by side stops being
    // readable; past that they collapse to a count. See capDensity().
    const dayHasFuture = occurrencesOn(d).some(o => o.end > nowMin);
    const { shown, piles } = capDensity(packOverlaps(occurrencesOn(d)), colW, scale);
    const blocks = shown.map((o, i) => {
      const { top, height: h } = placeInGrid(o.start, o.end, pph, 16, 2);
      const color = catColor(o.category_id);
      // A capped cluster gives up one chip-width, shared across its lanes.
      const { left, width: w, z } = laneStyle(o, GAP_PX, 0, o.capped ? chipW : 0);
      // Every threshold here is a height that text of a GIVEN SIZE fits in,
      // so all three scale with the reader's font. Left fixed, a 24px root
      // asks a 50px block to hold two 20.6px lines plus a time and cuts the
      // title mid-glyph. The 16px placement floor above is NOT scaled: it is
      // the duration made visible, and a 15-minute block that grows stops
      // telling the truth about its length.
      const tight = h < 32 * scale;            // no room for a second line
      const lines = h >= 76 * scale ? 3 : h >= 50 * scale ? 2 : 1;
      // Elapsed blocks step back so what is left today reads at a glance.
      // Only step back what has elapsed TODAY, and only while today still
      // has something ahead of it. Dimming a wholly-past day distinguishes
      // nothing — its date already says it is behind you — and late in the
      // evening it turned the entire screen grey.
      const past = isToday && dayHasFuture && o.end <= nowMin;
      const fresh = S.lastTouched && S.lastTouched.id === o.id && Date.now() - S.lastTouched.at < 1800;
      // Confirmed-ness is a property of the block, not of the screen it is
      // drawn on, so the week grid reads the same state Today does.
      const done = past && isBlockDone(o, d);
      return `<button class="wk-block tap${tight ? ' is-tight' : ''}${past ? ' is-past' : ''}${done ? ' is-done' : ''}${fresh ? ' is-new' : ''}" data-act="openBlockOn"
        data-day="${d}" data-key="${esc(o.key)}"
        aria-label="${esc(o.title)}, ${esc(fmtRange(o.start, o.end, S.prefs.clock24))}"
        style="top:${top}px;height:${h}px;left:${left};width:${w};z-index:${z + 1};--i:${Math.min(i, 12)};--lines:${lines};--evc:${color}">
        <span class="wk-block-title">${esc(o.title)}</span>
        ${tight ? '' : `<span class="wk-block-time">${esc(fmtTime(o.start, S.prefs.clock24))}</span>`}
      </button>`;
    }).join('');

    // One chip per pile, at the time the pile happens, carrying a dot per
    // category so the mix is legible before you open it.
    const more = piles.map(p => {
      const { top, height: h } = placeInGrid(p.start, p.end, pph, 33 * scale, 2);
      const dots = [...new Set(p.items.map(x => catColor(x.category_id)))].slice(0, 3)
        .map(c => `<i style="background:${c}"></i>`).join('');
      return `<button class="wk-more tap" data-act="showPile" data-day="${d}" data-start="${p.start}" data-end="${p.end}"
        aria-label="${p.items.length} more events between ${esc(fmtRange(p.start, p.end, S.prefs.clock24))}"
        style="top:${top}px;height:${h}px;width:${chipW - 3}px">
        <span class="wm-n">+${p.items.length}</span><span class="wm-dots">${dots}</span>
      </button>`;
    }).join('');
    // One horizon across the whole week at two strengths: full accent on
    // today's column, a ghost on every other — so you get an exact reading
    // on today plus a scan line for the rest, without seven red stripes.
    const nowLine = weekHasToday
      ? `<div class="wk-now${isToday ? ' is-today' : ' is-ghost'}" style="top:${nowTop}px" aria-hidden="true">${isToday ? '<i></i>' : ''}</div>`
      : '';
    // The day name and number navigate; the body below creates. The whole
    // column used to navigate, which meant tapping an empty 2pm on
    // Wednesday jumped to Wednesday and discarded the 2pm.
    return `<div class="wk-col${isToday ? ' is-today' : ''}${isWeekend ? ' is-weekend' : ''}">
      <div class="wk-col-head tap" data-act="pickDayFromWeek" data-day="${d}">
        <div class="wk-dow">${esc(dateLabel(d, { weekday: 'short' }))}</div>
        <div class="wk-num${isToday ? ' today' : ''}">${Number(d.slice(8))}</div>
      </div>
      <div class="wk-body" data-act="wkBodyTap" data-day="${d}" data-pph="${pph}" style="height:${24 * pph}px;background-image:${offHoursBand(S.prefs.focus_start, S.prefs.focus_end, pph)}, ${wkRules}">${nowLine}${blocks}${more}</div>
    </div>`;
  }).join('');

  return `${weekSummary(days)}<div class="week-wrap">
    <div class="wk-gutter">
      <div class="wk-col-head wk-gutter-head" aria-hidden="true"><div class="wk-dow">&nbsp;</div><div class="wk-num">&nbsp;</div></div>
      <div class="wk-gutter-body" style="height:${24 * pph}px">${hours}${nowGutter}</div>
    </div>
    <div class="wk-grid">${cols}</div>
  </div>`;
}

// A month of coloured dots tells you something is happening but never what,
// so every "what's on the 14th?" meant leaving the month to find out. Cells
// now name their events. Narrow screens genuinely cannot fit titles, so they
// keep dots and get a real agenda for the selected day underneath — the
// pattern Apple and Fantastical use, and far more useful than three
// truncated words crammed into a 44px cell.
const MONTH_CHIPS = 3;

function monthView() {
  const grid = monthGrid();
  const anchor = fromISO(S.day).getMonth();
  const dows = dayNames(true, S.prefs.week_starts || 0);

  const cells = grid.map(d => {
    const inMonth = fromISO(d).getMonth() === anchor;
    const occ = occurrencesOn(d);
    const isToday = d === todayISO();
    const isSel = d === S.day;
    const shown = occ.slice(0, MONTH_CHIPS);
    const more = occ.length - shown.length;

    const chips = shown.map(o => `<span class="mc-chip">
        <i style="background:${catColor(o.category_id)}"></i>
        <span class="mc-chip-t">${esc(o.title)}</span>
      </span>`).join('');
    const dots = occ.slice(0, 4).map(o =>
      `<i style="background:${catColor(o.category_id)}"></i>`).join('');

    return `<button class="month-cell tap${inMonth ? '' : ' out'}${isToday ? ' is-today' : ''}${isSel ? ' is-sel' : ''}"
      data-act="pickDayInMonth" data-day="${d}"
      aria-label="${esc(dateLabel(d))}, ${occ.length} scheduled"${isSel ? ' aria-current="date"' : ''}>
      <span class="mc-num">${Number(d.slice(8))}</span>
      <i class="mc-load" style="--load:${Math.min(1, dayLoad(d) / 480).toFixed(3)}" aria-hidden="true"></i>
      <span class="mc-chips">${chips}${more > 0 ? `<span class="mc-more">+${more}</span>` : ''}</span>
      <span class="mc-dots">${dots}</span>
    </button>`;
  }).join('');

  return `<div class="month-head">
      <button class="icon-btn" data-act="monthShift" data-dir="-1" aria-label="Previous month">&lsaquo;</button>
      <span class="month-label"><b>${esc(monthParts(S.day).month)}</b><span>${esc(monthParts(S.day).year)}</span></span>
      <button class="icon-btn" data-act="monthShift" data-dir="1" aria-label="Next month">&rsaquo;</button>
    </div>
    <div class="month-dow">${dows.map(x => `<span>${esc(x)}</span>`).join('')}</div>
    <div class="month-grid">${cells}</div>
    ${monthDayDetail(S.day)}`;
}

// The selected day spelled out under the grid. Carries the month view on
// mobile, where cells are too small for titles; on desktop it saves a view
// switch just to read one day.
function monthDayDetail(day) {
  const occ = occurrencesOn(day);
  const total = occ.reduce((a, o) => a + (o.end - o.start), 0);
  return `<div class="month-detail">
    <div class="section-head">
      <span class="eyebrow">${esc(dateLabel(day))}</span>
      ${occ.length ? `<span class="dim small mono">${esc(fmtDur(total))}</span>` : ''}
    </div>
    ${occ.length ? occ.map(o => `
      <button class="agenda-row tap" data-act="openBlockOn" data-day="${day}" data-key="${esc(o.key)}">
        <span class="agenda-bar" style="background:${catColor(o.category_id)}"></span>
        <span class="agenda-time mono">${esc(fmtRange(o.start, o.end, S.prefs.clock24))}</span>
        <span class="agenda-title">${esc(o.title)}</span>
      </button>`).join('')
      : `<div class="md-empty">${esc(t('cal.empty'))}</div>`}
  </div>`;
}

// An agenda is for scanning "what's coming", so it has to answer *when*
// before *what*. The old version printed a full date on every group and
// nothing else, which reads as a wall of near-identical headers; you had to
// do the date arithmetic yourself to work out that something was tomorrow.
//
// Now: relative day names, a per-day total so you can see a heavy day
// coming, today called out, and blocks that have already finished dimmed
// so "what's left" is visible without reading times.
function agendaView() {
  const start = todayISO();
  const HORIZON = 21;
  const days = Array.from({ length: HORIZON }, (_, i) => addDays(start, i));
  const withStuff = days.filter(d => occurrencesOn(d).length);

  if (!withStuff.length) {
    return `<div class="empty-state">
      <div class="es-title">${esc(t('cal.empty'))}</div>
      <div class="es-body">Nothing scheduled in the next three weeks.</div>
    </div>`;
  }

  const now = minutesNow();
  return `<div class="agenda">${withStuff.map(d => {
    const occ = occurrencesOn(d);
    const isToday = d === start;
    const total = occ.reduce((a, o) => a + (o.end - o.start), 0);
    return `<section class="agenda-day${isToday ? ' is-today' : ''}">
      <header class="agenda-head">
        <span class="agenda-when">${esc(whenLabel(d))}</span>
        <span class="agenda-total mono">${esc(fmtDur(total))}</span>
      </header>
      ${occ.map(o => {
        const past = isToday && o.end <= now;
        const running = isToday && o.start <= now && o.end > now;
        return `<button class="agenda-row tap${past ? ' is-past' : ''}${running ? ' is-running' : ''}"
          data-act="openBlockOn" data-day="${d}" data-key="${esc(o.key)}"
          aria-label="${esc(o.title)}, ${esc(fmtRange(o.start, o.end, S.prefs.clock24))}">
          <span class="agenda-bar" style="background:${catColor(o.category_id)}"></span>
          <span class="agenda-time mono">${esc(fmtTime(o.start, S.prefs.clock24))}</span>
          <span class="agenda-title">${esc(o.title)}</span>
          ${running ? '<span class="agenda-live">now</span>' : ''}
        </button>`;
      }).join('')}
    </section>`;
  }).join('')}</div>`;
}

export default {
  id: 'calendar',
  render() {
    return `<div class="pad-h">
      ${modeTabs()}
      ${periodNav()}
      <div class="cal-body">
        ${S.calMode === 'week' ? weekView() : S.calMode === 'month' ? monthView() : agendaView()}
      </div>
    </div>`;
  },
  onMount(root) {
    if (S.calMode !== 'week') return;
    installWeekDrag(root);
    const body = root.querySelector('.wk-body');
    if (!body) return;
    // Same reveal as Today: open on the live hours, not on midnight.
    // revealMinute schedules its own retries; an rAF wrapper here would
    // never fire in a hidden tab.
    const days = weekDays(S.calWeekOffset);
    const starts = days.flatMap(d => occurrencesOn(d).map(o => o.start));
    revealMinute(
      root.closest('.screen-scroll'), body,
      openingMinute({
        isToday: days.includes(todayISO()),
        nowMin: minutesNow(),
        firstEventMin: starts.length ? Math.min(...starts) : null,
        focusStart: S.prefs.focus_start
      }),
      weekPph()
    );
  }
};

registerActions({
  calMode: d => { S.calMode = d.mode; window.cadenceRerender(); },
  // Week steps the calendar cursor; month steps the anchor day, because
  // monthGrid() is built from S.day rather than from an offset. Stepping by
  // month means landing on the 1st, so a 31st never slides into the wrong
  // month on the way past a short one.
  calStep: d => {
    const dir = Number(d.dir);
    if (S.calMode === 'week') { S.calWeekOffset += dir; }
    else {
      const a = fromISO(S.day);
      S.day = iso(new Date(a.getFullYear(), a.getMonth() + dir, 1));
    }
    window.cadenceRerender();
  },
  calToday: () => {
    S.calWeekOffset = 0;
    S.day = todayISO();
    window.cadenceRerender();
  },
  // The pile chip opens what it was standing in for. A sheet rather than a
  // jump to the day, because the question being asked is "what else is at
  // 10am?" — answering it should not cost you the week you were reading.
  showPile: d => {
    const from = Number(d.start), to = Number(d.end);
    const items = occurrencesOn(d.day)
      .filter(o => o.start < to && o.end > from)
      .sort((a, b) => a.start - b.start);
    openSheet({
      title: dateLabel(d.day, { weekday: 'long', month: 'short', day: 'numeric' }),
      body: `<div class="pile-list">${items.map(o => `
        <button class="pile-row tap" data-act="openBlockOn" data-day="${d.day}" data-key="${esc(o.key)}">
          <span class="pile-rail" style="background:${catColor(o.category_id)}"></span>
          <span class="pile-main">
            <span class="pile-title">${esc(o.title)}</span>
            <span class="pile-time mono">${esc(fmtRange(o.start, o.end, S.prefs.clock24))}</span>
          </span>
        </button>`).join('')}</div>`
    });
  },
  pickDayFromWeek: d => window.cadenceGoDay(d.day, 'today'),
  // The week grid's answer to spineTap. Same guard: a tap that landed on a
  // block is that block's, not a request for a new one on top of it.
  wkBodyTap: (d, node, ev) => {
    if (ev.target !== node) return;
    const rect = node.getBoundingClientRect();
    const pph = Number(node.dataset.pph);
    if (!pph) return;
    const min = snap(((ev.clientY - rect.top) / pph) * 60, 15);
    haptic('light');
    openBlockSheet({ day: d.day, start: Math.max(0, Math.min(1410, min)) });
  },
  pickDayFromMonth: d => window.cadenceGoDay(d.day, 'today'),
  // Stay in the month while browsing days; the detail list updates in place.
  // Jumping straight to Today made the grid useless for scanning a month.
  pickDayInMonth: d => { S.day = d.day; window.cadenceRerender(); },
  // Real calendar-month arithmetic, not a fixed day offset — a 28/30/31-day
  // jump drifts and can even fail to cross into the next month at all.
  monthShift: d => {
    const cur = fromISO(S.day);
    S.day = iso(new Date(cur.getFullYear(), cur.getMonth() + Number(d.dir), 1));
    window.cadenceRerender();
  },
  openBlockOn: (d, node) => {
    if (d.justDragged) { delete node.dataset.justDragged; return; }   // ignore the click after a drag
    const occ = occurrencesOn(d.day).find(o => o.key === d.key);
    if (occ) { haptic('light'); openBlockSheet({ occ, day: d.day }); }
  }
});
