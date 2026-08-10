// Tasks: open/done, swipe to complete, sorted by importance/urgency/due.
import { S, openTasks, mine, taskScore, catColor, catById, save } from '../state.js';
import { t, dateLabel } from '../i18n.js';
import { esc, todayISO, by } from '../util.js';
import { registerActions, haptic } from '../ui.js';
import { openTaskSheet } from '../sheets.js';

function taskRow(task) {
  const overdue = task.due_date && task.due_date < todayISO() && !task.done_at;
  const cat = catById(task.category_id);
  return `<div class="task-row${task.done_at ? ' done' : ''}" data-swipe data-swipe-right="taskComplete" data-swipe-left="taskEdit" data-id="${task.id}">
    <button class="task-check tap${task.done_at ? ' on' : ''}" data-act="taskToggle" data-id="${task.id}" aria-label="${esc(t('common.done'))}">
      ${task.done_at ? '✓' : ''}</button>
    <button class="task-body tap" data-act="taskEdit" data-id="${task.id}">
      <span class="task-title">${esc(task.title)}</span>
      <span class="task-meta dim mono">
        ${cat ? `<span class="dot" style="background:${cat.color}"></span>${esc(cat.name)} · ` : ''}
        ${task.due_date ? `<span class="${overdue ? 'warn-text' : ''}">${esc(dateLabel(task.due_date, { month: 'short', day: 'numeric' }))}</span> · ` : ''}
        ${task.est_min}${esc(t('common.minutes'))}
      </span>
    </button>
  </div>`;
}

export function renderTasks() {
  const filter = S.taskFilter;
  const all = mine('tasks');
  const list = filter === 'open' ? openTasks().sort((a, b) => taskScore(b) - taskScore(a))
    : filter === 'done' ? all.filter(t => t.done_at).sort(by('done_at', -1))
    : all.sort(by('due_date'));

  return `<div class="screen" data-screen-label="Tasks">
    <div class="screen-head"><h1>${esc(t('nav.tasks'))}</h1></div>
    <div class="segmented">
      ${['open', 'done', 'all'].map(f => `<button type="button" class="seg-item${filter === f ? ' on' : ''}"
        data-act="taskFilter" data-filter="${f}">${esc(t('task.' + (f === 'all' ? 'due' : f)))}</button>`).join('')}
    </div>
    ${filter === 'open' && list.length ? `<div class="hint-line dim">${esc(t('task.swipeHint'))}</div>` : ''}
    <div class="task-list">
      ${list.length ? list.map(taskRow).join('') : `<div class="empty-card">${esc(t('task.empty'))}</div>`}
    </div>
    <button class="fab" data-act="taskAdd" aria-label="${esc(t('common.add'))}">＋</button>
  </div>`;
}

function rerender() { const host = document.querySelector('#view .screen'); if (host) host.outerHTML = renderTasks(); }

registerActions({
  taskFilter: d => { S.taskFilter = d.filter; rerender(); },
  taskAdd: () => openTaskSheet(),
  taskEdit: d => openTaskSheet(d.id),
  taskToggle: d => {
    const task = S.tasks.find(x => x.id === d.id);
    if (!task) return;
    save('tasks', { id: d.id, done_at: task.done_at ? null : new Date().toISOString() });
    haptic('success');
    rerender();
  },
  taskComplete: d => {
    const task = S.tasks.find(x => x.id === d.id);
    if (!task || task.done_at) return;
    save('tasks', { id: d.id, done_at: new Date().toISOString() });
    rerender();
  }
});
