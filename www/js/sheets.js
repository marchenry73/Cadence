// Every editor in the app. Sheets, not pages: they slide up over the current
// screen, keep its context visible behind them, and drag away.
import { S, save, remove, catById, categories, freeGaps, overlapsOn, logActivity } from './state.js';
import { t, dateLabel } from './i18n.js';
import { esc, fmtRange, todayISO, addDays, clamp } from './util.js';
import { openSheet, closeSheet, confirmSheet, toast, haptic, registerActions, readForm, $, field } from './ui.js';
import { uploadImage, deleteImage, pickFile, hydrateImages } from './images.js';
import { startTimer } from './timer.js';

let draft = {};

const timeValue = min => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const minsFrom = (v, fallback = 540) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || ''));
  return m ? clamp(Number(m[1]) * 60 + Number(m[2]), 0, 1440) : fallback;
};

const catOptions = selected => `<select class="input" name="category_id">
  <option value="">${esc(t('common.none'))}</option>
  ${categories().map(c => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
</select>`;

// ------------------------------------------------------------------ blocks

export function openBlockSheet(opts = {}) {
  const occ = opts.occ || null;
  const day = opts.day || S.day;
  draft = {
    kind: occ?.kind || 'event',
    id: occ?.id || null,
    routine_id: occ?.routine_id || null,
    day,
    scope: 'once',
    image_path: occ?.image_path || null,
    start: occ ? occ.start : (opts.start ?? 540),
    end: occ ? occ.end : (opts.end ?? (opts.start ?? 540) + 60),
    title: occ?.title || opts.title || '',
    category_id: occ?.category_id || null,
    notes: occ?.notes || ''
  };

  const isRoutine = draft.kind === 'routine';
  openSheet({
    title: occ ? t('block.edit') : t('block.new'),
    body: `
      <div class="sheet-sub">${esc(dateLabel(day))}</div>
      ${isRoutine ? `
        <div class="scope-pick" data-seg="scope">
          <button type="button" class="seg-item on" data-act="scopePick" data-value="once">${esc(t('block.editOnce'))}</button>
          <button type="button" class="seg-item" data-act="scopePick" data-value="series">${esc(t('block.routine'))}</button>
        </div>` : ''}
      ${field(t('block.title'), `<input class="input" name="title" value="${esc(draft.title)}" placeholder="${esc(t('block.title'))}" autocomplete="off">`)}
      <div class="field-row">
        ${field(t('block.start'), `<input class="input" type="time" name="start" value="${timeValue(draft.start)}" step="300">`)}
        ${field(t('block.end'), `<input class="input" type="time" name="end" value="${timeValue(draft.end)}" step="300">`)}
      </div>
      <div class="chip-row">
        ${[15, 30, 60, 120].map(m => `<button type="button" class="chip tap" data-act="blockLen" data-min="${m}">${m < 60 ? m + 'm' : (m / 60) + 'h'}</button>`).join('')}
      </div>
      ${field(t('block.category'), catOptions(draft.category_id))}
      ${field(t('block.notes'), `<textarea class="input" name="notes" rows="2">${esc(draft.notes)}</textarea>`)}
      <div class="field">
        <span class="field-label">${esc(t('block.image'))}</span>
        <div id="imgSlot">${imageSlot(draft.image_path)}</div>
      </div>
      <div id="clashWarn"></div>`,
    footer: `
      ${occ ? `<button class="btn ghost danger-text" data-act="blockDelete">${esc(t('common.delete'))}</button>` : ''}
      ${isRoutine ? `<button class="btn ghost" data-act="blockSkip">${esc(t('block.skipOnce'))}</button>` : ''}
      <button class="btn primary" data-act="blockSave">${esc(t('common.save'))}</button>`,
    onMount: root => {
      hydrateImages(root);
      const check = () => showClash(root);
      root.querySelectorAll('input[name=start],input[name=end]').forEach(n => n.addEventListener('change', check));
      check();
    }
  });
}

const imageSlot = path => path
  ? `<div class="img-preview"><img data-img="${esc(path)}" alt="">
       <button type="button" class="icon-btn img-x" data-act="blockImageRemove">✕</button></div>`
  : `<div class="img-empty tap" data-act="blockImageAdd">
       <span>＋</span><span class="img-empty-label">${esc(t('block.addImage'))}</span></div>`;

