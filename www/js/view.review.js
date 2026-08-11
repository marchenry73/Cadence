// Weekly review — the honest mirror, and the only place progress is scored.
// Planned vs actual per category and per goal, one efficiency score built
// from six measures, your current self against the ideal self you defined,
// and the game layer (streak, level, badges, month challenge, leaderboard).
import { S, categoryTotals, goalHours, catById, mine, weekDays, occurrencesOn, isBlockDone, logActivity } from './state.js';
import { t, dateLabel } from './i18n.js';
import { esc, fmtDur, addDays, todayISO, hexA } from './util.js';
import { registerActions, haptic, toast, $ } from './ui.js';
import { efficiency, coachLine, ideal, idealIsSet, openIdealSheet, idealActions } from './ideal.js';
import { weekPoints, totalPoints, level, streakNow, longestStreak, BADGES, earnedBadges,
         checkBadges, monthChallenge, leaderboard, publishScore } from './gamify.js';

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

function scoreCard(e) {
  const ring = `conic-gradient(var(--accent) ${e.score * 3.6}deg, var(--surface-2) 0deg)`;
  return `<div class="card score-card">
    <div class="score-ring" style="background:${ring}">
      <div class="score-ring-in"><span class="score-n">${e.score}</span><span class="score-l">efficiency</span></div>
    </div>
    <div class="score-side">
      <p class="coach">${coachLine(e)}</p>
      <div class="sub-bars">
        ${e.labels.map(([k, label]) => `
          <div class="sub-bar">
            <div class="sub-bar-head"><span>${esc(label)}</span><span class="mono dim">${e.parts[k]}%</span></div>
            <div class="sub-track"><div class="sub-fill" style="width:${e.parts[k]}%"></div></div>
          </div>`).join('')}
      </div>
    </div>
  </div>`;
}

function idealCard(e) {
  if (!idealIsSet()) {
    return `<div class="card ideal-empty">
      <p class="eyebrow">Current self vs ideal self</p>
      <p class="dim">Describe the person you want to be and how many hours each part of your
      life deserves. Every week gets measured against that, not against a stranger's idea of productive.</p>
      <button class="btn primary" data-act="editIdeal">Define my ideal self</button>
    </div>`;
  }
  const st = ideal().statement;
  return `<div class="card">
    ${st ? `<p class="ideal-statement">“${esc(st)}”</p>` : ''}
    ${e.areas.map(a => `
      <div class="rv-row">
        <div class="rv-head">
          <span class="rv-label"><i class="dot" style="background:${a.color}"></i>${esc(a.name)}
            ${a.identity ? `<span class="dim small"> — ${esc(a.identity)}</span>` : ''}</span>
          <span class="rv-nums mono">${esc(fmtDur(a.actual))} <span class="dim">/ ${esc(fmtDur(a.target))}</span></span>
        </div>
        <div class="rv-track">
          <div class="rv-actual" style="width:${Math.min(100, a.pct)}%;background:${a.color}"></div>
        </div>
        <div class="rv-foot ${a.pct >= 90 ? 'good-text' : a.pct >= 50 ? '' : 'warn-text'}">
          ${a.pct}% of the ${esc(a.name.toLowerCase())} you said you wanted${a.part !== 'any' ? ` · you wanted it in the ${a.part}` : ''}
        </div>
      </div>`).join('')}
    <button class="btn ghost sm" data-act="editIdeal">Revise my ideal self</button>
  </div>`;
}

