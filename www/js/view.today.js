// Today — the screen the app opens on. A full 24-hour spine (never a 9-to-5
// window), what is running now, what is next, and gaps you can still use.
// Tap a gap to fill it; tap a block to edit it; hold a block for quick actions.
import { S, occurrencesOn, dayLoad, freeGaps, catColor, save, nextUp, openTasks, mine, goalProgress, taskScore } from './state.js';
import { t, dateLabel } from './i18n.js';
import { esc, fmtTime, fmtRange, fmtDur, todayISO, addDays, minutesNow, DAY_MINUTES, hexA, snap } from './util.js';
import { openBlockSheet, openQuickAdd } from './sheets.js';
import { openTaskSheet } from './sheets.js';
import { openSheet, closeSheet, confirmSheet, toast, haptic, registerActions, $ } from './ui.js';
import { startTimer, snapshot, onTimer, timerChip } from './timer.js';

const pxPerHour = () => S.prefs.density === 'compact' ? 52 : 68;

function dayStrip() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i - 1));
  return `<div class="daystrip">${days.map(d => {
    const on = d === S.day;
    const isToday = d === todayISO();
    const load = dayLoad(d);
    return `<button class="daychip tap${on ? ' on' : ''}" data-act="pickDay" data-day="${d}">
      <span class="dc-dow">${esc(dateLabel(d, { weekday: 'short' }))}</span>
      <span class="dc-num${isToday ? ' today' : ''}">${Number(d.slice(8))}</span>
      <span class="dc-dot" style="opacity:${load ? Math.min(1, load / 480) : 0}"></span>
    </button>`;
  }).join('')}</div>`;
}

function spine() {
  const pph = pxPerHour();
  const height = 24 * pph;
  const list = occurrencesOn(S.day);
  const isToday = S.day === todayISO();
  const focusTop = (S.prefs.focus_start / 60) * pph;
  const focusHeight = Math.max(0, (S.prefs.focus_end - S.prefs.focus_start) / 60 * pph);
  const compact = S.prefs.density === 'compact';

  const hours = Array.from({ length: 25 }, (_, h) => {
    const hide = compact && h % 2 === 1 && h !== 24;
    return `<div class="hour" style="top:${h * pph}px">
      <span class="hour-label">${hide ? '' : esc(fmtTime((h % 24) * 60, S.prefs.clock24))}</span>
      <span class="hour-tick"></span>
    </div>`;
  }).join('');

  const lanes = [];
  const placed = list.map(o => {
    let lane = lanes.findIndex(end => end <= o.start);
    if (lane === -1) { lane = lanes.length; lanes.push(o.end); } else lanes[lane] = o.end;
    return { ...o, lane };
  });
  const laneCount = Math.max(1, lanes.length);

  const blocks = placed.map(o => {
    const top = (o.start / 60) * pph;
    const h = Math.max(30, ((o.end - o.start) / 60) * pph - 3);
    const color = catColor(o.category_id);
    const width = 100 / laneCount;
    const running = isToday && o.start <= minutesNow() && o.end > minutesNow();
    return `<button class="block tap${running ? ' running' : ''}" data-act="openBlock" data-key="${esc(o.key)}" data-hold="blockMenu"
      style="top:${top}px;height:${h}px;left:calc(${o.lane * width}%);width:calc(${width}% - 6px);
             background:${hexA(color, .16)};border-color:${hexA(color, .42)}">
      <span class="block-bar" style="background:${color}"></span>
      <span class="block-body">
        <span class="block-title">${esc(o.title)}</span>
        ${h > 46 ? `<span class="block-time">${esc(fmtRange(o.start, o.end, S.prefs.clock24))}</span>` : ''}
      </span>
      ${o.image_path ? `<img class="block-img" data-img="${esc(o.image_path)}" alt="">` : ''}
      ${o.kind === 'routine' ? '<span class="block-flag" title="Routine">↻</span>' : ''}
    </button>`;
  }).join('');

  const gaps = freeGaps(S.day, 45)
    .filter(([, b]) => b > (isToday ? minutesNow() : 0))
    .slice(0, 4).map(([a, b]) => {
      const from = Math.max(a, isToday ? snap(minutesNow(), 15) : a);
      if (b - from < 30) return '';
      return `<button class="gap tap" data-act="fillGap" data-start="${from}" data-end="${b}"
        style="top:${(from / 60) * pph}px;height:${Math.max(26, ((b - from) / 60) * pph - 4)}px">
        <span>${esc(fmtDur(b - from))} ${esc(t('today.freeTime').toLowerCase())}</span>
      </button>`;
    }).join('');

  return `<div class="spine" id="spine" style="height:${height}px" data-act="spineTap" data-pph="${pph}">
    <div class="spine-focus" style="top:${focusTop}px;height:${focusHeight}px"></div>
    ${hours}${gaps}${blocks}
    ${isToday ? `<div class="nowline" id="nowline" style="top:${(minutesNow() / 60) * pph}px"><i></i></div>` : ''}
  </div>`;
}