function showClash(root) {
  const f = readForm(root);
  const start = minsFrom(f.start, draft.start), end = minsFrom(f.end, draft.end);
  const ignore = draft.id ? (draft.kind === 'routine' ? 'r:' + draft.routine_id + ':' + draft.day : 'e:' + draft.id) : null;
  const clash = overlapsOn(draft.day, start, Math.max(end, start + 5), ignore)[0];
  const host = $('#clashWarn', root);
  if (host) host.innerHTML = clash
    ? `<div class="warnbar">${esc(t('block.overlap', { title: clash.title }))} · ${esc(fmtRange(clash.start, clash.end, S.prefs.clock24))}</div>`
    : '';
}

// ------------------------------------------------------------------ tasks

export function openTaskSheet(taskId = null) {
  const task = taskId ? S.tasks.find(x => x.id === taskId) : null;
  draft = { id: task?.id || null };
  openSheet({
    title: task ? t('task.edit') : t('task.new'),
    body: `
      ${field(t('task.title'), `<input class="input" name="title" value="${esc(task?.title || '')}" autocomplete="off">`)}
      <div class="field-row">
        ${field(t('task.due'), `<input class="input" type="date" name="due_date" value="${esc(task?.due_date || '')}">`)}
        ${field(t('task.estimate'), `<input class="input" type="number" name="est_min" min="5" step="5" value="${task?.est_min ?? 30}">`)}
      </div>
      ${field(t('block.category'), catOptions(task?.category_id))}
      <div class="field-row">
        ${field(t('task.importance'), rangeInput('importance', task?.importance ?? 5))}
        ${field(t('task.urgency'), rangeInput('urgency', task?.urgency ?? 5))}
      </div>
      ${field(t('block.notes'), `<textarea class="input" name="notes" rows="2">${esc(task?.notes || '')}</textarea>`)}`,
    footer: `
      ${task ? `<button class="btn ghost danger-text" data-act="taskDelete">${esc(t('common.delete'))}</button>` : ''}
      ${task && !task.done_at ? `<button class="btn ghost" data-act="taskToCalendar">${esc(t('task.schedule'))}</button>` : ''}
      <button class="btn primary" data-act="taskSave">${esc(t('common.save'))}</button>`
  });
}

const rangeInput = (name, value) =>
  `<div class="range-wrap"><input type="range" name="${name}" min="1" max="10" value="${value}"
     oninput="this.nextElementSibling.textContent=this.value"><output>${value}</output></div>`;

// ------------------------------------------------------------------ goals

export function openGoalSheet(goalId = null) {
  const g = goalId ? S.goals.find(x => x.id === goalId) : null;
  draft = { id: g?.id || null };
  openSheet({
    title: g ? t('goal.edit') : t('goal.new'),
    body: `
      ${field(t('goal.title'), `<input class="input" name="title" value="${esc(g?.title || '')}" autocomplete="off">`)}
      <div class="field-row">
        ${field(t('goal.area'), `<input class="input" name="area" value="${esc(g?.area || 'personal')}">`)}
        ${field(t('goal.horizon'), `<select class="input" name="horizon">
          ${['quarter', 'year', 'life'].map(h => `<option value="${h}"${g?.horizon === h ? ' selected' : ''}>${h}</option>`).join('')}
        </select>`)}
      </div>
      ${field(t('goal.target'), `<input class="input" type="date" name="target_date" value="${esc(g?.target_date || '')}">`)}
      ${field(t('goal.why'), `<textarea class="input" name="why" rows="2">${esc(g?.why || '')}</textarea>`)}`,
    footer: `
      ${g ? `<button class="btn ghost danger-text" data-act="goalDelete">${esc(t('common.delete'))}</button>` : ''}
      <button class="btn primary" data-act="goalSave">${esc(t('common.save'))}</button>`
  });
}

export function openCheckinSheet(goalId) {
  draft = { goal_id: goalId };
  const g = S.goals.find(x => x.id === goalId);
  openSheet({
    title: t('goal.addCheckin'),
    body: `
      ${field(t('goal.progress'), rangeInput('progress', g?.progress ?? 0).replace('min="1" max="10"', 'min="0" max="100" step="5"'))}
      ${field(t('block.notes'), `<textarea class="input" name="note" rows="3"></textarea>`)}`,
    footer: `<button class="btn primary" data-act="checkinSave">${esc(t('common.save'))}</button>`
  });
}

