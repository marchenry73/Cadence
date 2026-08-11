// Settings — appearance, calendar behaviour, categories, workspace, support,
// data + the real self-service account deletion.
import { S, savePrefs, categories, save, remove } from './state.js';
import { t, LANGS, setLang } from './i18n.js';
import { esc } from './util.js';
import { ACCENTS } from './config.js';
import { signOut, deleteAccount, saveProfile } from './auth.js';
import { openCategorySheet } from './sheets.js';
import { submitTicket, myTickets } from './support.js';
import { storageUsed } from './images.js';
import { downloadICS, pickICSFile, parseICS, importICSEvents } from './ics.js';
import { CONFIG } from './config.js';
import { openSheet, closeSheet, confirmSheet, toast, haptic, registerActions, readForm, field, segmented } from './ui.js';

function toggleRow(label, name, on) {
  return `<button class="toggle-row tap" data-act="prefToggle" data-name="${name}">
    <span>${esc(label)}</span><span class="switch${on ? ' on' : ''}"></span>
  </button>`;
}

export default {
  id: 'settings',
  render() {
    return `<div class="pad settings">
      <div class="section-head"><span class="eyebrow">${esc(t('set.appearance'))}</span></div>
      <div class="card">
        <div class="row-label">${esc(t('set.theme'))}</div>
        <div class="segmented">
          ${['dark', 'light'].map(th => `<button class="seg-item${S.prefs.theme === th ? ' on' : ''}" data-act="prefSeg" data-name="theme" data-value="${th}">${esc(t('set.' + th))}</button>`).join('')}
        </div>
        <div class="row-label">${esc(t('set.accent'))}</div>
        <div class="swatches">${ACCENTS.map(c => `<button class="swatch${S.prefs.accent === c ? ' on' : ''}" style="background:${c}" data-act="prefColor" data-value="${c}"></button>`).join('')}</div>
        <div class="row-label">${esc(t('set.density'))}</div>
        <div class="segmented">
          ${['comfortable', 'compact'].map(d => `<button class="seg-item${S.prefs.density === d ? ' on' : ''}" data-act="prefSeg" data-name="density" data-value="${d}">${esc(t('set.' + d))}</button>`).join('')}
        </div>
        <div class="row-label">${esc(t('set.language'))}</div>
        <select class="input" data-act="langChange" onchange="window.cadenceSetLang(this.value)">
          ${LANGS.map(l => `<option value="${l.code}"${S.prefs.lang === l.code ? ' selected' : ''}>${esc(l.native)}</option>`).join('')}
        </select>
      </div>

      <div class="section-head"><span class="eyebrow">${esc(t('nav.calendar'))}</span></div>
      <div class="card">
        ${toggleRow(t('set.clock24'), 'clock24', S.prefs.clock24)}
        <div class="row-label">${esc(t('set.focusWindow'))}</div>
        <p class="dim small">${esc(t('set.focusHint'))}</p>
        <div class="field-row">
          <input class="input" type="time" value="${String(Math.floor(S.prefs.focus_start / 60)).padStart(2, '0')}:${String(S.prefs.focus_start % 60).padStart(2, '0')}" data-act="focusStart" onchange="window.cadenceFocusChange('start', this.value)">
          <input class="input" type="time" value="${String(Math.floor(S.prefs.focus_end / 60)).padStart(2, '0')}:${String(S.prefs.focus_end % 60).padStart(2, '0')}" data-act="focusEnd" onchange="window.cadenceFocusChange('end', this.value)">
        </div>
        <div class="row-label">${esc(t('set.weekStart'))}</div>
        <div class="segmented">
          ${[[0, 'Sun'], [1, 'Mon']].map(([v, l]) => `<button class="seg-item${S.prefs.week_starts === v ? ' on' : ''}" data-act="prefSeg" data-name="week_starts" data-value="${v}">${l}</button>`).join('')}
        </div>
      </div>

      <div class="section-head"><span class="eyebrow">${esc(t('set.categories'))}</span></div>
      <div class="card">
        <div class="list">${categories().map(c => `
          <button class="cat-row tap" data-act="editCat" data-id="${c.id}">
            <i class="dot" style="background:${c.color}"></i>${esc(c.name)}
          </button>`).join('')}</div>
        <button class="btn ghost sm" data-act="addCat">${esc(t('set.addCategory'))}</button>
      </div>

      <div class="section-head"><span class="eyebrow">${esc(t('set.haptics'))} · ${esc(t('set.reminders'))}</span></div>
      <div class="card">
        ${toggleRow(t('set.haptics'), 'haptics', S.prefs.haptics)}
        ${toggleRow(t('set.reminders'), 'reminders', S.prefs.reminders)}
      </div>

      <div class="section-head"><span class="eyebrow">${esc(t('nav.calendar'))} — import &amp; share</span></div>
      <div class="card">
        <p class="dim small">Works with Google Calendar, Outlook and Apple Calendar through .ics files.</p>
        <div class="btn-stack">
          <button class="btn ghost" data-act="importCalendar">Import a calendar (.ics)</button>
          <button class="btn ghost" data-act="exportCalendar">Export / share my calendar (.ics)</button>
        </div>
      </div>

      <div class="section-head"><span class="eyebrow">${esc(t('set.support'))}</span></div>
      <div class="card">
        <button class="btn ghost" data-act="openSupport">${esc(t('sup.support'))}</button>
      </div>

      <div class="section-head"><span class="eyebrow">${esc(t('set.account'))}</span></div>
      <div class="card">
        <div class="dim small mono">${esc(S.user?.email || '')}</div>
        <button class="btn ghost" data-act="doSignOut">${esc(t('set.signOut'))}</button>
        <button class="btn ghost danger-text" data-act="openDelete">${esc(t('set.deleteAccount'))}</button>
      </div>

      <div class="version-row dim small">Cadence v${esc(CONFIG.version)} · ${esc(CONFIG.build)}</div>
    </div>`;
  }
};

