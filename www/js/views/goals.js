// Goals: area tabs, progress rings, milestones and check-ins inline.
import { S, mine, goalMilestones, goalCheckins, goalProgress, goalStale, save, remove } from '../state.js';
import { t, dateLabel } from '../i18n.js';
import { esc, by } from '../util.js';
import { registerActions, haptic, confirmSheet, toast } from '../ui.js';
import { openGoalSheet, openCheckinSheet } from '../sheets.js';

function ring(pct) {
  const c = 2 * Math.PI * 18;
  const off = c * (1 - pct / 100);
  return `<svg class="goal-ring" viewBox="0 0 44 44" width="44" height="44">
    <circle cx="22" cy="22" r="18" fill="none" stroke="var(--line)" stroke-width="4"></circle>
    <circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" stroke-width="4"
      stroke-dasharray="${c}" stroke-dashoffset="${off}" stroke-linecap="round" transform="rotate(-90 22 22)"></circle>
    <text x="22" y="26" text-anchor="middle" class="ring-n mono">${pct}</text>
  </svg>`;
}

function areaTabs(areas) {
  return `<div class="area-tabs">
    <button class="area-tab tap${S.goalArea === 'all' ? ' on' : ''}" data-act="goalArea" data-area="all">${esc(t('common.all'))}</button>
    ${areas.map(a => `<button class="area-tab tap${S.goalArea === a ? ' on' : ''}" data-act="goalArea" data-area="${esc(a)}">${esc(a)}</button>`).join('')}
  </div>`;
}

function goalCard(g) {
  const ms = goalMilestones(g.id);
  const next = ms.find(m => !m.done_at);
  const pct = goalProgress(g);
  const stale = goalStale(g);
  return `<div class="goal-card">
    <button class="goal-top tap" data-act="goalEdit" data-id="${g.id}">
      ${ring(pct)}
      <div class="goal-info">
        <div class="goal-title">${esc(g.title)}</div>
        <div class="dim mono goal-sub">${esc(g.area)} · ${esc(g.horizon)}${g.target_date ? ' · ' + esc(dateLabel(g.target_date, { month: 'short', day: 'numeric' })) : ''}</div>
      </div>
    </button>
    ${stale ? `<div class="warnbar sm">${esc(t('goal.stale'))}</div>` : ''}
    ${next ? `<div class="goal-next"><span class="dim">${esc(t('goal.nextStep'))}:</span> ${esc(next.title)}
      <button class="chip tap" data-act="msToggle" data-goal="${g.id}" data-ms="${next.id}">${esc(t('common.done'))}</button></div>` : ''}
    <div class="goal-ms-list">
      ${ms.map(m => `<label class="ms-row">
        <button class="ms-check tap${m.done_at ? ' on' : ''}" data-act="msToggle" data-goal="${g.id}" data-ms="${m.id}">${m.done_at ? '✓' : ''}</button>
        <span class="${m.done_at ? 'strike' : ''}">${esc(m.title)}</span>
      </label>`).join('')}
      <button class="ms-add tap" data-act="msAdd" data-goal="${g.id}">${esc(t('goal.addMilestone'))}</button>
    </div>
    <button class="btn ghost sm" data-act="checkinAdd" data-goal="${g.id}" style="width:100%">${esc(t('goal.addCheckin'))}</button>
  </div>`;
}

export function renderGoals() {
  const all = mine('goals').sort(by('updated_at', -1));
  const areas = [...new Set(all.map(g => g.area))];
  const list = S.goalArea === 'all' ? all : all.filter(g => g.area === S.goalArea);

  return `<div class="screen" data-screen-label="Goals">
    <div class="screen-head"><h1>${esc(t('nav.goals'))}</h1></div>
    ${areas.length > 1 ? areaTabs(areas) : ''}
    <div class="goal-list">
      ${list.length ? list.map(goalCard).join('') : `<div class="empty-card">${esc(t('goal.empty'))}</div>`}
    </div>
    <button class="fab" data-act="goalAdd" aria-label="${esc(t('common.add'))}">＋</button>
  </div>`;
}

function rerender() { const host = document.querySelector('#view .screen'); if (host) host.outerHTML = renderGoals(); }

registerActions({
  goalArea: d => { S.goalArea = d.area; rerender(); },
  goalAdd: () => openGoalSheet(),
  goalEdit: d => openGoalSheet(d.id),
  checkinAdd: d => openCheckinSheet(d.goal),
  msAdd: d => {
    const title = prompt(t('goal.addMilestone'));
    if (!title?.trim()) return;
    save('milestones', { goal_id: d.goal, title: title.trim(), sort: Date.now() });
    haptic('light'); rerender();
  },
  msToggle: d => {
    const m = S.milestones.find(x => x.id === d.ms);
    if (!m) return;
    save('milestones', { id: d.ms, done_at: m.done_at ? null : new Date().toISOString() });
    haptic('success'); rerender();
  }
});