// ------------------------------------------------------------------ categories

export function openCategorySheet(catId = null) {
  const c = catId ? catById(catId) : null;
  draft = { id: c?.id || null, color: c?.color || '#7C6AF0' };
  const palette = ['#7C6AF0', '#3ECFB2', '#FF8462', '#6FA8FF', '#F0C674', '#E86AA6', '#8FD46A'];
  openSheet({
    title: c ? t('common.edit') : t('set.addCategory'),
    body: `
      ${field(t('block.title'), `<input class="input" name="name" value="${esc(c?.name || '')}" autocomplete="off">`)}
      <div class="field"><span class="field-label">${esc(t('set.accent'))}</span>
        <div class="swatches" data-seg="color">
          ${palette.map(p => `<button type="button" class="swatch${p === draft.color ? ' on' : ''}"
            style="background:${p}" data-act="catColor" data-value="${p}" aria-label="${p}"></button>`).join('')}
        </div>
      </div>`,
    footer: `
      ${c ? `<button class="btn ghost danger-text" data-act="catDelete">${esc(t('common.delete'))}</button>` : ''}
      <button class="btn primary" data-act="catSave">${esc(t('common.save'))}</button>`
  });
}

// ------------------------------------------------------------------ quick add

// One field that takes "gym 6-7am" or "call mum tomorrow 3pm 45m" and works
// out what you meant. Anything it cannot parse becomes a task.
export function openQuickAdd() {
  draft = {};
  openSheet({
    title: t('common.add'),
    body: `
      <input class="input input-lg" name="phrase" autocomplete="off" autocapitalize="sentences"
             placeholder="${esc('Gym 6–7am · Draft brief tomorrow 45m')}">
      <div class="qa-preview" id="qaPreview"></div>`,
    footer: `<button class="btn primary" data-act="quickAddCommit">${esc(t('common.add'))}</button>`,
    onMount: root => {
      const input = $('input[name=phrase]', root);
      const update = () => { $('#qaPreview', root).innerHTML = previewPhrase(input.value); };
      input.addEventListener('input', update);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitQuickAdd(); } });
      input.focus();
      update();
    }
  });
}

