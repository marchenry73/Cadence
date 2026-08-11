// Weekly review — planned vs actual, per category and per goal.
// The number that matters is the gap: what you scheduled against what you
// confirmed actually happened. Everything here reads confirmations you tick
// off on the Today screen; nothing is inferred or invented.
import { S, categoryTotals, goalHours, catById, mine, weekDays, occurrencesOn, isBlockDone } from './state.js';
import { t, dateLabel } from './i18n.js';
import { esc, fmtDur, addDays, todayISO, hexA } from './util.js';
import { registerActions, haptic } from './ui.js';

function bar(label, color, planned, actual, max) {
  const p = max ? Math.round(planned / max * 100) : 0;
  const a = max ? Math.round(actual / max * 100) : 0;
  const hit = planned ? Math.round(actual / planned * 100) : 0;
  return `<div class="rv-row">
    <div class="rv-head">
      <span class="rv-label"><i class="dot" style="background:${color}"></i>${esc(label)}</span>
      <span class="rv-nums mono">${esc(fmtDur(actual))} <span class="dim">/ ${esc(fmtDur(planned))}</span></span>
    </div>
    <div class="rv-track">
      <div class="rv-planned" style="width:${p}%;background:${hexA(color, .22)}"></div>
      <div class="rv-actual" style="width:${a}%;background:${color}"></div>
    </div>
    <div class="rv-foot ${hit >= 80 ? 'good-text' : hit >= 50 ? '' : 'warn-text'}">${planned ? hit + '% of plan kept' : 'unplanned time'}</div>
  </div>`;
}

export default {
  id: 'review',

  render() {
    const days = weekDays(S.weekOffset);
    const { planned, actual } = categoryTotals(days);
    const keys = [...new Set([...Object.keys(planned), ...Object.keys(actual)])]
      .sort((a, b) => (planned[b] || 0) - (planned[a] || 0));
    const max = Math.max(1, ...keys.map(k => Math.max(planned[k] || 0, actual[k] || 0)));
    const totalPlanned = Object.values(planned).reduce((a, b) => a + b, 0);
    const totalActual = Object.values(actual).reduce((a, b) => a + b, 0);
    const kept = totalPlanned ? Math.round(totalActual / totalPlanned * 100) : 0;

    // The one honest insight: the category you overcommit to most.
    const worst = keys.filter(k => (planned[k] || 0) >= 60)
      .sort((a, b) => ((planned[b] || 0) - (actual[b] || 0)) - ((planned[a] || 0) - (actual[a] || 0)))[0];
    const best = keys.filter(k => (planned[k] || 0) >= 60)
      .sort((a, b) => ((actual[b] || 0) / (planned[b] || 1)) - ((actual[a] || 0) / (planned[a] || 1)))[0];

    const goals = mine('goals');
    const unconfirmed = days.filter(d => d <= todayISO())
      .flatMap(d => occurrencesOn(d).filter(o => !isBlockDone(o, d)).map(o => ({ d, o })))
      .filter(x => x.d < todayISO()).length;

    return `<div class="pad">
      <div class="week-nav">
        <button class="icon-btn" data-act="reviewWeek" data-dir="-1">‹</button>
        <span class="mono">${esc(dateLabel(days[0], { month: 'short', day: 'numeric' }))} – ${esc(dateLabel(days[6], { month: 'short', day: 'numeric' }))}</span>
        <button class="icon-btn" data-act="reviewWeek" data-dir="1" ${S.weekOffset >= 0 ? 'disabled' : ''}>›</button>
      </div>

      <div class="stat-row">
        <div class="stat"><div class="stat-n">${esc(fmtDur(totalPlanned))}</div><div class="stat-l">Planned</div></div>
        <div class="stat"><div class="stat-n good">${esc(fmtDur(totalActual))}</div><div class="stat-l">Actually done</div></div>
        <div class="stat"><div class="stat-n">${kept}%</div><div class="stat-l">Plan kept</div></div>
      </div>

      ${unconfirmed ? `<div class="warnbar">${unconfirmed} past block${unconfirmed === 1 ? '' : 's'} not confirmed yet — tick them off on Today so this stays honest.</div>` : ''}

      ${keys.length ? `
        <div class="section-head"><span class="eyebrow">Where the time went</span></div>
        ${keys.map(k => {
          const cat = k === 'none' ? null : catById(k);
          return bar(cat?.name || 'Uncategorised', cat?.color || 'var(--text-faint)', planned[k] || 0, actual[k] || 0, max);
        }).join('')}
        ${worst && (planned[worst] - (actual[worst] || 0)) > 30 ? `
          <div class="insight">You planned ${esc(fmtDur(planned[worst] - (actual[worst] || 0)))} more
          ${esc(catById(worst)?.name || 'time')} than you kept. Try scheduling less of it next week.</div>` : ''}
        ${best && (actual[best] || 0) >= (planned[best] || 0) * 0.8 ? `
          <div class="insight good-text">${esc(catById(best)?.name || 'That category')} is your most reliable block — protect it.</div>` : ''}
      ` : `<div class="empty-state">Nothing scheduled this week yet.<br>
            <span class="dim">Plan a few blocks, then confirm them as the week goes.</span></div>`}

      ${goals.length ? `
        <div class="section-head"><span class="eyebrow">Hours invested per goal</span></div>
        <div class="card">
          ${goals.map(g => {
            const mins = goalHours(g.id, days);
            return `<div class="rail-goal">
              <span style="flex:1">${esc(g.title)}</span>
              <span class="mono ${mins ? '' : 'dim'}">${esc(fmtDur(mins))}</span>
            </div>`;
          }).join('')}
          <p class="dim small" style="margin:10px 0 0">Link a block to a goal when you create it, and its hours land here.</p>
        </div>` : ''}
    </div>`;
  }
};

registerActions({
  reviewWeek: d => {
    const next = S.weekOffset + Number(d.dir);
    if (next > 0) return;
    S.weekOffset = next;
    haptic('light');
    window.cadenceRerender();
  }
});
