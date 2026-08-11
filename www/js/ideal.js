// Current self vs ideal self.
// The ideal self is defined once: who you want to be, how many hours a week
// each area deserves, and when in the day it belongs. Everything after that
// is measured against it — the app never guesses what "better" means for you.
import { S, savePrefs, categories, catById, categoryTotals, occurrencesOn, isBlockDone, mine } from './state.js';
import { esc, fmtDur, todayISO } from './util.js';
import { openSheet, closeSheet, readForm, toast, haptic, field, $ } from './ui.js';

export const PARTS = [['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['any', 'Any time']];
const partOf = min => min < 12 * 60 ? 'morning' : min < 17 * 60 ? 'afternoon' : 'evening';

export function ideal() {
  return {
    statement: S.prefs.ideal_statement || '',
    areas: Array.isArray(S.prefs.ideal_areas) ? S.prefs.ideal_areas : [],
    setAt: S.prefs.ideal_set_at || null
  };
}

export const idealIsSet = () => !!ideal().setAt && ideal().areas.length > 0;

export function saveIdeal({ statement, areas }) {
  savePrefs({
    ideal_statement: statement ?? S.prefs.ideal_statement ?? '',
    ideal_areas: areas ?? S.prefs.ideal_areas ?? [],
    ideal_set_at: S.prefs.ideal_set_at || new Date().toISOString()
  });
}

// ------------------------------------------------------------- measurement

const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);

// Six honest measures, each 0–100, blended into one score. The weights say
// what this app believes: keeping your word matters most, then whether the
// time went to what you said you cared about.
const WEIGHTS = [
  ['kept', 'Plan kept', .25],
  ['goal', 'Time on goals', .20],
  ['shape', 'Matched your ideal day', .20],
  ['deep', 'Uninterrupted focus', .15],
  ['ontime', 'Confirmed on the day', .10],
  ['accounted', 'Hours accounted for', .10]
];

export function efficiency(days) {
  const { planned, actual } = categoryTotals(days);
  const totalPlanned = Object.values(planned).reduce((a, b) => a + b, 0);
  const totalActual = Object.values(actual).reduce((a, b) => a + b, 0);

  let goalMin = 0, doneMin = 0, inPlace = 0, placed = 0, onDay = 0, confirmed = 0;
  const areaMap = new Map(ideal().areas.map(a => [a.category_id, a]));

  days.forEach(day => occurrencesOn(day).forEach(o => {
    if (!isBlockDone(o, day)) return;
    const mins = o.end - o.start;
    doneMin += mins;
    if (o.goal_id) goalMin += mins;
    const want = areaMap.get(o.category_id);
    if (want && want.part && want.part !== 'any') {
      placed += mins;
      if (partOf(o.start) === want.part) inPlace += mins;
    }
    confirmed++;
    const row = S.activity.find(a => a.kind === 'block-done'
      && String(a.detail || '').startsWith(`${day}|${o.key}|`));
    if (row && String(row.at || '').slice(0, 10) === day) onDay++;
  }));

  const focusMin = S.activity
    .filter(a => a.user_id === S.user?.id && a.kind === 'focus' && days.includes(String(a.at || '').slice(0, 10)))
    .reduce((a, b) => a + (b.minutes || 0), 0);

  const targetWeek = ideal().areas.reduce((a, b) => a + (Number(b.hours) || 0), 0) * 60;
  const wakingWeek = 16 * 60 * days.length;

  const parts = {
    kept: pct(totalActual, totalPlanned),
    goal: pct(goalMin, doneMin),
    shape: placed ? pct(inPlace, placed) : (areaMap.size ? 0 : 50),
    deep: pct(focusMin, 5 * 25 * (days.length / 7)),
    ontime: confirmed ? pct(onDay, confirmed) : 0,
    accounted: pct(totalPlanned, Math.max(targetWeek || 0, wakingWeek * 0.35))
  };

  const score = Math.round(WEIGHTS.reduce((a, [k, , w]) => a + parts[k] * w, 0));

  // Where you are against who you said you want to be.
  const areas = ideal().areas.map(a => {
    const target = (Number(a.hours) || 0) * 60;
    const got = actual[a.category_id] || 0;
    return {
      category_id: a.category_id,
      name: catById(a.category_id)?.name || 'Area',
      color: catById(a.category_id)?.color || 'var(--accent)',
      identity: a.identity || '',
      part: a.part || 'any',
      target, actual: got, pct: pct(got, target)
    };
  }).sort((x, y) => y.target - x.target);

  return { score, parts, labels: WEIGHTS, areas, totalPlanned, totalActual, goalMin, focusMin };
}

// An encouraging coach, not a scoreboard: one line, always with a next move.
export function coachLine(e) {
  const gap = e.areas.filter(a => a.target && a.pct < 60).sort((a, b) => a.pct - b.pct)[0];
  const win = e.areas.filter(a => a.target && a.pct >= 90)[0];
  if (!e.totalPlanned) return 'Nothing scheduled yet — put one block in for tomorrow and you are already moving.';
  if (e.score >= 85) return `Outstanding week. You are living close to the person you described${win ? ` — ${esc(win.name)} especially` : ''}.`;
  if (e.score >= 65) return `Solid week.${gap ? ` The one to reclaim next week is ${esc(gap.name)} — you are at ${gap.pct}% of the hours you wanted.` : ' Keep the rhythm going.'}`;
  if (e.score >= 40) return `Real progress, uneven days.${gap ? ` Protect two ${esc(gap.name)} blocks next week and this jumps.` : ' Confirm your blocks as you go and this gets easier to read.'}`;
  return 'Rough week — everyone has them. Pick one block for tomorrow and confirm it; that is the whole trick.';
}

// ------------------------------------------------------------------- setup

function areaRow(cat, existing) {
  const a = existing || {};
  return `<div class="ideal-row" data-cat="${cat.id}">
    <div class="ideal-row-head">
      <span class="rv-label"><i class="dot" style="background:${cat.color}"></i>${esc(cat.name)}</span>
      <span class="ideal-hours">
        <input class="input sm mono" type="number" min="0" max="60" step="1"
               name="h_${cat.id}" value="${a.hours ?? ''}" placeholder="0" inputmode="numeric">
        <span class="dim small">h / week</span>
      </span>
    </div>
    <div class="segmented sm">
      ${PARTS.map(([k, l]) => `<button type="button" class="seg-item${(a.part || 'any') === k ? ' on' : ''}"
        data-act="idealPart" data-cat="${cat.id}" data-value="${k}">${l}</button>`).join('')}
    </div>
    <input type="hidden" name="p_${cat.id}" value="${a.part || 'any'}">
    <input class="input" name="i_${cat.id}" placeholder="I am someone who…" value="${esc(a.identity || '')}">
  </div>`;
}

export function openIdealSheet() {
  const cur = ideal();
  const existing = new Map(cur.areas.map(a => [a.category_id, a]));
  const cats = categories();
  if (!cats.length) { toast('Add a category first', 'warn'); return; }
  openSheet({
    title: cur.setAt ? 'Your ideal self' : 'Define your ideal self',
    full: true,
    body: `
      <p class="sheet-msg">This is the person the week gets measured against. Write it once — you can revise it any time.</p>
      ${field('Who do you want to be?', `<textarea class="input" name="statement" rows="3"
        placeholder="A calm, present father who ships real work and trains four times a week.">${esc(cur.statement)}</textarea>`)}
      <div class="section-head"><span class="eyebrow">Hours each area deserves</span></div>
      <p class="dim small">Leave an area blank if it is not part of this season of your life.</p>
      ${cats.map(c => areaRow(c, existing.get(c.id))).join('')}`,
    footer: `<button class="btn ghost" data-act="sheetClose">Cancel</button>
             <button class="btn primary" data-act="idealSave">Save</button>`
  });
}

export const idealActions = {
  idealPart: (d, node) => {
    node.parentNode.querySelectorAll('.seg-item').forEach(b => b.classList.toggle('on', b === node));
    const hidden = node.closest('.ideal-row')?.querySelector(`input[name="p_${d.cat}"]`);
    if (hidden) hidden.value = d.value;
  },
  idealSave: (d, node) => {
    const sheet = node.closest('.sheet');
    const f = readForm(sheet);
    const areas = categories().map(c => ({
      category_id: c.id,
      hours: Number(f[`h_${c.id}`]) || 0,
      part: f[`p_${c.id}`] || 'any',
      identity: (f[`i_${c.id}`] || '').trim()
    })).filter(a => a.hours > 0 || a.identity);
    if (!areas.length) { toast('Give at least one area some hours', 'warn'); return; }
    saveIdeal({ statement: (f.statement || '').trim(), areas });
    haptic('success');
    closeSheet();
    toast('Ideal self saved', 'good');
    window.cadenceRerender();
  }
};
