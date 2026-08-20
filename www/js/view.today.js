// Today — the screen the app opens on. A full 24-hour spine (never a 9-to-5
// window), what is running now, what is next, and gaps you can still use.
// Tap a gap to fill it; tap a block to edit it; hold a block for quick actions.
import { S, occurrencesOn, dayLoad, freeGaps, catColor, save, nextUp, openTasks, mine, goalProgress, taskScore, isBlockDone, markBlockDone, unmarkBlockDone } from './state.js';
import { t, dateLabel } from './i18n.js';
import { esc, fmtTime, fmtRange, fmtDur, todayISO, addDays, minutesNow, DAY_MINUTES, snap } from './util.js';
import { openBlockSheet, openQuickAdd, parsePhrase } from './sheets.js';
import { openTaskSheet } from './sheets.js';
import { openSheet, closeSheet, confirmSheet, toast, haptic, registerActions, $ } from './ui.js';
import { startTimer, snapshot, onTimer, timerChip } from './timer.js';
import { playCue } from './notify.js';
import { streakNow } from './gamify.js';

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

// The hero panel that leads the screen: what's running right now, or what's
// next. Solid color instead of a bordered card — the one thing on Today that
// should read before anything else, the way the whole redesign is built
// around "what matters most gets the most visual weight."
function hero(next, isToday, timer) {
  if (!next) {
    return `<div class="hero hero-empty">
      <div class="hero-eyebrow">${esc(t('today.nextUp'))}</div>
      <div class="hero-title">${esc(t('today.nothingLeft'))}</div>
      <div class="btn-row">
        <button class="btn ghost sm" data-act="startTimerQuick" data-minutes="25" data-label="">${esc(t('today.startFocus'))}</button>
      </div>
    </div>`;
  }
  const color = catColor(next.category_id);
  const running = isToday && next.start <= minutesNow();
  const showTimerChip = timer.running || timer.remaining < timer.minutes * 60;
  const timerBtn = showTimerChip
    ? `<button class="btn ghost sm mono" data-act="gotoTimer">${esc(timerChip())}</button>` : '';

  if (running) {
    const total = next.end - next.start;
    const elapsed = minutesNow() - next.start;
    const pct = Math.max(3, Math.min(100, Math.round(elapsed / total * 100)));
    return `<div class="hero" style="--hero-a:${color}">
      <div class="hero-eyebrow"><i></i>${esc(t('today.nowRunning'))}</div>
      <div class="hero-title">${esc(next.title)}</div>
      <div class="hero-time mono">${esc(fmtRange(next.start, next.end, S.prefs.clock24))} · ${esc(fmtDur(next.end - minutesNow()))} left</div>
      <div class="hero-bar"><i style="width:${pct}%"></i></div>
      <div class="btn-row">
        <button class="btn ghost sm" data-act="startTimerQuick" data-minutes="25" data-label="${esc(next.title)}">${esc(t('today.startFocus'))}</button>
        ${timerBtn}
      </div>
    </div>`;
  }
  return `<div class="hero" style="--hero-a:${color}">
    <div class="hero-eyebrow">${esc(t('today.nextUp'))}</div>
    <div class="hero-title">${esc(next.title)}</div>
    <div class="hero-time mono">${esc(fmtRange(next.start, next.end, S.prefs.clock24))}</div>
    <div class="btn-row">
      <button class="btn ghost sm" data-act="startTimerQuick" data-minutes="25" data-label="${esc(next.title)}">${esc(t('today.startFocus'))}</button>
      ${timerBtn}
    </div>
  </div>`;
}

// Goals used to be invisible unless you opened a separate tab. This puts
// the two most relevant ones — plus the streak, which was buried in Review
// — right on the screen you actually open first.
function tileRow(committed) {
  const goals = mine('goals').slice(0, 2);
  const tints = ['t-moss', 't-peri'];
  const rings = ['--moss', '--peri'];
  const goalTiles = goals.map((g, i) => {
    const pct = goalProgress(g);
    return `<button class="tile ${tints[i % 2]} tap" data-act="gotoGoals">
      <div class="tile-ring" style="background:conic-gradient(var(${rings[i % 2]}) 0 ${pct}%, color-mix(in oklab, var(${rings[i % 2]}) 25%, transparent) 0)">${pct}%</div>
      <div class="tile-label">${esc(g.title)}</div>
      <div class="tile-sub">${esc(g.area || '')}</div>
    </button>`;
  }).join('');
  const streak = streakNow();
  const streakPct = Math.min(100, streak * (100 / 7));
  const streakTile = `<div class="tile t-honey">
    <div class="tile-ring" style="background:conic-gradient(var(--honey) 0 ${streakPct}%, color-mix(in oklab, var(--honey) 25%, transparent) 0)">${streak}</div>
    <div class="tile-label">Day streak</div>
    <div class="tile-sub">${esc(fmtDur(committed))} today</div>
  </div>`;
  return `<div class="tiles">${goalTiles}${streakTile}</div>`;
}