export function parsePhrase(text) {
  let s = String(text || '').trim();
  if (!s) return null;
  let day = S.day;

  if (/\btomorrow\b/i.test(s)) { day = addDays(todayISO(), 1); s = s.replace(/\btomorrow\b/i, ''); }
  else if (/\btoday\b/i.test(s)) { day = todayISO(); s = s.replace(/\btoday\b/i, ''); }

  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const wd = weekdays.findIndex(w => new RegExp('\\b' + w + '\\b', 'i').test(s));
  if (wd >= 0) {
    const base = new Date();
    const delta = (wd - base.getDay() + 7) % 7 || 7;
    day = addDays(todayISO(), delta);
    s = s.replace(new RegExp('\\b' + weekdays[wd] + '\\b', 'i'), '');
  }

  let category_id = null;
  const tag = s.match(/#(\w+)/);
  if (tag) {
    const found = categories().find(c => c.name.toLowerCase().startsWith(tag[1].toLowerCase()));
    if (found) category_id = found.id;
    s = s.replace(tag[0], '');
  }

  const range = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–to]{1,2}\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  const at = s.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  const dur = s.match(/\b(\d{1,3})\s*(m|min|mins|minutes|h|hr|hrs|hours)\b/i);

  const to24 = (h, ap, other) => {
    h = Number(h);
    const meridiem = (ap || other || '').toLowerCase();
    if (meridiem === 'pm' && h < 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    if (!meridiem && h <= 7) h += 12;   // "gym 6-7" almost never means 6am at night
    return h;
  };

  let start = null, end = null;
  if (range) {
    start = to24(range[1], range[3], range[6]) * 60 + Number(range[2] || 0);
    end = to24(range[4], range[6], range[3]) * 60 + Number(range[5] || 0);
    if (end <= start) end = Math.min(1440, start + 60);
    s = s.replace(range[0], '');
  } else if (at) {
    start = to24(at[1], at[3]) * 60 + Number(at[2] || 0);
    s = s.replace(at[0], '');
  }

  let minutes = null;
  if (dur) {
    const n = Number(dur[1]);
    minutes = /^h/i.test(dur[2]) ? n * 60 : n;
    s = s.replace(dur[0], '');
  }
  if (start != null && end == null) end = Math.min(1440, start + (minutes || 60));

  const title = s.replace(/\s{2,}/g, ' ').trim();
  if (!title) return null;
  return start == null
    ? { type: 'task', title, day, category_id, est_min: minutes || 30 }
    : { type: 'block', title, day, start, end, category_id };
}

function previewPhrase(text) {
  const p = parsePhrase(text);
  if (!p) return `<span class="dim">${esc(t('block.title'))}…</span>`;
  const cat = p.category_id ? catById(p.category_id)?.name : null;
  return p.type === 'block'
    ? `<b>${esc(p.title)}</b><span class="dim"> · ${esc(dateLabel(p.day, { weekday: 'short', month: 'short', day: 'numeric' }))} · ${esc(fmtRange(p.start, p.end, S.prefs.clock24))}${cat ? ' · ' + esc(cat) : ''}</span>`
    : `<b>${esc(p.title)}</b><span class="dim"> · ${esc(t('nav.tasks'))} · ${p.est_min}${esc(t('common.minutes'))}${cat ? ' · ' + esc(cat) : ''}</span>`;
}

function commitQuickAdd() {
  const p = parsePhrase($('input[name=phrase]')?.value);
  if (!p) { toast(t('block.title')); return; }
  if (p.type === 'block') {
    save('events', { title: p.title, day: p.day, start_min: p.start, end_min: p.end, category_id: p.category_id });
  } else {
    save('tasks', { title: p.title, due_date: p.day, est_min: p.est_min, category_id: p.category_id, importance: 5, urgency: 5 });
  }
  haptic('success');
  closeSheet();
  toast(t('msg.saved'), 'good');
}

// ------------------------------------------------------------------ actions

export const sheetActions = {
  sheetClose: () => closeSheet(),

  scopePick: (d, node) => {
    draft.scope = d.value;
    node.parentNode.querySelectorAll('.seg-item').forEach(b => b.classList.toggle('on', b === node));
  },

  blockLen: d => {
    const root = $('#sheet');
    const start = minsFrom(readForm(root).start, draft.start);
    $('input[name=end]', root).value = timeValue(Math.min(1440, start + Number(d.min)));
    showClash(root);
    haptic('light');
  },

  blockImageAdd: async () => {
    const file = await pickFile();
    if (!file) return;
    const slot = $('#imgSlot');
    slot.innerHTML = `<div class="img-empty">${esc(t('block.uploading'))}…</div>`;
    try {
      draft.image_path = await uploadImage(file);
      slot.innerHTML = imageSlot(draft.image_path);
      hydrateImages(slot);
      haptic('success');
    } catch (e) {
      slot.innerHTML = imageSlot(null);
      toast(e.message === 'too-big' ? t('msg.imageTooBig')
        : e.message === 'bad-type' ? t('msg.badImage')
        : t('msg.somethingWrong'), 'warn');
    }
  },

  blockImageRemove: async () => {
    const path = draft.image_path;
    draft.image_path = null;
    $('#imgSlot').innerHTML = imageSlot(null);
    if (path) deleteImage(path);
  },

  blockSave: () => {
    const f = readForm();
    const title = (f.title || '').trim();
    if (!title) { toast(t('block.title'), 'warn'); return; }
    const start = minsFrom(f.start, draft.start);
    const end = Math.max(start + 5, minsFrom(f.end, draft.end));
    const patch = {
      title, start_min: start, end_min: end,
      category_id: f.category_id || null,
      notes: (f.notes || '').trim() || null
    };

    if (draft.kind === 'routine' && draft.scope === 'series') {
      save('routines', { id: draft.routine_id, ...patch });
    } else if (draft.kind === 'routine') {
      // "Just today" becomes a one-off block that shadows the routine.
      save('events', {
        ...patch, day: draft.day, routine_id: draft.routine_id, image_path: draft.image_path || null
      });
    } else {
      save('events', {
        id: draft.id, ...patch, day: draft.day,
        routine_id: draft.routine_id || null, image_path: draft.image_path || null
      });
    }
    haptic('success');
    closeSheet();
    toast(t('msg.saved'), 'good');
  },

  blockDelete: async () => {
    const ok = await confirmSheet({ title: t('common.delete'), message: t('msg.confirmDelete') });
    if (!ok) return;
    if (draft.kind === 'routine') {
      const r = S.routines.find(x => x.id === draft.routine_id);
      if (r) save('routines', { id: r.id, skip_dates: [...(r.skip_dates || []), draft.day] });
    } else if (draft.id) {
      remove('events', draft.id);
      if (draft.image_path) deleteImage(draft.image_path);
    }
    toast(t('msg.deleted'));
  },

  blockSkip: () => {
    const r = S.routines.find(x => x.id === draft.routine_id);
    if (r) save('routines', { id: r.id, skip_dates: [...(r.skip_dates || []), draft.day] });
    haptic('light');
    closeSheet();
  },

  taskSave: () => {
    const f = readForm();
    const title = (f.title || '').trim();
    if (!title) { toast(t('task.title'), 'warn'); return; }
    save('tasks', {
      id: draft.id, title,
      due_date: f.due_date || null,
      est_min: Number(f.est_min) || 30,
      category_id: f.category_id || null,
      importance: Number(f.importance) || 5,
      urgency: Number(f.urgency) || 5,
      notes: (f.notes || '').trim() || null
    });
    haptic('success');
    closeSheet();
    toast(t('msg.saved'), 'good');
  },

  taskDelete: async () => {
    const ok = await confirmSheet({ title: t('common.delete'), message: t('msg.confirmDelete') });
    if (!ok) return;
    remove('tasks', draft.id);
    toast(t('msg.deleted'));
  },

  // Drop the task into the first gap today that fits its estimate.
  taskToCalendar: () => {
    const task = S.tasks.find(x => x.id === draft.id);
    if (!task) return;
    const need = task.est_min || 30;
    const gap = freeGaps(S.day, need)[0];
    const start = gap ? gap[0] : 540;
    save('events', {
      title: task.title, day: S.day, start_min: start, end_min: Math.min(1440, start + need),
      category_id: task.category_id || null
    });
    haptic('success');
    closeSheet();
    toast(t('msg.saved'), 'good');
  },

  goalSave: () => {
    const f = readForm();
    const title = (f.title || '').trim();
    if (!title) { toast(t('goal.title'), 'warn'); return; }
    save('goals', {
      id: draft.id, title,
      area: (f.area || 'personal').trim(),
      horizon: f.horizon || 'year',
      target_date: f.target_date || null,
      why: (f.why || '').trim() || null
    });
    haptic('success');
    closeSheet();
    toast(t('msg.saved'), 'good');
  },

  goalDelete: async () => {
    const ok = await confirmSheet({ title: t('common.delete'), message: t('msg.confirmDelete') });
    if (!ok) return;
    remove('goals', draft.id);
    toast(t('msg.deleted'));
  },

  checkinSave: () => {
    const f = readForm();
    save('checkins', {
      goal_id: draft.goal_id, at: new Date().toISOString(),
      progress: Number(f.progress) || 0, note: (f.note || '').trim() || null
    });
    save('goals', { id: draft.goal_id, progress: Number(f.progress) || 0 });
    haptic('success');
    closeSheet();
  },

  catColor: (d, node) => {
    draft.color = d.value;
    node.parentNode.querySelectorAll('.swatch').forEach(b => b.classList.toggle('on', b === node));
  },

  catSave: () => {
    const f = readForm();
    const name = (f.name || '').trim();
    if (!name) { toast(t('block.title'), 'warn'); return; }
    save('categories', { id: draft.id, name, color: draft.color, sort: categories().length });
    haptic('success');
    closeSheet();
  },

  catDelete: async () => {
    const ok = await confirmSheet({ title: t('common.delete'), message: t('msg.confirmDelete') });
    if (!ok) return;
    remove('categories', draft.id);
  },

  quickAddCommit: () => commitQuickAdd(),

  startFocusFor: d => {
    startTimer(Number(d.minutes) || 25, d.label || '');
    logActivity('focus-start', d.label || '', Number(d.minutes) || 25);
    closeSheet();
  }
};

registerActions(sheetActions);
