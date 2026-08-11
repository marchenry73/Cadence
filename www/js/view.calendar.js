// Calendar — week grid, month grid, agenda list. All three read the same
// occurrencesOn() selector as Today, so nothing can disagree about what's
// scheduled where.
import { S, weekDays, monthGrid, occurrencesOn, dayLoad, catColor, save } from './state.js';
import { t, dateLabel, monthLabel } from './i18n.js';
import { esc, fmtRange, fmtTime, todayISO, addDays, fromISO, iso, hexA, snap, DAY_MINUTES } from './util.js';
import { openBlockSheet } from './sheets.js';
import { registerActions, haptic, toast } from './ui.js';

const WEEK_PPH = 44;

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
    const newStart = Math.max(0, Math.min(DAY_MINUTES - dur, snap((rel / WEEK_PPH) * 60, 15)));
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

function weekView() {
  const days = weekDays();
  const pph = WEEK_PPH;
  const hours = Array.from({ length: 25 }, (_, h) => `<div class="wk-hour" style="top:${h * pph}px">
    <span>${h < 24 ? esc(fmtTime(h * 60, S.prefs.clock24)) : ''}</span></div>`).join('');

  const cols = days.map(d => {
    const occ = occurrencesOn(d);
    const blocks = occ.map(o => {
      const top = (o.start / 60) * pph, h = Math.max(18, ((o.end - o.start) / 60) * pph - 2);
      const color = catColor(o.category_id);
      return `<button class="wk-block tap" data-act="openBlockOn" data-day="${d}" data-key="${esc(o.key)}"
        style="top:${top}px;height:${h}px;background:${hexA(color, .22)};border-color:${hexA(color, .5)}">
        <span class="wk-block-title">${esc(o.title)}</span>
      </button>`;
    }).join('');
    return `<div class="wk-col${d === todayISO() ? ' is-today' : ''}" data-act="pickDayFromWeek" data-day="${d}">
      <div class="wk-col-head">
        <div class="wk-dow">${esc(dateLabel(d, { weekday: 'short' }))}</div>
        <div class="wk-num${d === todayISO() ? ' today' : ''}">${Number(d.slice(8))}</div>
      </div>
      <div class="wk-body" style="height:${24 * pph}px">${blocks}</div>
    </div>`;
  }).join('');

  return `<div class="week-wrap">
    <div class="wk-gutter" style="padding-top:34px">${hours}</div>
    <div class="wk-grid">${cols}</div>
  </div>`;
}

function monthView() {
  const grid = monthGrid();
  const anchor = fromISO(S.day).getMonth();
  return `<div class="month-head">
      <button class="icon-btn" data-act="monthShift" data-dir="-1">‹</button>
      <span class="month-label">${esc(monthLabel(S.day))}</span>
      <button class="icon-btn" data-act="monthShift" data-dir="1">›</button>
    </div>
    <div class="month-grid">
      ${grid.map(d => {
        const inMonth = fromISO(d).getMonth() === anchor;
        const occ = occurrencesOn(d);
        const dots = occ.slice(0, 3).map(o => `<i style="background:${catColor(o.category_id)}"></i>`).join('');
        return `<button class="month-cell tap${inMonth ? '' : ' out'}${d === todayISO() ? ' is-today' : ''}"
          data-act="pickDayFromMonth" data-day="${d}">
          <span class="mc-num">${Number(d.slice(8))}</span>
          <span class="mc-dots">${dots}</span>
        </button>`;
      }).join('')}
    </div>`;
}

function agendaView() {
  const start = todayISO();
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const withStuff = days.filter(d => occurrencesOn(d).length);
  if (!withStuff.length) return `<div class="empty-state">${esc(t('cal.empty'))}</div>`;
  return withStuff.map(d => `
    <div class="agenda-day">
      <div class="agenda-date">${esc(dateLabel(d))}</div>
      ${occurrencesOn(d).map(o => `
        <button class="agenda-row tap" data-act="openBlockOn" data-day="${d}" data-key="${esc(o.key)}">
          <span class="agenda-bar" style="background:${catColor(o.category_id)}"></span>
          <span class="agenda-time mono">${esc(fmtRange(o.start, o.end, S.prefs.clock24))}</span>
          <span class="agenda-title">${esc(o.title)}</span>
        </button>`).join('')}
    </div>`).join('');
}

export default {
  id: 'calendar',
  render() {
    return `<div class="pad-h">
      ${modeTabs()}
      <div class="cal-body">
        ${S.calMode === 'week' ? weekView() : S.calMode === 'month' ? monthView() : agendaView()}
      </div>
    </div>`;
  },
  onMount(root) { if (S.calMode === 'week') installWeekDrag(root); }
};

registerActions({
  calMode: d => { S.calMode = d.mode; window.cadenceRerender(); },
  pickDayFromWeek: d => window.cadenceGoDay(d.day, 'today'),
  pickDayFromMonth: d => window.cadenceGoDay(d.day, 'today'),
  monthShift: d => { S.day = addDays(S.day, Number(d.dir) * 28); window.cadenceRerender(); },
  openBlockOn: (d, node) => {
    if (d.justDragged) { delete node.dataset.justDragged; return; }   // ignore the click after a drag
    const occ = occurrencesOn(d.day).find(o => o.key === d.key);
    if (occ) { haptic('light'); openBlockSheet({ occ, day: d.day }); }
  }
});