registerActions({
  prefSeg: d => { savePrefs({ [d.name]: /^\d+$/.test(d.value) ? Number(d.value) : d.value }); haptic('light'); window.cadenceRerender(); },
  prefColor: d => { savePrefs({ accent: d.value }); window.cadenceApplyAccent(d.value); window.cadenceRerender(); },
  prefToggle: d => { savePrefs({ [d.name]: !S.prefs[d.name] }); haptic('light'); window.cadenceRerender(); },

  addCat: () => openCategorySheet(),
  editCat: d => openCategorySheet(d.id),

  exportCalendar: () => { downloadICS(); haptic('success'); toast('Calendar file downloaded', 'good'); },
  importCalendar: async () => {
    const file = await pickICSFile();
    if (!file) return;
    try {
      const n = importICSEvents(parseICS(await file.text()));
      haptic('success');
      toast(n ? `${n} events imported` : 'Nothing to import', n ? 'good' : 'warn');
      window.cadenceRerender();
    } catch { toast(t('msg.somethingWrong'), 'warn'); }
  },

  openSupport: () => {
    let kind = 'support';
    openSheet({
      title: t('sup.title'),
      body: `
        <div class="segmented" id="supKind">
          ${['support', 'feedback', 'bug'].map(k => `<button type="button" class="seg-item${k === 'support' ? ' on' : ''}" data-act="supKindPick" data-value="${k}">${esc(t('sup.' + k))}</button>`).join('')}
        </div>
        ${field(t('sup.subject'), `<input class="input" name="subject" autocomplete="off">`)}
        ${field(t('sup.body'), `<textarea class="input" name="body" rows="4"></textarea>`)}
        <p class="dim small" id="supDiagHint" style="display:none">${esc(t('sup.diag'))}</p>`,
      footer: `<button class="btn primary" data-act="supSend">${esc(t('sup.send'))}</button>`,
      onMount: root => { root.dataset.kind = 'support'; }
    });
  },
  supKindPick: (d, node) => {
    const sheet = node.closest('.sheet');
    sheet.dataset.kind = d.value;
    node.parentNode.querySelectorAll('.seg-item').forEach(b => b.classList.toggle('on', b === node));
    sheet.querySelector('#supDiagHint').style.display = d.value === 'bug' ? '' : 'none';
  },
  supSend: async (d, node) => {
    const sheet = node.closest('.sheet');
    const kind = sheet.dataset.kind || 'support';
    const f = readForm(sheet);
    if (!f.subject?.trim() || !f.body?.trim()) { toast(t('sup.subject'), 'warn'); return; }
    try { await submitTicket({ kind, subject: f.subject, body: f.body }); haptic('success'); closeSheet(); toast(t('sup.sent'), 'good'); }
    catch { toast(t('msg.somethingWrong'), 'warn'); }
  },

  doSignOut: async () => { const ok = await confirmSheet({ title: t('set.signOut'), message: '', confirm: t('set.signOut'), danger: false }); if (ok) signOut(); },

  openDelete: () => {
    openSheet({
      title: t('set.deleteAccount'),
      body: `<p class="sheet-msg danger-text">${esc(t('set.deleteWarn'))}</p>
        ${field(t('set.deleteConfirm'), `<input class="input" name="confirm" autocomplete="off" autocapitalize="characters">`)}`,
      footer: `<button class="btn danger" data-act="confirmDelete">${esc(t('set.deleteAccount'))}</button>`
    });
  },
  confirmDelete: async () => {
    if ((readForm().confirm || '').trim().toUpperCase() !== 'DELETE') { toast(t('set.deleteConfirm'), 'warn'); return; }
    haptic('warn');
    try { await deleteAccount(); } catch { toast(t('msg.somethingWrong'), 'warn'); }
  }
});

window.cadenceSetLang = async code => { await setLang(code); savePrefs({ lang: code }); window.cadenceRerender(); };
window.cadenceFocusChange = (which, val) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(val);
  if (!m) return;
  savePrefs({ [which === 'start' ? 'focus_start' : 'focus_end']: Number(m[1]) * 60 + Number(m[2]) });
  window.cadenceRerender();
};