// A handful of the highest-scored open tasks, right under the day — the
// mobile view previously had no task visibility at all outside a separate
// tab. Desktop already had this via the rail; now everyone does.
function taskListMini() {
  const open = openTasks();
  if (!open.length) return '';
  const top = open.slice().sort((a, b) => taskScore(b) - taskScore(a)).slice(0, 3);
  return `
    <div class="section-head"><span class="eyebrow">${esc(t('nav.tasks'))}</span><span class="dim small mono">${open.length} ${esc(t('task.open'))}</span></div>
    <div class="tasks-mini">${top.map(tk => `
      <button class="trow-mini tap" data-act="editTaskFromRail" data-id="${tk.id}">
        <span class="task-check${tk.done_at ? ' on' : ''}"></span>
        <span class="ttitle-mini${tk.done_at ? ' strike' : ''}">${esc(tk.title)}</span>
      </button>`).join('')}</div>`;
}

function spine() {
  const pph = pxPerHour();
  const height = 24 * pph;
  const list = occurrencesOn(S.day);
  const isToday = S.day === todayISO();
  const focusTop = (S.prefs.focus_start / 60) * pph;
  const focusHeight = Math.max(0, (S.prefs.focus_end - S.prefs.focus_start) / 60 * pph);
  const compact = S.prefs.density === 'compact';
  // Alternating 2-hour bands, computed here since the CSS has no clean way
  // to band zero-height, absolutely-positioned hour markers.
  const band = `repeating-linear-gradient(to bottom, var(--surface-2) 0, var(--surface-2) ${pph}px, transparent ${pph}px, transparent ${pph * 2}px)`;

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
    const past = (isToday && o.end <= minutesNow()) || S.day < todayISO();
    const done = isBlockDone(o, S.day);
    return `<button class="block tap${running ? ' running' : ''}" data-act="openBlock" data-key="${esc(o.key)}" data-hold="blockMenu"
      style="top:${top}px;height:${h}px;left:calc(${o.lane * width}%);width:calc(${width}% - 6px);
             background:${color}">
      <span class="block-bar"></span>
      <span class="block-body">
        <span class="block-title">${esc(o.title)}</span>
        ${h > 46 ? `<span class="block-time">${esc(fmtRange(o.start, o.end, S.prefs.clock24))}</span>` : ''}
      </span>
      ${o.image_path ? `<img class="block-img" data-img="${esc(o.image_path)}" alt="">` : ''}
      ${o.protected ? '<span class="protect-flag" title="Protected">\u{1F512}</span>' : ''}
      ${o.kind === 'routine' ? '<span class="block-flag" title="Routine">\u21bb</span>' : ''}
      ${past && h > 34 ? `<span class="block-confirm${done ? ' on' : ''}" data-act="confirmBlock" data-key="${esc(o.key)}">\u2713</span>` : ''}
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

  return `<div class="spine" id="spine" style="height:${height}px;background:${band}" data-act="spineTap" data-pph="${pph}">
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
      <h3>${esc(t('today.yourDay'))}</h3>
      <div class="rail-week">${week.map(d => {
        const load = dayLoad(d);
        return `<button class="rw-cell tap${d === todayISO() ? ' today' : ''}" data-act="pickDay" data-day="${d}">
          <span class="dim" style="font-size:9px">${esc(dateLabel(d, { weekday: 'narrow' }))}</span>
          <span class="rw-dot" style="background:var(--accent);opacity:${load ? Math.min(1, load / 480) : .15}"></span>
        </button>`;
      }).join('')}</div>
    </div>
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
  let dragging = null, startY = 0, startX = 0, origTop = 0, moved = false, dayShift = 0;
  const SIDE = 64;   // px sideways before it counts as "move to another day"

  spineEl.addEventListener('pointerdown', e => {
    const el = e.target.closest('.block');
    if (!el) return;
    dragging = el; startY = e.clientY; startX = e.clientX;
    origTop = parseFloat(el.style.top) || 0; moved = false; dayShift = 0;
    el.setPointerCapture?.(e.pointerId);
  });

  spineEl.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dy) < 5 && Math.abs(dx) < 5) return;
    moved = true;
    dragging.style.zIndex = '30';
    dragging.style.opacity = '.92';
    const max = spineEl.offsetHeight - dragging.offsetHeight;
    dragging.style.top = Math.max(0, Math.min(max, origTop + dy)) + 'px';
    dragging.style.transform = `translateX(${Math.max(-120, Math.min(120, dx))}px)`;
    const shift = Math.abs(dx) < SIDE ? 0 : (dx > 0 ? 1 : -1);
    if (shift !== dayShift) { dayShift = shift; if (shift) haptic('light'); }
    dragging.classList.toggle('drag-to-day', !!dayShift);
    dragging.dataset.dayHint = dayShift
      ? dateLabel(addDays(S.day, dayShift), { weekday: 'short' }) : '';
  });

  const finish = () => {
    if (!dragging) return;
    const el = dragging; dragging = null;
    const shift = dayShift; dayShift = 0;
    el.style.zIndex = ''; el.style.opacity = ''; el.style.transform = '';
    el.classList.remove('drag-to-day'); el.dataset.dayHint = '';
    if (!moved) return;
    el.dataset.justDragged = '1';
    const occ = occurrencesOn(S.day).find(o => o.key === el.dataset.key);
    if (!occ) return;
    const dur = occ.end - occ.start;
    const targetDay = shift ? addDays(S.day, shift) : S.day;
    const newStart = Math.max(0, Math.min(DAY_MINUTES - dur, snap((parseFloat(el.style.top) / pph) * 60, 15)));
    if (newStart === occ.start && targetDay === S.day) return;
    if (occ.kind === 'routine') {
      save('events', {
        title: occ.title, day: targetDay, start_min: newStart, end_min: newStart + dur,
        category_id: occ.category_id, routine_id: occ.routine_id, notes: occ.notes
      });
    } else {
      save('events', { id: occ.id, day: targetDay, start_min: newStart, end_min: newStart + dur });
    }
    haptic('success');
    toast(shift ? `Moved to ${dateLabel(targetDay, { weekday: 'short' })}` : t('msg.saved'), 'good');
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
      <div class="pad">
      ${dayStrip()}
      <div class="today-main">
        <div class="nl-bar">
          <input class="input" id="nlInput" autocomplete="off" autocapitalize="sentences"
                 placeholder="Gym 6–7am · Draft brief tomorrow 45m">
          <button class="btn primary sm" data-act="nlCommit">${esc(t('common.add'))}</button>
        </div>

        ${hero(next, isToday, timer)}
        ${tileRow(committed)}

        <div class="section-head"><span class="eyebrow">${esc(t('today.yourDay'))}</span><span class="dim small mono">${esc(fmtDur(free))} ${esc(t('today.open').toLowerCase())}</span></div>
        ${spine()}

        ${taskListMini()}
      </div>
      ${desktopRail()}
      </div>`;
  },

  onMount(root) {
    const spineEl = $('#spine', root);
    if (spineEl) requestAnimationFrame(() => {
      const target = Math.max(0, (minutesNow() / 60) * pxPerHour() - 220);
      root.closest('.screen-scroll')?.scrollTo({ top: 0 });
      spineEl.parentElement?.scrollTo?.({});
    });
    installBlockDrag(root);
    const nl = $('#nlInput', root);
    if (nl) nl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitNL(); }
    });
    this._offTimer = onTimer(() => { const chip = $('[data-act=gotoTimer]', root); if (chip) chip.textContent = timerChip(); });
  },

  onUnmount() { this._offTimer?.(); }
};

// Natural language is the fastest way in: one line becomes a block or a
// task, whichever the phrase implies. Same parser the quick-add sheet uses.
function commitNL() {
  const input = $('#nlInput');
  const p = parsePhrase(input?.value);
  if (!p) { toast('Try "Gym 6–7am" or "Call mum tomorrow 30m"', 'warn'); return; }
  if (p.type === 'block') {
    save('events', { title: p.title, day: p.day, start_min: p.start, end_min: p.end, category_id: p.category_id });
    toast(`${p.title} · ${fmtTime(p.start, S.prefs.clock24)}`, 'good');
  } else {
    save('tasks', { title: p.title, due_date: p.day, est_min: p.est_min, category_id: p.category_id, importance: 5, urgency: 5 });
    toast(`Task: ${p.title}`, 'good');
  }
  input.value = '';
  haptic('success');
  window.cadenceRerender();
}

registerActions({
  nlCommit: () => commitNL(),
  gotoGoals: () => window.cadenceGoRoute('goals'),
  confirmBlock: (d, node, ev) => {
    ev.stopPropagation();
    playCue('done');
    node.dataset.justDragged = '';
    const occ = occurrencesOn(S.day).find(o => o.key === d.key);
    if (!occ) return;
    if (isBlockDone(occ, S.day)) { unmarkBlockDone(occ, S.day); haptic('light'); }
    else { markBlockDone(occ, S.day); haptic('success'); }
    window.cadenceRerender();
  },
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
    if (node.closest('.block-confirm')) return;
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
