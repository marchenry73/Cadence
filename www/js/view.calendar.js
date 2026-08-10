// Calendar — week grid, month grid, agenda list. All three read the same
// occurrencesOn() selector as Today, so nothing can disagree about what's
// scheduled where.
import { S, weekDays, monthGrid, occurrencesOn, dayLoad, catColor } from './state.js';
import { t, dateLabel, monthLabel } from './i18n.js';
import { esc, fmtRange, fmtTime, todayISO, addDays, fromISO, iso, hexA } from './util.js';
import { openBlockSheet } from './sheets.js';
import { registerActions, haptic } from './ui.js';

function modeTabs() {
  return `<div class="segmented cal-modes">
    ${['week', 'month', 'agenda'].map(m => `<button class="seg-item${S.calMode === m ? ' on' : ''}"
      data-act="calMode" data-mode="${m}">${esc(t('cal.' + m))}</button>`).join('')}
  </div>`;
}

function weekView() {
  const days = weekDays();
  const pph = 44;
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
  }
};

registerActions({
  calMode: d => { S.calMode = d.mode; window.cadenceRerender(); },
  pickDayFromWeek: d => window.cadenceGoDay(d.day, 'today'),
  pickDayFromMonth: d => window.cadenceGoDay(d.day, 'today'),
  monthShift: d => { S.day = addDays(S.day, Number(d.dir) * 28); window.cadenceRerender(); },
  openBlockOn: d => {
    const occ = occurrencesOn(d.day).find(o => o.key === d.key);
    if (occ) { haptic('light'); openBlockSheet({ occ, day: d.day }); }
  }
});
