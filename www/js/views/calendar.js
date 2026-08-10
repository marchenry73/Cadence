// Calendar: week grid (24h), month grid, agenda list.
import { S, occurrencesOn, weekDays, monthGrid, catColor, workloadWarning } from '../state.js';
import { t, dateLabel, monthLabel } from '../i18n.js';
import { esc, fmtRange, fmtTime, todayISO, addDays, fromISO, iso, DAY_MINUTES, hexA } from '../util.js';
import { registerActions } from '../ui.js';
import { openBlockSheet } from '../sheets.js';

function modeSwitch() {
  return `<div class="segmented cal-modes">
    ${['week', 'month', 'agenda'].map(m => `<button type="button" class="seg-item${S.calMode === m ? ' on' : ''}"
      data-act="calMode" data-mode="${m}">${esc(t('cal.' + m))}</button>`).join('')}
  </div>`;
}

function weekView() {
  const days = weekDays();
  const rows = [];
  for (let h = 0; h < 24; h++) rows.push(h);
  const warn = workloadWarning();

  return `
    ${warn ? `<div class="warnbar">${esc(days.length)} ${esc(t('cal.week'))} — ${warn.length} ${esc(t('cal.today'))}(s) over 10h</div>` : ''}
    <div class="week-nav">
      <button class="icon-btn" data-act="weekStep" data-dir="-1">‹</button>
      <span class="mono">${esc(dateLabel(days[0], { month: 'short', day: 'numeric' }))} – ${esc(dateLabel(days[6], { month: 'short', day: 'numeric' }))}</span>
      <button class="icon-btn" data-act="weekStep" data-dir="1">›</button>
    </div>
    <div class="week-grid-wrap">
      <div class="week-grid" style="grid-template-rows:repeat(24,44px)">
        <div class="wg-corner"></div>
        ${days.map(d => `<div class="wg-head${d === todayISO() ? ' today' : ''}" data-act="jumpDay" data-day="${d}">
          <span class="wd">${esc(dateLabel(d, { weekday: 'short' }))}</span><span class="wn mono">${d.slice(-2).replace(/^0/, '')}</span></div>`).join('')}
        ${rows.map(h => `<div class="wg-time mono">${esc(fmtTime(h * 60, S.prefs.clock24))}</div>`).join('')}
        ${days.map(d => `<div class="wg-col" data-act="wgAdd" data-day="${d}" style="grid-column:${days.indexOf(d) + 2}">
          ${occurrencesOn(d).map(o => {
            const top = (o.start / 60) * 44, h = Math.max(20, ((o.end - o.start) / 60) * 44);
            const c = catColor(o.category_id);
            return `<button class="wg-block tap" data-act="openDayBlock" data-day="${d}" data-key="${esc(o.key)}"
              style="top:${top}px;height:${h}px;background:${hexA(c, .18)};border-color:${hexA(c, .32)}">${esc(o.title)}</button>`;
          }).join('')}
        </div>`).join('')}
      </div>
    </div>`;
}

function monthView() {
  const days = monthGrid();
  const anchor = fromISO(S.day).getMonth();
  return `
    <div class="week-nav">
      <button class="icon-btn" data-act="monthStep" data-dir="-1">‹</button>
      <span class="mono">${esc(monthLabel(S.day))}</span>
      <button class="icon-btn" data-act="monthStep" data-dir="1">›</button>
    </div>
    <div class="month-grid">
      ${['S','M','T','W','T','F','S'].map(d => `<div class="mg-head mono">${d}</div>`).join('')}
      ${days.map(d => {
        const other = fromISO(d).getMonth() !== anchor;
        const occ = occurrencesOn(d).slice(0, 3);
        return `<button class="mg-cell tap${other ? ' other' : ''}${d === todayISO() ? ' today' : ''}" data-act="jumpDay" data-day="${d}">
          <span class="mg-num mono">${fromISO(d).getDate()}</span>
          ${occ.map(o => `<span class="mg-block" style="border-color:${catColor(o.category_id)}">${esc(o.title)}</span>`).join('')}
        </button>`;
      }).join('')}
    </div>`;
}

function agendaView() {
  const days = Array.from({ length: 14 }, (_, i) => addDays(S.day, i));
  return `<div class="agenda">${days.map(d => {
    const occ = occurrencesOn(d);
    if (!occ.length) return '';
    return `<div class="agenda-day">
      <div class="agenda-date">
        <div class="mono ad-n">${fromISO(d).getDate()}</div>
        <div class="dim ad-d">${esc(dateLabel(d, { weekday: 'short' }))}</div>
      </div>
      <div class="agenda-rows">${occ.map(o => `
        <button class="agenda-row tap" data-act="openDayBlock" data-day="${d}" data-key="${esc(o.key)}">
          <span class="dot" style="background:${catColor(o.category_id)}"></span>
          <span class="ar-title">${esc(o.title)}</span>
          <span class="dim mono ar-time">${esc(fmtRange(o.start, o.end, S.prefs.clock24))}</span>
        </button>`).join('')}</div>
    </div>`;
  }).join('') || `<div class="empty-card">${esc(t('cal.empty'))}</div>`}</div>`;
}

export function renderCalendar() {
  return `<div class="screen" data-screen-label="Calendar">
    <div class="screen-head"><h1>${esc(t('nav.calendar'))}</h1>${modeSwitch()}</div>
    ${S.calMode === 'week' ? weekView() : S.calMode === 'month' ? monthView() : agendaView()}
    <button class="fab" data-act="calAdd" aria-label="${esc(t('common.add'))}">＋</button>
  </div>`;
}

function rerender() { const host = document.querySelector('#view .screen'); if (host) host.outerHTML = renderCalendar(); }

registerActions({
  calMode: d => { S.calMode = d.mode; rerender(); },
  weekStep: d => { S.weekOffset += Number(d.dir); rerender(); },
  monthStep: d => { S.day = addDays(S.day, Number(d.dir) * 30); rerender(); },
  jumpDay: d => { S.day = d.day; S.calMode = 'agenda'; rerender(); },
  wgAdd: (d, node, ev) => {
    if (ev.target.closest('.wg-block')) return;
    const rect = node.getBoundingClientRect();
    const min = Math.round(((ev.clientY - rect.top) / 44) * 60 / 15) * 15;
    openBlockSheet({ day: d.day, start: Math.max(0, min), end: Math.max(30, min) + 30 });
  },
  openDayBlock: d => {
    const occ = occurrencesOn(d.day).find(o => o.key === d.key);
    if (occ) openBlockSheet({ occ, day: d.day });
  },
  calAdd: () => openBlockSheet({ day: S.day, start: 540, end: 600 })
});
