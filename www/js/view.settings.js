// Settings — appearance, calendar behaviour, categories, workspace, support,
// data + the real self-service account deletion.
import { S, savePrefs, categories, save, remove } from './state.js';
import { t, LANGS, setLang } from './i18n.js';
import { esc } from './util.js';
import { ACCENTS } from './config.js';
import { signOut, deleteAccount, saveProfile } from './auth.js';
import { openCategorySheet } from './sheets.js';
import { submitTicket, myTickets, isAdmin, allTickets, setTicketStatus, ticketThread, replyToTicket } from './support.js';
import { storageUsed } from './images.js';
import { openIdealSheet, idealIsSet, ideal } from './ideal.js';
import { importGoogle, googleConnected } from './google.js';
import { downloadICS, pickICSFile, parseICS, importICSEvents } from './ics.js';
import { TONES, playTone, requestNotifications, notificationsAllowed, shadeEnabled, setShade, postTaskSummary, isNative } from './notify.js';
import { openTasks } from './state.js';
import { CONFIG } from './config.js';
import { openSheet, closeSheet, confirmSheet, toast, haptic, registerActions, readForm, field, segmented } from './ui.js';

function toggleRow(label, name, on) {
  return `<button class="toggle-row tap" data-act="prefToggle" data-name="${name}">
    <span>${esc(label)}</span><span class="switch${on ? ' on' : ''}"></span>
  </button>`;
}