function desktopRail() {
  const tasks = openTasks().sort((a, b) => taskScore(b) - taskScore(a)).slice(0, 5);
  const goals = mine('goals').slice(0, 4);
  const week = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i - todayISOdow()));
  return `<div class="desktop-rail">
    <div class="rail-card">
      <h3>${esc(t('nav.tasks'))}</h3>
      ${tasks.length ? tasks.map(tk => `<button class="rail-task tap" data-act="editTaskFromRail" data-id="${tk.id}">
        <span class="task-check${tk.done_at ? ' on' : ''}" style="width:16px;height:16px"></span>${esc(tk.title)}</button>`).join('')
        : `<span class="dim small">${esc(t('task.empty'))}</span>`}
    </div>
    <div class="rail-card">
      <h3>${esc(t('nav.goals'))}</h3>
      ${goals.length ? goals.map(g => `<div class="rail-goal"><span style="flex:1">${esc(g.title)}</span><span class="mono dim">${goalProgress(g)}%</span></div>`).join('')
        : `<span class="dim small">${esc(t('goal.empty'))}</span>`}
    </div>
  </div>`;
}
function todayISOdow() { return new Date(fromISOLocal(todayISO())).getDay(); }
function fromISOLocal(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

// Drag a block up or down to reschedule it. Snaps to 15 minutes, keeps the
// duration, and clamps inside the 24h day. A routine occurrence dragged on a
// single day becomes a one-off override for that day (the series is left
// alone) — same rule as "edit just today" in the block sheet.
function installBlockDrag(root) {
  const spineEl = $('#spine', root);
  if (!spineEl) return;
  const pph = Number(spineEl.dataset.pph) || 68;
  let dragging = null, startY = 0, origTop = 0, moved = false;

  spineEl.addEventListener('pointerdown', e => {
    const el = e.target.closest('.block');
    if (!el) return;
    dragging = el; startY = e.clientY; origTop = parseFloat(el.style.top) || 0; moved = false;
    el.setPointerCapture?.(e.pointerId);
  });

  spineEl.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dy) < 5) return;
    moved = true;
    dragging.style.zIndex = '30';
    dragging.style.opacity = '.92';
    const max = spineEl.offsetHeight - dragging.offsetHeight;
    dragging.style.top = Math.max(0, Math.min(max, origTop + dy)) + 'px';
  });

  const finish = () => {
    if (!dragging) return;
    const el = dragging; dragging = null;
    el.style.zIndex = ''; el.style.opacity = '';
    if (!moved) return;
    el.dataset.justDragged = '1';
    const occ = occurrencesOn(S.day).find(o => o.key === el.dataset.key);
    if (!occ) return;
    const dur = occ.end - occ.start;
    const newStart = Math.max(0, Math.min(DAY_MINUTES - dur, snap((parseFloat(el.style.top) / pph) * 60, 15)));
    if (newStart === occ.start) return;
    if (occ.kind === 'routine') {
      save('events', {
        title: occ.title, day: S.day, start_min: newStart, end_min: newStart + dur,
        category_id: occ.category_id, routine_id: occ.routine_id, notes: occ.notes
      });
    } else {
      save('events', { id: occ.id, start_min: newStart, end_min: newStart + dur });
    }
    haptic('success');
    toast(t('msg.saved'), 'good');
  };
  spineEl.addEventListener('pointerup', finish);
  spineEl.addEventListener('pointercancel', finish);
}

