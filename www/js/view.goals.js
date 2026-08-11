// Goals — quarter/year/life horizons, milestone progress, and check-ins that
// keep a goal from going stale and silently dying.
import { S, mine, goalMilestones, goalCheckins, goalProgress, goalStale, goalHours, weekDays, save, remove } from './state.js';
import { t, dateLabel } from './i18n.js';
import { esc, fmtDur } from './util.js';
import { openGoalSheet, openCheckinSheet } from './sheets.js';
import { openInterestSheet } from './onboarding.js';
import { openSheet, closeSheet, registerActions, haptic, toast, confirmSheet, readForm, field, $ } from './ui.js';

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
      <span class="mono dim">${esc(fmtDur(goalHours(g.id, weekDays(0))))} this week</span>
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
      <div class="btn-row" style="margin-bottom:12px">
        <button class="btn ghost sm" data-act="openIdeas">💡 Ideas</button>
      </div>
      <div class="segmented">
        <button class="seg-item${S.goalArea === 'all' ? ' on' : ''}" data-act="goalArea" data-a="all">${esc(t('common.all'))}</button>
        ${HORIZONS.map(h => `<button class="seg-item${S.goalArea === h ? ' on' : ''}" data-act="goalArea" data-a="${h}">${h}</button>`).join('')}
      </div>
      ${goals.filter(g => S.goalArea === 'all' || g.horizon === S.goalArea).length
        ? `<div class="goal-grid">${goals.filter(g => S.goalArea === 'all' || g.horizon === S.goalArea).map(goalCard).join('')}</div>`
        : `<div class="empty-state big">
            <div style="font-size:34px;margin-bottom:10px">🎯</div>
            <b>No goals yet</b><br>
            <span class="dim">Goals turn scattered days into a direction. Start with one — or borrow an idea.</span>
            <div class="btn-row" style="justify-content:center;margin-top:16px">
              <button class="btn primary sm" data-act="openIdeas">💡 Show me ideas</button>
            </div>
          </div>`}
    </div>`;
  }
};

registerActions({
  goalArea: d => { S.goalArea = d.a; window.cadenceRerender(); },
  openIdeas: () => openInterestSheet(false),
  editGoal: d => openGoalSheet(d.id),
  addCheckin: d => openCheckinSheet(d.id),
  addMilestone: d => {
    openSheet({
      title: t('goal.addMilestone'),
      body: `${field(t('block.title'), `<input class="input" name="title" autocomplete="off" placeholder="${esc(t('goal.nextStep'))}">`)}
        <p class="dim small">Small enough to finish in one sitting works best.</p>`,
      footer: `<button class="btn ghost" data-act="sheetClose">${esc(t('common.cancel'))}</button>
               <button class="btn primary" data-act="milestoneSave" data-goal="${d.id}">${esc(t('common.save'))}</button>`,
      onMount: root => { setTimeout(() => $('input[name=title]', root)?.focus(), 120); }
    });
  },
  milestoneSave: d => {
    const title = (readForm().title || '').trim();
    if (!title) { toast(t('block.title'), 'warn'); return; }
    save('milestones', { goal_id: d.goal, title, sort: Date.now() });
    haptic('success');
    closeSheet();
    toast(t('msg.saved'), 'good');
  },
  toggleMilestone: d => {
    const m = S.milestones.find(x => x.id === d.id);
    if (!m) return;
    save('milestones', { id: m.id, done_at: m.done_at ? null : new Date().toISOString() });
    haptic(m.done_at ? 'light' : 'success');
  }
});
