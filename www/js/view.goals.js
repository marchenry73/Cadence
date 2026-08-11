// Goals — quarter/year/life horizons, milestone progress, and check-ins that
// keep a goal from going stale and silently dying.
import { S, mine, goalMilestones, goalCheckins, goalProgress, goalStale, save, remove } from './state.js';
import { t, dateLabel } from './i18n.js';
import { esc } from './util.js';
import { openGoalSheet, openCheckinSheet } from './sheets.js';
<<<<<<< Updated upstream
=======
import { openInterestSheet } from './onboarding.js';
>>>>>>> Stashed changes
import { registerActions, haptic, toast, confirmSheet } from './ui.js';

const HORIZONS = ['quarter', 'year', 'life'];

function goalCard(g) {
  const pct = goalProgress(g);
  const ms = goalMilestones(g.id);
  const stale = goalStale(g);
  const next = ms.find(m => !m.done_at);
  return `<div class="goal-card">
    <button class="goal-card-head tap" data-act="editGoal" data-id="${g.id}">
      <div class="goal-title">${esc(g.title)}</div>
      <div class="goal-area">${esc(g.area)}${g.target_date ? ' · ' + esc(dateLabel(g.target_date, { month: 'short', day: 'numeric', year: 'numeric' })) : ''}</div>
    </button>
    <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
    <div class="goal-row">
      <span class="mono">${pct}%</span>
      ${stale ? `<span class="warn-text">${esc(t('goal.stale'))}</span>` : ''}
    </div>
    ${next ? `<button class="goal-next tap" data-act="toggleMilestone" data-id="${next.id}">
      <span class="ms-check"></span>${esc(t('goal.nextStep'))}: ${esc(next.title)}</button>` : ''}
    ${ms.length ? `<div class="ms-list">${ms.map(m => `
      <button class="ms-row tap" data-act="toggleMilestone" data-id="${m.id}">
        <span class="ms-check${m.done_at ? ' on' : ''}"></span>
        <span class="${m.done_at ? 'strike' : ''}">${esc(m.title)}</span>
      </button>`).join('')}</div>` : ''}
    <div class="btn-row">
      <button class="btn ghost sm" data-act="addMilestone" data-id="${g.id}">${esc(t('goal.addMilestone'))}</button>
      <button class="btn ghost sm" data-act="addCheckin" data-id="${g.id}">${esc(t('goal.addCheckin'))}</button>
    </div>
  </div>`;
}

export default {
  id: 'goals',
  render() {
    const goals = mine('goals');
    return `<div class="pad">
<<<<<<< Updated upstream
=======
      <div class="btn-row" style="margin-bottom:12px">
        <button class="btn ghost sm" data-act="openIdeas">💡 Ideas</button>
      </div>
>>>>>>> Stashed changes
      <div class="segmented">
        <button class="seg-item${S.goalArea === 'all' ? ' on' : ''}" data-act="goalArea" data-a="all">${esc(t('common.all'))}</button>
        ${HORIZONS.map(h => `<button class="seg-item${S.goalArea === h ? ' on' : ''}" data-act="goalArea" data-a="${h}">${h}</button>`).join('')}
      </div>
      ${goals.filter(g => S.goalArea === 'all' || g.horizon === S.goalArea).length
        ? `<div class="goal-grid">${goals.filter(g => S.goalArea === 'all' || g.horizon === S.goalArea).map(goalCard).join('')}</div>`
        : `<div class="empty-state">${esc(t('goal.empty'))}</div>`}
    </div>`;
  }
};

registerActions({
  goalArea: d => { S.goalArea = d.a; window.cadenceRerender(); },
<<<<<<< Updated upstream
=======
  openIdeas: () => openInterestSheet(false),
>>>>>>> Stashed changes
  editGoal: d => openGoalSheet(d.id),
  addCheckin: d => openCheckinSheet(d.id),
  addMilestone: d => {
    const title = prompt(t('goal.addMilestone'));
    if (title?.trim()) { save('milestones', { goal_id: d.id, title: title.trim(), sort: Date.now() }); haptic('success'); }
  },
  toggleMilestone: d => {
    const m = S.milestones.find(x => x.id === d.id);
    if (!m) return;
    save('milestones', { id: m.id, done_at: m.done_at ? null : new Date().toISOString() });
    haptic(m.done_at ? 'light' : 'success');
  }
});