export default {
  id: 'today',

  render() {
    const isToday = S.day === todayISO();
    const committed = dayLoad(S.day);
    const free = DAY_MINUTES - committed;
    const next = nextUp(S.day, isToday ? minutesNow() : 0);
    const timer = snapshot();

    return `
      ${dayStrip()}
      <div class="today-main">
        <div class="stat-row">
          <div class="stat"><div class="stat-n">${esc(fmtDur(committed))}</div><div class="stat-l">${esc(t('today.committed'))}</div></div>
          <div class="stat"><div class="stat-n good">${esc(fmtDur(free))}</div><div class="stat-l">${esc(t('today.open'))}</div></div>
        </div>

        <div class="card next">
          <div class="card-head">
            <span class="eyebrow">${esc(t('today.nextUp'))}</span>
            ${next ? (isToday && next.start <= minutesNow()
              ? `<span class="live">${esc(t('today.nowRunning'))}</span>`
              : `<span class="dim mono">${esc(fmtTime(next.start, S.prefs.clock24))}</span>`) : ''}
          </div>
          ${next ? `
            <div class="next-title">${esc(next.title)}</div>
            <div class="next-time mono">${esc(fmtRange(next.start, next.end, S.prefs.clock24))}</div>
          ` : `<div class="next-empty">${esc(t('today.nothingLeft'))}</div>`}
          <div class="btn-row">
            <button class="btn ghost sm" data-act="startTimerQuick" data-minutes="25" data-label="${next ? esc(next.title) : ''}">${esc(t('today.startFocus'))}</button>
            ${timer.running || timer.remaining < timer.minutes * 60
              ? `<button class="btn ghost sm mono" data-act="gotoTimer">${esc(timerChip())}</button>` : ''}
          </div>
        </div>

        <div class="section-head"><span class="eyebrow">${esc(t('today.yourDay'))}</span></div>
        ${spine()}
      </div>
      ${desktopRail()}`;
  },

  onMount(root) {
    const spineEl = $('#spine', root);
    if (spineEl) requestAnimationFrame(() => {
      const target = Math.max(0, (minutesNow() / 60) * pxPerHour() - 220);
      root.closest('.screen-scroll')?.scrollTo({ top: 0 });
      spineEl.parentElement?.scrollTo?.({});
    });
    installBlockDrag(root);
    this._offTimer = onTimer(() => { const chip = $('[data-act=gotoTimer]', root); if (chip) chip.textContent = timerChip(); });
  },

  onUnmount() { this._offTimer?.(); }
};

registerActions({
  pickDay: d => { window.cadenceGoDay(d.day); },
  spineTap: (d, node, ev) => {
    if (ev.target !== node) return;
    const rect = node.getBoundingClientRect();
    const pph = Number(node.dataset.pph);
    const min = snap(((ev.clientY - rect.top) / pph) * 60, 15);
    openBlockSheet({ day: S.day, start: Math.max(0, Math.min(1410, min)) });
  },
  openBlock: (d, node) => {
    // Ignore the click that always follows a drag gesture.
    if (d.justDragged) { delete node.dataset.justDragged; return; }
    const occ = occurrencesOn(S.day).find(o => o.key === d.key);
    if (occ) openBlockSheet({ occ, day: S.day });
  },
  blockMenu: async (d) => {
    const occ = occurrencesOn(S.day).find(o => o.key === d.key);
    if (!occ) return;
    haptic('medium');
    openBlockSheet({ occ, day: S.day });
  },
  fillGap: d => openBlockSheet({ day: S.day, start: Number(d.start), end: Math.min(Number(d.start) + 60, Number(d.end)) }),
  startTimerQuick: d => { startTimer(Number(d.minutes) || 25, d.label || ''); toast(t('timer.start'), 'good'); },
  gotoTimer: () => window.cadenceGoRoute('today'),
  editTaskFromRail: d => openTaskSheet(d.id)
});
