// Team — an individual's private workspace, upgradable to a shared one.
// Personal data never moves: creating or joining a workspace only grants
// co-members read access to your schedule, enforced by RLS, never by the UI.
import { S } from './state.js';
import { t } from './i18n.js';
import { esc, fmtRange, initials } from './util.js';
import { createWorkspace, joinWorkspace, leaveWorkspace, setRole, removeMember, rotateJoinCode, canManage, ROLES } from './org.js';
import { occurrencesOn, catColor } from './state.js';
import { openSheet, closeSheet, confirmSheet, toast, haptic, registerActions, readForm, field } from './ui.js';
import { todayISO, minutesNow } from './util.js';

function memberStatus(userId) {
  const occ = occurrencesOn(todayISO(), userId);
  const now = minutesNow();
  const running = occ.find(o => o.start <= now && o.end > now);
  return running ? { busy: true, until: running.end } : { busy: false };
}

function memberRow(m) {
  const status = memberStatus(m.user_id);
  const name = m.profile?.full_name || m.profile?.username || '—';
  const canEdit = canManage(S.role) && m.user_id !== S.user.id && m.role !== 'owner';
  return `<div class="member-row">
    <span class="avatar">${esc(initials(name))}</span>
    <span class="member-main">
      <span class="member-name">${esc(name)}${m.user_id === S.user.id ? ' · ' + esc(t('common.you') || 'you') : ''}</span>
      <span class="member-sub ${status.busy ? 'busy-text' : 'good-text'}">
        ${status.busy ? esc(t('team.busy', { t: fmtRange(0, status.until, S.prefs.clock24).split('–')[1]?.trim() || '' })) : esc(t('team.free'))}
      </span>
    </span>
    <span class="role-pill">${esc(t('team.' + m.role))}</span>
    ${canEdit ? `<button class="icon-btn" data-act="memberMenu" data-id="${m.user_id}">⋯</button>` : ''}
  </div>`;
}

export default {
  id: 'team',
  render() {
    if (!S.org) {
      return `<div class="pad">
        <div class="empty-state big">${esc(t('team.none'))}</div>
        <div class="btn-stack">
          <button class="btn primary" data-act="teamCreate">${esc(t('team.create'))}</button>
          <button class="btn ghost" data-act="teamJoin">${esc(t('team.join'))}</button>
        </div>
      </div>`;
    }
    return `<div class="pad">
      <div class="card">
        <div class="card-head"><span class="eyebrow">${esc(S.org.name)}</span><span class="role-pill">${esc(t('team.' + S.role))}</span></div>
        <p class="dim small">${esc(t('team.personalStays'))}</p>
        ${canManage(S.role) ? `<div class="code-row">
          <span class="code mono">${esc(S.org.join_code)}</span>
          <button class="btn ghost sm" data-act="copyCode">${esc(t('common.search') && 'Copy') || 'Copy'}</button>
        </div>` : ''}
      </div>
      <div class="section-head"><span class="eyebrow">${esc(t('team.members'))}</span></div>
      <div class="list">${S.members.map(memberRow).join('')}</div>
      <button class="btn ghost danger-text" data-act="teamLeave">${esc(t('team.leave'))}</button>
    </div>`;
  }
};

registerActions({
  teamCreate: () => {
    openSheet({
      title: t('team.create'),
      body: field(t('block.title'), `<input class="input" name="name" autocomplete="off" placeholder="Acme Inc.">`),
      footer: `<button class="btn primary" data-act="teamCreateCommit">${esc(t('common.save'))}</button>`
    });
  },
  teamCreateCommit: async () => {
    const name = (readForm().name || '').trim();
    if (!name) return;
    try { await createWorkspace(name); haptic('success'); closeSheet(); toast(t('msg.saved'), 'good'); }
    catch (e) { toast(e.message, 'warn'); }
  },
  teamJoin: () => {
    openSheet({
      title: t('team.join'),
      body: field(t('team.code'), `<input class="input" name="code" autocomplete="off" style="text-transform:uppercase" maxlength="6">`),
      footer: `<button class="btn primary" data-act="teamJoinCommit">${esc(t('common.add'))}</button>`
    });
  },
  teamJoinCommit: async () => {
    const code = (readForm().code || '').trim();
    if (!code) return;
    try { await joinWorkspace(code); haptic('success'); closeSheet(); toast(t('msg.saved'), 'good'); }
    catch (e) { toast(e.message, 'warn'); }
  },
  teamLeave: async () => {
    const ok = await confirmSheet({ title: t('team.leave'), message: t('msg.confirmDelete') });
    if (!ok) return;
    try { await leaveWorkspace(); toast(t('msg.saved')); } catch (e) { toast(e.message, 'warn'); }
  },
  copyCode: () => { navigator.clipboard?.writeText(S.org.join_code); toast(t('msg.copied'), 'good'); },
  memberMenu: id => {
    const m = S.members.find(x => x.user_id === id);
    if (!m) return;
    openSheet({
      title: m.profile?.full_name || m.profile?.username || '',
      body: `<div class="btn-stack">
        ${ROLES.filter(r => r !== 'owner').map(r => `<button class="btn ghost" data-act="memberSetRole" data-id="${id}" data-role="${r}">${esc(t('team.' + r))}</button>`).join('')}
      </div>`,
      footer: `<button class="btn ghost danger-text" data-act="memberRemove" data-id="${id}">${esc(t('team.remove'))}</button>`
    });
  },
  memberSetRole: async d => { try { await setRole(d.id, d.role); haptic('success'); closeSheet(); } catch (e) { toast(e.message, 'warn'); } },
  memberRemove: async d => {
    const ok = await confirmSheet({ title: t('team.remove'), message: t('msg.confirmDelete') });
    if (!ok) return;
    try { await removeMember(d.id); toast(t('msg.deleted')); } catch (e) { toast(e.message, 'warn'); }
  }
});