function gameCard(days, e) {
  const pts = weekPoints(days);
  const lv = level();
  const streak = streakNow();
  const have = earnedBadges();
  const ch = monthChallenge(days.reduce((a, d) => a + occurrencesOn(d)
    .filter(o => o.goal_id && isBlockDone(o, d)).reduce((x, o) => x + (o.end - o.start), 0), 0));
  const reviewed = S.activity.some(a => a.kind === 'review-done' && a.detail === days[0]);
  return `
    <div class="stat-row">
      <div class="stat"><div class="stat-n">${pts}</div><div class="stat-l">Points this week</div></div>
      <div class="stat"><div class="stat-n ${streak ? 'good' : ''}">${streak}🔥</div><div class="stat-l">Day streak</div></div>
      <div class="stat"><div class="stat-n">${lv.level}</div><div class="stat-l">Level</div></div>
    </div>
    <div class="card">
      <div class="lvl-head"><span class="eyebrow">Level ${lv.level}</span>
        <span class="dim small mono">${lv.points} / ${lv.nextAt}</span></div>
      <div class="sub-track"><div class="sub-fill" style="width:${lv.pct}%"></div></div>
      <div class="chal">
        <div class="chal-head"><span>${esc(ch.name)}</span><span class="mono dim">${ch.have}/${ch.target}</span></div>
        <div class="sub-track"><div class="sub-fill" style="width:${ch.pct}%"></div></div>
        <div class="dim small">${ch.done ? 'Challenge complete — nice.' : 'This month’s challenge'}</div>
      </div>
      <div class="badge-grid">
        ${BADGES.map(b => `<div class="badge${have.has(b.code) ? ' on' : ''}" title="${esc(b.hint)}">
          <span class="badge-icon">${b.icon}</span>
          <span class="badge-name">${esc(b.name)}</span>
          <span class="badge-hint dim">${have.has(b.code) ? 'Earned' : esc(b.hint)}</span>
        </div>`).join('')}
      </div>
      ${S.weekOffset === 0 ? `<button class="btn ${reviewed ? 'ghost' : 'primary'}" data-act="finishReview" data-week="${days[0]}"
        ${reviewed ? 'disabled' : ''}>${reviewed ? 'Review done for this week ✓' : 'Finish this week’s review (+30)'}</button>` : ''}
    </div>
    <div class="section-head"><span class="eyebrow">This week’s board</span></div>
    <div class="card" id="boardCard"><div class="dim small">Loading the board…</div></div>`;
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
    const e = efficiency(days);

    const worst = keys.filter(k => (planned[k] || 0) >= 60)
      .sort((a, b) => ((planned[b] || 0) - (actual[b] || 0)) - ((planned[a] || 0) - (actual[a] || 0)))[0];
    const best = keys.filter(k => (planned[k] || 0) >= 60)
      .sort((a, b) => ((actual[b] || 0) / (planned[b] || 1)) - ((actual[a] || 0) / (planned[a] || 1)))[0];

    const goals = mine('goals');
    const unconfirmed = days.filter(d => d < todayISO())
      .flatMap(d => occurrencesOn(d).filter(o => !isBlockDone(o, d))).length;

    return `<div class="pad">
      <div class="week-nav">
        <button class="icon-btn" data-act="reviewWeek" data-dir="-1">‹</button>
        <span class="mono">${esc(dateLabel(days[0], { month: 'short', day: 'numeric' }))} – ${esc(dateLabel(days[6], { month: 'short', day: 'numeric' }))}</span>
        <button class="icon-btn" data-act="reviewWeek" data-dir="1" ${S.weekOffset >= 0 ? 'disabled' : ''}>›</button>
      </div>

      ${scoreCard(e)}

      <div class="section-head"><span class="eyebrow">Current self vs ideal self</span></div>
      ${idealCard(e)}

      <div class="section-head"><span class="eyebrow">Your run</span></div>
      ${gameCard(days, e)}

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
  },

  async onMount(root) {
    const days = weekDays(S.weekOffset);
    const e = efficiency(days);

    // Anything newly earned gets celebrated once, here, where progress lives.
    const fresh = checkBadges(e.score);
    if (fresh.length) {
      haptic('success');
      toast(`${fresh[0].icon} Badge earned — ${fresh[0].name}`, 'good');
    }

    if (S.weekOffset === 0) {
      publishScore({ weekStart: days[0], points: weekPoints(days), streak: streakNow(), efficiency: e.score });
    }

    const card = root.querySelector('#boardCard');
    if (!card) return;
    if (!S.prefs.nickname) {
      card.innerHTML = `<p class="dim small">Pick a nickname to join the weekly board — it is the only thing other people see.</p>
        <button class="btn ghost sm" data-act="editNickname">Choose a nickname</button>`;
      return;
    }
    const rows = await leaderboard(days[0]);
    card.innerHTML = rows.length
      ? `<div class="board">${rows.map(r => `
          <div class="board-row${r.me ? ' me' : ''}">
            <span class="board-rank mono">${r.rank}</span>
            <span class="board-name">${esc(r.nickname || 'anon')}${r.me ? ' <span class="dim small">(you)</span>' : ''}</span>
            <span class="board-streak dim small">${r.streak}🔥</span>
            <span class="board-pts mono">${r.points}</span>
          </div>`).join('')}</div>
         <p class="dim small" style="margin:10px 0 0">Points reset every week, so a good week always counts.</p>`
      : `<p class="dim small">No scores posted yet this week — be first.</p>`;
  }
};

registerActions({
  ...idealActions,

  reviewWeek: d => {
    const next = S.weekOffset + Number(d.dir);
    if (next > 0) return;
    S.weekOffset = next;
    haptic('light');
    window.cadenceRerender();
  },

  editIdeal: () => openIdealSheet(),

  finishReview: (d, node) => {
    if (S.activity.some(a => a.kind === 'review-done' && a.detail === d.week)) return;
    logActivity('review-done', d.week);
    haptic('success');
    toast('Review logged — +30 points', 'good');
    node.setAttribute('disabled', 'true');
    window.cadenceRerender();
  }
});