// Starter categories most people end up creating anyway — one tap each
// beats typing them, and consistent names make the week view readable.
const SUGGESTED_CATS = [
  { name: 'Deep work', color: '#F2994A' },
  { name: 'Meetings', color: '#6FA8FF' },
  { name: 'Admin', color: '#9497AC' },
  { name: 'Health', color: '#3ECFB2' },
  { name: 'Family', color: '#E86AA6' },
  { name: 'Learning', color: '#7C6AF0' },
  { name: 'Errands', color: '#F0C674' },
  { name: 'Rest', color: '#8FD46A' }
];

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
        <select class="input" onchange="window.cadenceSetLang(this.value)">
          ${LANGS.map(l => `<option value="${l.code}"${S.prefs.lang === l.code ? ' selected' : ''}>${esc(l.native)}</option>`).join('')}
        </select>
      </div>

      <div class="section-head"><span class="eyebrow">${esc(t('nav.calendar'))}</span></div>
      <div class="card">
        ${toggleRow(t('set.clock24'), 'clock24', S.prefs.clock24)}
        <div class="row-label">${esc(t('set.focusWindow'))}</div>
        <p class="dim small">${esc(t('set.focusHint'))}</p>
        <div class="field-row">
          <input class="input" type="time" value="${String(Math.floor(S.prefs.focus_start / 60)).padStart(2, '0')}:${String(S.prefs.focus_start % 60).padStart(2, '0')}" onchange="window.cadenceFocusChange('start', this.value)">
          <input class="input" type="time" value="${String(Math.floor(S.prefs.focus_end / 60)).padStart(2, '0')}:${String(S.prefs.focus_end % 60).padStart(2, '0')}" onchange="window.cadenceFocusChange('end', this.value)">
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
        <div class="row-label">Suggestions</div>
        <div class="chip-row">
          ${SUGGESTED_CATS.filter(s => !categories().some(c => c.name.toLowerCase() === s.name.toLowerCase()))
            .map(s => `<button class="chip tap" data-act="addSuggestedCat" data-name="${esc(s.name)}" data-color="${s.color}">
              <i class="dot" style="background:${s.color}"></i>${esc(s.name)}</button>`).join('')}
        </div>
        <button class="btn ghost sm" data-act="addCat">${esc(t('set.addCategory'))}</button>
      </div>

      <div class="section-head"><span class="eyebrow">Reminders &amp; alerts</span></div>
      <div class="card">
        ${toggleRow(t('set.reminders'), 'reminders', S.prefs.reminders)}
        ${toggleRow(t('set.haptics'), 'haptics', S.prefs.haptics)}
        <div class="row-label">Alert me before a block starts</div>
        <div class="segmented">
          ${[0, 5, 10, 15, 30].map(m => `<button class="seg-item${Number(S.prefs.remind_lead) === m ? ' on' : ''}" data-act="prefSeg" data-name="remind_lead" data-value="${m}">${m ? m + 'm' : 'On time'}</button>`).join('')}
        </div>
        <div class="row-label">Alert tone <span class="dim">(tap to preview)</span></div>
        <div class="chip-row">
          ${Object.entries(TONES).map(([k, v]) => `<button class="chip tap${S.prefs.tone === k ? ' on' : ''}" data-act="pickTone" data-k="${k}">${esc(v.label)}</button>`).join('')}
        </div>
        ${notificationsAllowed() ? '' : `<button class="btn ghost sm" data-act="enableNotifs">Turn on notifications</button>`}
        ${isNative() ? `<button class="toggle-row tap" data-act="toggleShade">
          <span>Keep today's tasks in the notification shade</span>
          <span class="switch${shadeEnabled() ? ' on' : ''}"></span>
        </button>` : ''}
      </div>

      <div class="section-head"><span class="eyebrow">${esc(t('nav.calendar'))} — import &amp; share</span></div>
      <div class="card">
        <p class="dim small">Works with Google Calendar, Outlook and Apple Calendar through .ics files.</p>
        <div class="btn-stack">
          <button class="btn ghost" id="gcalBtn" style="display:none" data-act="importGoogleCal">Import from Google Calendar</button>
          <button class="btn ghost" data-act="importCalendar">Import a calendar (.ics)</button>
          <button class="btn ghost" data-act="exportCalendar">Export / share my calendar (.ics)</button>
        </div>
      </div>

      <div class="section-head"><span class="eyebrow">Progress &amp; the weekly board</span></div>
      <div class="card">
        <button class="btn ghost" data-act="editIdeal">${idealIsSet() ? 'Edit my ideal self' : 'Define my ideal self'}</button>
        ${idealIsSet() ? `<p class="dim small">${esc(ideal().statement || 'No statement written yet.')}</p>` : ''}
        ${field('Leaderboard nickname', `<input class="input" name="nickname" value="${esc(S.prefs.nickname || '')}"
          placeholder="e.g. marc_h" autocomplete="off" autocapitalize="none">`,
          'The only thing other people see. Leave it empty to stay off the board.')}
        <button class="toggle-row tap" data-act="prefToggle" data-name="leaderboard_opt_in">
          <span>Show me on the weekly board</span>
          <span class="switch${S.prefs.leaderboard_opt_in === false ? '' : ' on'}"></span>
        </button>
      </div>

      <div class="section-head"><span class="eyebrow">${esc(t('set.support'))}</span></div>
      <div class="card">
        <button class="btn ghost" data-act="openSupport">${esc(t('sup.support'))}</button>
        <button class="btn ghost" data-act="openMyTickets">My messages</button>
        <button class="btn ghost" id="adminInbox" style="display:none" data-act="openInbox">Support inbox — all users</button>
      </div>

      <div class="section-head"><span class="eyebrow">${esc(t('set.account'))}</span></div>
      <div class="card">
        <div class="dim small mono">${esc(S.user?.email || '')}</div>
        <button class="btn ghost" data-act="doSignOut">${esc(t('set.signOut'))}</button>
        <button class="btn ghost danger-text" data-act="openDelete">${esc(t('set.deleteAccount'))}</button>
      </div>

      <div class="version-row dim small">Cadence v${esc(CONFIG.version)} · ${esc(CONFIG.build)}</div>
    </div>`;
  },
  async onMount(root) {
    const nick = root.querySelector('input[name=nickname]');
    if (nick) nick.addEventListener('change', () => {
      const v = String(nick.value || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 20);
      nick.value = v;
      savePrefs({ nickname: v || null });
      toast(v ? 'Nickname saved' : 'You are off the board', 'good');
    });
    if (await googleConnected()) { const g = root.querySelector('#gcalBtn'); if (g) g.style.display = ''; }
    if (await isAdmin()) { const b = root.querySelector('#adminInbox'); if (b) b.style.display = ''; }
  }
};

const KIND_LABEL = { support: 'Help', feedback: 'Idea', bug: 'Bug' };

// Both sides render the same thread; only the side it leans to changes.
async function loadThread(root, ticket, viewingAsAdmin) {
  const host = root.querySelector('#thread');
  if (!host || !ticket) return;
  const msgs = await ticketThread(ticket.id);
  const first = `<div class="msg them"><p>${esc(ticket.body || '')}</p>
    <span class="msg-at dim">${esc(new Date(ticket.created_at).toLocaleString())}</span></div>`;
  host.innerHTML = first + (msgs.map(m => {
    const mineSide = viewingAsAdmin ? m.from_admin : !m.from_admin;
    return `<div class="msg ${mineSide ? 'me' : 'them'}">
      <p>${esc(m.body)}</p>
      <span class="msg-at dim">${m.from_admin ? 'Support' : 'Customer'} · ${esc(new Date(m.created_at).toLocaleString())}</span>
    </div>`;
  }).join('') || '');
}
let inboxRows = [];

function inboxList(rows) {
  if (!rows.length) return `<div class="empty-state">No messages yet.</div>`;
  return `<div class="list">${rows.map((r, i) => `
    <button class="rail-goal tap" style="width:100%;text-align:left;background:var(--surface-2);border-radius:10px;padding:10px;display:flex;gap:10px;align-items:flex-start"
      data-act="openTicket" data-i="${i}">
      <span style="flex:1">
        <span style="display:block;font-weight:700">#${r.ticket_no || '–'} · ${esc(r.subject || '(no subject)')}</span>
        <span class="dim small">${esc(r.full_name || r.username || 'unknown')}
          ${r.customer_no ? '· C' + r.customer_no : ''} · ${esc(KIND_LABEL[r.kind] || r.kind)}
          · ${esc(r.platform || 'web')} · ${esc(new Date(r.created_at).toLocaleDateString())}</span>
      </span>
      ${r.status && r.status !== 'open' ? '<span class="dim small">✓</span>' : '<span class="live">new</span>'}
    </button>`).join('')}</div>`;
}

registerActions({
  prefSeg: d => { savePrefs({ [d.name]: /^\d+$/.test(d.value) ? Number(d.value) : d.value }); haptic('light'); window.cadenceRerender(); },
  prefColor: d => { savePrefs({ accent: d.value }); window.cadenceApplyAccent(d.value); window.cadenceRerender(); },
  prefToggle: d => { savePrefs({ [d.name]: !S.prefs[d.name] }); haptic('light'); window.cadenceRerender(); },

  addCat: () => openCategorySheet(),
  editCat: d => openCategorySheet(d.id),

  addSuggestedCat: d => {
    save('categories', { name: d.name, color: d.color, sort: categories().length });
    haptic('success');
    window.cadenceRerender();
  },
  pickTone: d => { savePrefs({ tone: d.k }); playTone(d.k); window.cadenceRerender(); },
  enableNotifs: async () => {
    const ok = await requestNotifications();
    toast(ok ? 'Notifications on' : 'Permission denied', ok ? 'good' : 'warn');
    window.cadenceRerender();
  },
  toggleShade: async () => {
    const on = !shadeEnabled();
    if (on && !(await requestNotifications())) { toast('Permission denied', 'warn'); return; }
    setShade(on);
    if (on) postTaskSummary(openTasks());
    haptic('light');
    window.cadenceRerender();
  },

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
  editIdeal: () => openIdealSheet(),

  importGoogleCal: async (d, node) => {
    node.setAttribute('disabled', 'true');
    try {
      const n = await importGoogle({ days: 30 });
      haptic('success');
      toast(n ? `${n} events imported from Google` : 'Nothing new to import', n ? 'good' : 'warn');
      window.cadenceRerender();
    } catch (err) { toast(err.message || t('msg.somethingWrong'), 'warn'); }
    finally { node.removeAttribute('disabled'); }
  },

  editNickname: () => { window.cadenceGoRoute('settings'); setTimeout(() => document.querySelector('input[name=nickname]')?.focus(), 400); },

  openMyTickets: async () => {
    openSheet({ title: 'My messages', full: true, body: '<div class="dim">Loading…</div>' });
    inboxRows = await myTickets();
    const body = document.querySelector('#sheet .sheet-body');
    if (!body) return;
    body.innerHTML = inboxRows.length
      ? `<div class="list">${inboxRows.map((r, i) => `
          <button class="rail-goal tap" style="width:100%;text-align:left;background:var(--surface-2);border-radius:10px;padding:10px"
            data-act="openTicket" data-i="${i}" data-mine="1">
            <span style="flex:1">
              <span style="display:block;font-weight:700">#${r.ticket_no || '–'} · ${esc(r.subject || '(no subject)')}</span>
              <span class="dim small">${esc(KIND_LABEL[r.kind] || r.kind)} · ${esc(new Date(r.created_at).toLocaleDateString())}</span>
            </span>
            ${r.status === 'answered' ? '<span class="live">answered</span>' : ''}
          </button>`).join('')}</div>`
      : '<div class="empty-state">You have not written to us yet.</div>';
  },

  openInbox: async () => {
    openSheet({ title: 'Support inbox', full: true, body: '<div class="dim">Loading…</div>' });
    inboxRows = await allTickets();
    const body = document.querySelector('#sheet .sheet-body');
    if (body) body.innerHTML = inboxList(inboxRows);
  },

  openTicket: d => {
    const r = inboxRows[Number(d.i)];
    if (!r) return;
    const diag = r.diagnostics ? JSON.stringify(r.diagnostics, null, 1) : '';
    const mail = `mailto:?subject=${encodeURIComponent('Re: ' + (r.subject || 'Cadence'))}&body=${encodeURIComponent((r.body || '') + '\n\n— from ' + (r.email || 'unknown') + '\nTicket ' + r.id)}`;
    openSheet({
      title: `#${r.ticket_no || '–'} ${r.subject || '(no subject)'}`,
      body: `<div class="ticket-who">
          <div><span class="dim small">Name</span><span>${esc(r.full_name || '(not given)')}</span></div>
          <div><span class="dim small">Username</span><span>@${esc(r.username || '?')}</span></div>
          <div><span class="dim small">Customer</span><span class="mono">C${r.customer_no || '?'}</span></div>
          <div><span class="dim small">Email</span><span>${esc(r.email || '(none)')}</span></div>
          <div><span class="dim small">On</span><span>${esc(r.platform || 'web')} · v${esc(r.app_version || '?')}</span></div>
          <div><span class="dim small">Sent</span><span>${esc(new Date(r.created_at).toLocaleString())}</span></div>
        </div>
        <p class="dim small mono">user id ${esc(r.user_id || '')}</p>
        <p class="sheet-msg" style="white-space:pre-wrap">${esc(r.body || '')}</p>
        ${diag ? `<details><summary class="dim small">Device details</summary><pre class="dim small mono" style="white-space:pre-wrap">${esc(diag)}</pre></details>` : ''}
        <div class="section-head"><span class="eyebrow">Conversation</span></div>
        <div id="thread" class="thread"><div class="dim small">Loading…</div></div>
        <div class="reply-row">
          <textarea class="input" id="replyBox" rows="2" placeholder="Write a reply…"></textarea>
          <button class="btn primary sm" data-act="sendReply" data-id="${r.id}" data-admin="${d.mine ? '0' : '1'}">Send</button>
        </div>`,
      footer: `<a class="btn ghost" href="${mail}">Forward to my email</a>
               <button class="btn primary" data-act="ticketDone" data-id="${r.id}">Mark handled</button>`,
      onMount: root => loadThread(root, r, !d.mine)
    });
  },

  sendReply: async (d, node) => {
    const sheet = node.closest('.sheet');
    const box = sheet.querySelector('#replyBox');
    const body = (box?.value || '').trim();
    if (!body) return;
    node.setAttribute('disabled', 'true');
    try {
      await replyToTicket(d.id, body, d.admin === '1');
      box.value = '';
      haptic('success');
      const r = inboxRows.find(x => x.id === d.id);
      await loadThread(sheet, r, d.admin === '1');
      toast('Sent', 'good');
    } catch { toast(t('msg.somethingWrong'), 'warn'); }
    finally { node.removeAttribute('disabled'); }
  },

  ticketDone: async d => {
    try { await setTicketStatus(d.id, 'closed'); haptic('success'); closeSheet(); toast('Marked handled', 'good'); }
    catch { toast(t('msg.somethingWrong'), 'warn'); }
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
