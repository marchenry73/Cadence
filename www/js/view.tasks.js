// Tasks — swipe right to complete, swipe left to schedule. Sorted by the
// importance/urgency score so the top of the list is always the right thing
// to do next, not just the oldest thing.
import { S, mine, openTasks, overdueTasks, taskScore, catById, save, remove, freeGaps } from './state.js';
import { t, dateLabel } from './i18n.js';
import { esc, fmtDur, todayISO } from './util.js';
import { openTaskSheet } from './sheets.js';
import { registerActions, haptic, toast, installRowSwipes } from './ui.js';

// Fill today's free time with the tasks that matter most: highest
// importance/urgency score first, each dropped into the earliest gap big
// enough to hold its estimate. Gaps are recomputed after every placement, so
// nothing double-books.
function placeTasksInGaps() {
  const list = openTasks().sort((a, b) => taskScore(b) - taskScore(a));
  let placed = 0;
  for (const task of list) {
    const need = task.est_min || 30;
    const gap = freeGaps(S.day, need)[0];
    if (!gap) break;
    save('events', {
      title: task.title, day: S.day,
      start_min: gap[0], end_min: Math.min(1440, gap[0] + need),
      category_id: task.category_id || null
    });
    placed++;
  }
  return placed;
}

function row(task) {
  const cat = catById(task.category_id);
  const steps = Array.isArray(task.checklist) ? task.checklist : [];
  const overdue = task.due_date && task.due_date < todayISO() && !task.done_at;
  return `<div class="swipe-row" data-swipe data-swipe-right="taskComplete" data-swipe-left="taskSchedule" data-id="${task.id}">
    <div class="swipe-under left"><span>✓ ${esc(t('common.done'))}</span></div>
    <div class="swipe-under right"><span>${esc(t('task.schedule'))} →</span></div>
    <button class="task-row tap" data-act="editTask" data-id="${task.id}">
      <span class="task-check${task.done_at ? ' on' : ''}" data-act="toggleTask" data-id="${task.id}"></span>
      <span class="task-main">
        <span class="task-title${task.done_at ? ' strike' : ''}">${esc(task.title)}</span>
        <span class="task-meta">
          ${cat ? `<i class="dot" style="background:${cat.color}"></i>${esc(cat.name)}` : ''}
          ${task.due_date ? `<span class="${overdue ? 'danger-text' : ''}">${esc(dateLabel(task.due_date, { month: 'short', day: 'numeric' }))}</span>` : ''}
          <span>${esc(fmtDur(task.est_min || 30))}</span>
          ${steps.length ? `<span class="mono">${steps.filter(s => s.done).length}/${steps.length}</span>` : ''}
        </span>
      </span>
    </button>
  </div>`;
}

export default {
  id: 'tasks',
  render() {
    const overdue = overdueTasks();
    const open = openTasks().filter(t => !overdue.includes(t)).sort((a, b) => taskScore(b) - taskScore(a));
    const done = mine('tasks').filter(t => t.done_at).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')).slice(0, 30);

    return `<div class="pad">
      <div class="segmented">
        ${['open', 'done'].map(f => `<button class="seg-item${S.taskFilter === f ? ' on' : ''}"
          data-act="taskFilter" data-f="${f}">${esc(t('task.' + f))}</button>`).join('')}
      </div>
      ${S.taskFilter === 'open' ? `
        <div class="btn-row" style="margin-bottom:4px">
          <button class="btn ghost sm" data-act="autoSchedule">⚡ Fill today's free time</button>
        </div>
        ${overdue.length ? `<div class="section-head"><span class="eyebrow danger-text">${esc(t('task.overdue'))}</span></div>
          <div class="list">${overdue.map(row).join('')}</div>` : ''}
        <div class="section-head"><span class="eyebrow">${esc(t('task.open'))}</span></div>
        ${open.length ? `<div class="list">${open.map(row).join('')}</div>`
          : `<div class="empty-state">${esc(t('task.empty'))}<br><span class="dim">${esc(t('task.swipeHint'))}</span></div>`}
      ` : `<div class="list">${done.length ? done.map(row).join('') : `<div class="empty-state">${esc(t('task.empty'))}</div>`}</div>`}
    </div>`;
  },
  onMount(root) { installRowSwipes(root); }
};

registerActions({
  taskFilter: d => { S.taskFilter = d.f; window.cadenceRerender(); },
  editTask: d => openTaskSheet(d.id),
  toggleTask: (d, node, ev) => {
    ev.stopPropagation();
    const task = S.tasks.find(x => x.id === d.id);
    if (!task) return;
    haptic('success');
    save('tasks', { id: task.id, done_at: task.done_at ? null : new Date().toISOString() });
  },
  taskComplete: d => {
    const task = S.tasks.find(x => x.id === d.id);
    if (task && !task.done_at) save('tasks', { id: task.id, done_at: new Date().toISOString() });
  },
  taskSchedule: d => openTaskSheet(d.id),
  autoSchedule: () => {
    const n = placeTasksInGaps();
    haptic(n ? 'success' : 'warn');
    toast(n ? `${n} scheduled` : t('today.nothingLeft'), n ? 'good' : 'warn');
    window.cadenceRerender();
  }
});
