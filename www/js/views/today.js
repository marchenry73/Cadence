// Today: the 24-hour spine, the day strip, committed/open stats, next-up card.
import { S, occurrencesOn, dayLoad, freeGaps, nextUp, catColor, catById } from '../state.js';
import { t, dateLabel } from '../i18n.js';
import { esc, fmtRange, fmtTime, fmtDur, todayISO, addDays, DAY_MINUTES, hexA } from '../util.js';
import { registerActions } from '../ui.js';
import { openBlockSheet, openQuickAdd } from '../sheets.js';
import { timerChip, snapshot as timerSnapshot, startTimer, pauseTimer } from '../timer.js';

const PX_PER_MIN = 1.15;   // 24h * 60 * 1.15 ≈ 1656px — a long, real scroll, not a cramped window

function dayStrip() {
  const center = S.day;
  const days = Array.from({ length: 7 }, (_, i) => addDays(center, i - 3));
  return `<div class="day-strip">${days.map(d => {
    const on = d === S.day;
    const isToday = d === todayISO();
    return `<button class="day-chip${on ? ' on' : ''}" data-act="pickDay" data-day="${d}">
      <span class="dc-dow">${esc(dateLabel(d, { weekday: 'short' }))}</span>
      <span class="dc-num">${d.slice(-2).replace(/^0/, '')}</span>
      <span class="dc-dot" style="background:${isToday ? 'var(--accent)' : 'transparent'}"></span>
    </button>`;
  }).join('')}</div>`;
}

function spine() {
  const occ = occurrencesOn(S.day);
  const gaps = freeGaps(S.day, 30);
  const isToday = S.day === todayISO();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  let hourLines = '';
  for (let h = 0; h <= 24; h++) {
    const top = h * 60 * PX_PER_MIN;
    hourLines += `<div class="spine-hour${h % 6 === 0 ? ' major' : ''}" style="top:${top}px">
      <span class="t">${esc(fmtTime(h * 60, S.prefs.clock24))}</span><span class="tick"></span></div>`;
  }

  const blocks = occ.map(o => {
    const top = o.start * PX_PER_MIN, h = Math.max(26, (o.end - o.start) * PX_PER_MIN);
    const color = catColor(o.category_id);
    const showRange = h > 40;
    return `<button class="spine-block tap" data-act="openBlock" data-key="${esc(o.key)}"
      style="top:${top}px;height:${h}px;--cat:${color};background:${hexA(color, .16)};border-color:${hexA(color, .34)}">
      <span class="sb-title">${esc(o.title)}</span>
      ${showRange ? `<span class="sb-range">${esc(fmtRange(o.start, o.end, S.prefs.clock24))}</span>` : ''}
      ${o.image_path ? `<img class="sb-img" data-img="${esc(o.image_path)}" alt="">` : ''}
    </button>`;
  }).join('');

  const gapMarks = isToday ? gaps.map(([s, e]) => {
    if (e <= nowMin && s !== 0) return '';
    const top = Math.max(s, isToday ? nowMin : s) * PX_PER_MIN;
    const bottom = e * PX_PER_MIN;
    if (bottom - top < 20) return '';
    return `<button class="spine-gap tap" data-act="fillGap" data-start="${Math.max(s, isToday ? nowMin : s)}" data-end="${e}"
      style="top:${top}px;height:${bottom - top}px">
      <span>${esc(t('today.suggest'))} · ${esc(fmtDur(e - Math.max(s, isToday ? nowMin : s)))}</span></button>`;
  }).join('') : '';

  const nowLine = isToday ? `<div class="spine-now" style="top:${nowMin * PX_PER_MIN}px"></div>` : '';

  return `<div class="spine" style="height:${DAY_MINUTES * PX_PER_MIN}px" data-act="spineTap">
    <div class="spine-rail"></div>
    ${hourLines}${gapMarks}${blocks}${nowLine}
  </div>`;
}

function nextUpCard() {
  const isToday = S.day === todayISO();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const up = isToday ? nextUp(S.day) : occurrencesOn(S.day)[0];
  if (!up) return `<div class="empty-card">${esc(t('today.nothingLeft'))}</div>`;
  const running = timerSnapshot().running;
  const inMin = isToday ? Math.max(0, up.start - nowMin) : null;
  return `<div class="next-card" style="--cat:${catColor(up.category_id)}">
    <div class="next-head">
      <span class="eyebrow">${esc(t('today.nextUp'))}${inMin != null ? ' · ' + (inMin === 0 ? esc(t('app.now')) : esc(t('today.in', { t: fmtDur(inMin) }))) : ''}</span>
      <span class="pulse-dot"></span>
    </div>
    <div class="next-title">${esc(up.title)}</div>
    <div class="next-time mono">${esc(fmtRange(up.start, up.end, S.prefs.clock24))}</div>
    <div class="next-actions">
      <button class="btn primary" data-act="startFocusFor" data-minutes="${Math.max(5, up.end - Math.max(up.start, isToday ? nowMin : up.start))}" data-label="${esc(up.title)}">${esc(t('today.startFocus'))}</button>
      <button class="btn ghost" data-act="pushBlock" data-key="${esc(up.key)}">${esc(t('today.push'))}</button>
    </div>
  </div>`;
}

export function renderToday() {
  const occ = occurrencesOn(S.day);
  const committed = occ.reduce((a, b) => a + (b.end - b.start), 0);
  const open = DAY_MINUTES - committed;

  return `<div class="screen today-screen" data-screen-label="Today">
    ${dayStrip()}
    <div class="stat-row">
      <div class="stat-card"><div class="stat-n mono">${esc(fmtDur(committed))}</div><div class="stat-l">${esc(t('today.committed'))}</div></div>
      <div class="stat-card good"><div class="stat-n mono">${esc(fmtDur(open))}</div><div class="stat-l">${esc(t('today.open'))}</div></div>
    </div>
    ${nextUpCard()}
    <div class="section-head">
      <span class="eyebrow">${esc(t('today.yourDay'))}</span>
      <span class="dim mono">${esc(t('today.blocks', { n: occ.length }))}</span>
    </div>
    ${spine()}
    <button class="fab" data-act="quickAdd" aria-label="${esc(t('common.add'))}">＋</button>
  </div>`;
}

registerActions({
  pickDay: d => { S.day = d.day; rerender(); },
  openBlock: d => {
    const [kind, id, day] = d.key.split(':');
    const occ = occurrencesOn(S.day).find(o => o.key === d.key);
    if (occ) openBlockSheet({ occ, day: S.day });
  },
  fillGap: d => openBlockSheet({ day: S.day, start: Number(d.start), end: Number(d.end) }),
  pushBlock: d => {
    const occ = occurrencesOn(S.day).find(o => o.key === d.key);
    if (!occ) return;
    if (occ.kind === 'event') {
      import('../state.js').then(({ save }) => save('events', { id: occ.id, start_min: occ.start + 15, end_min: occ.end + 15 }));
    }
    rerender();
  },
  quickAdd: () => openQuickAdd(),
  spineTap: e2 => {}
});

function rerender() {
  const host = document.querySelector('#view .screen');
  if (host) host.outerHTML = renderToday();
}
