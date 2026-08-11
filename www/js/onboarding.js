// Goal ideas — a light onboarding pass (interests/hobbies -> suggested
// goals) shown once on first sign-in, and reachable any time from the Goals
// screen via "Ideas". Nothing here calls out to a network; it's a static
// starter set meant to unblock "what should I even set as a goal".
import { S, save, savePrefs, mine } from './state.js';
import { t } from './i18n.js';
import { esc } from './util.js';
import { openSheet, closeSheet, haptic, registerActions, toast, $ } from './ui.js';

const INTERESTS = [
  ['fitness', 'Fitness & health'], ['career', 'Career & work'], ['learning', 'Learning a skill'],
  ['finance', 'Money & finance'], ['relationships', 'Relationships'], ['creativity', 'Creative projects'],
  ['spirituality', 'Faith & mindfulness'], ['travel', 'Travel'], ['sideproject', 'Side project']
];

const SUGGESTIONS = {
  fitness: ['Run a 5k without stopping', 'Strength train 3x a week for 8 weeks', 'Hit 8,000 steps a day for a month'],
  career: ['Ask for feedback from your manager', 'Finish one certification this quarter', 'Update your resume or portfolio'],
  learning: ['Finish one online course', 'Read 12 books this year', 'Practice a new language 15 min a day'],
  finance: ['Build a 3-month emergency fund', 'Track every expense for 30 days', 'Pay off one debt fully'],
  relationships: ['Call one friend or family member weekly', 'Plan a monthly date night', 'Write a letter to someone you appreciate'],
  creativity: ['Finish one creative project', 'Write for 15 minutes daily', 'Share your work publicly once'],
  spirituality: ['Meditate 10 minutes daily', 'Reflect for 15 minutes each morning', 'Keep a gratitude journal for 30 days'],
  travel: ['Plan one trip this year', 'Visit somewhere new nearby monthly', 'Save toward a specific trip'],
  sideproject: ['Ship a first version in 30 days', 'Talk to 10 potential users', 'Set a revenue goal for month one']
};

let picked = new Set();

export function maybeShowOnboarding() {
  if (S.prefs.onboarded) return;
  openInterestSheet(true);
}

export function openInterestSheet(firstRun = false) {
  picked = new Set();
  openSheet({
    title: firstRun ? 'What matters to you?' : 'Goal ideas',
    dismissable: !firstRun,
    body: `<p class="sheet-msg">Pick a few areas — I'll suggest goals for each.</p>
      <div class="chip-row">${INTERESTS.map(([k, l]) =>
        `<button type="button" class="chip tap" data-act="toggleInterest" data-k="${k}">${esc(l)}</button>`).join('')}</div>`,
    footer: `<button class="btn primary" data-act="showSuggestions" data-first="${firstRun ? 1 : 0}">Show ideas</button>`
  });
}

function showSuggestions(firstRun) {
  const areas = [...picked];
  if (!areas.length) { toast('Pick at least one', 'warn'); return; }
  const items = areas.flatMap(k => SUGGESTIONS[k].map(title => ({ area: k, title })));
  openSheet({
    title: 'Goal ideas',
    body: `<p class="sheet-msg">Tap any that resonate — you can edit them later.</p>
      <div class="list">${items.map(it => `
      <button class="rail-goal tap" style="width:100%;text-align:left;background:var(--surface-2);border-radius:10px;padding:10px" data-act="addSuggested" data-title="${esc(it.title)}" data-area="${it.area}">
        <span style="flex:1">${esc(it.title)}</span><span class="dim">＋</span>
      </button>`).join('')}</div>`,
    footer: `<button class="btn primary" data-act="finishOnboarding" data-first="${firstRun ? 1 : 0}">${esc(t('common.done'))}</button>`
  });
}

// Starter categories, offered at the end of first run so a brand-new account
// has something to colour-code with instead of an empty picker.
const STARTER_CATS = [
  { name: 'Deep work', color: '#F2994A' },
  { name: 'Meetings', color: '#6FA8FF' },
  { name: 'Health', color: '#3ECFB2' },
  { name: 'Family', color: '#E86AA6' }
];

function finishFirstRun() {
  if (!mine('categories').length) {
    STARTER_CATS.forEach((c, i) => save('categories', { name: c.name, color: c.color, sort: i }));
  }
  savePrefs({ onboarded: true });
  closeSheet();
  toast('You\u2019re set — add your first block on Today', 'good');
}

registerActions({
  toggleInterest: (d, node) => {
    if (picked.has(d.k)) { picked.delete(d.k); node.classList.remove('on'); }
    else { picked.add(d.k); node.classList.add('on'); }
    haptic('light');
  },
  showSuggestions: d => showSuggestions(d.first === '1'),
  addSuggested: (d, node) => {
    save('goals', { title: d.title, area: d.area, horizon: 'year' });
    haptic('success'); toast(t('msg.saved'), 'good');
    node.setAttribute('disabled', 'true'); node.querySelector('span:last-child').textContent = '✓';
  },
  finishOnboarding: d => { if (d.first === '1') finishFirstRun(); else closeSheet(); }
});
