// Team: create/join a workspace, member list with roles, live busy/free
// status derived from each member's own schedule (read via the org-mates
// SELECT policy — never a write path).
import { S, occurrencesOn } from '../state.js';
import { t } from '../i18n.js';
import { esc, initials, fmtTime, todayISO } from '../util.js';
import { registerActions, haptic, toast, openSheet, closeSheet, confirmSheet, readForm, field } from '../ui.js';
import * as org from '../org.js';

function memberRow(m) {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const occ = occurrencesOn(todayISO(), m.user_id);
  const busyNow = occ.find(o => o.start <= nowMin && nowMin < o.end);
  const name = m.profile?.full_name || m.profile?.username || 'Member';
  const mine = m.user_id === S.user.id;
  const canManage = org.canManage(S.role) && !mine && m.user_id !== S.org.owner_id;
  return `<div class="member-row">
    <span class="avatar">${esc(initials(name))}</span>
    <div class="member-info">
      <div class="member-name">${esc(name)}${mine ? ` <span class="dim">(${esc(t('common.you') || 'you')})</span>` : ''}</div>
      <div class="status ${busyNow ? 'busy' : 'free'} mono">${busyNow ? esc(t('team.busy', { t: fmtTime(busyNow.end, S.prefs.clock24) })) : esc(t('team.free'))}</div>
    </div>
    <span class="role-chip">${esc(t('team.' + m.role))}</span>
    ${canManage ? `<button class="icon-btn" data-act="memberMenu" data-id="${m.user_id}">⋯</button>` : ''}
  </div>`;
}

function noWorkspace() {
  return `<div class="empty-card">
    <p>${esc(t('team.none'))}</p>
    <div class="stack-row">
      <button class="btn primary" data-act="wsCreate">${esc(t('team.create'))}</button>
      <button class="btn ghost" data-act="wsJoin">${esc(t('team.join'))}</button>
    </div>
  </div>`;
}

export function renderTeam() {
  if (!S.org) return `<div class="screen" data-screen-label="Team">
    <div class="screen-head"><h1>${esc(t('nav.team'))}</h1></div>${noWorkspace()}</div>`;

  return `<div class="screen" data-screen-label="Team">
    <div class="screen-head"><h1>${esc(S.org.name)}</h1></div>
    <div class="privacy-note dim">${esc(t('team.personalStays'))}</div>
    ${org.canManage(S.role) ? `<div class="code-card">
      <span class="dim">${esc(t('team.code'))}</span>
      <span class="code mono">${esc(S.org.join_code)}</span>
      <button class="btn ghost sm" data-act="wsCopyCode">${esc(t('common.search') && '') || ''}Copy</button>
    </div>` : ''}
    <div class="section-head"><span class="eyebrow">${esc(t('team.members'))}</span></div>
    <div class="member-list">${S.members.map(memberRow).join('')}</div>
    <button class="btn ghost danger-text" data-act="wsLeave" style="width:100%;margin-top:18px">${esc(t('team.leave'))}</button>
  </div>`;
}

function rerender() { const host = document.querySelector('#view .screen'); if (host) host.outerHTML = renderTeam(); }

registerActions({
  wsCreate: () => openSheet({
    title: t('team.create'),
    body: field(t('block.title'), `<input class="input" name="name" autocomplete="off" placeholder="Acme Inc.">`),
    footer: `<button class="btn primary" data-act="wsCreateGo">${esc(t('common.save'))}</button>`
  }),
  wsCreateGo: async () => {
    const name = readForm().name?.trim();
    if (!name) return;
    try { await org.createWorkspace(name); haptic('success'); closeSheet(); toast(t('msg.saved'), 'good'); rerender(); }
    catch (e) { toast(e.message, 'warn'); }
  },
  wsJoin: () => openSheet({
    title: t('team.join'),
    body: field(t('team.code'), `<input class="input" name="code" autocomplete="off" style="text-transform:uppercase" maxlength="6">`),
    footer: `<button class="btn primary" data-act="wsJoinGo">${esc(t('common.save'))}</button>`
  }),
  wsJoinGo: async () => {
    const code = readForm().code?.trim();
    if (!code) return;
    try { await org.joinWorkspace(code); haptic('success'); closeSheet(); toast(t('msg.saved'), 'good'); rerender(); }
    catch (e) { toast(e.message, 'warn'); }
  },
  wsCopyCode: () => { navigator.clipboard?.writeText(S.org.join_code); toast(t('msg.copied')); },
  wsLeave: async () => {
    const ok = await confirmSheet({ title: t('team.leave'), message: t('team.leave') + '?', danger: true });
    if (!ok) return;
    await org.leaveWorkspace();
    rerender();
  },
  memberMenu: async (d) => {
    const ok = await confirmSheet({ title: t('team.remove'), message: t('team.remove') + '?' });
    if (!ok) return;
    await org.removeMember(d.id);
    rerender();
  }
});
