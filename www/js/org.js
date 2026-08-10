// Workspaces (companies) and their members.
//
// An individual account owns its own data. Creating a workspace does not move
// that data anywhere: it grants co-members read access to schedule rows and
// nothing more. Roles are enforced by RLS in Postgres — the UI hiding a button
// is a courtesy, the database is the boundary.
import { sb, rpc } from './net.js';
import { S, notify } from './state.js';

export const ROLES = ['owner', 'admin', 'member', 'viewer'];
export const canManage = role => role === 'owner' || role === 'admin';
export const canWrite = role => role !== 'viewer';

function makeCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

export async function loadWorkspace() {
  const { data: rows, error } = await sb.from('org_members')
    .select('org_id, role, user_id, joined_at').eq('user_id', S.user.id);
  if (error) throw error;
  const membership = rows?.[0];
  if (!membership) { S.org = null; S.role = null; S.members = []; notify('org'); return null; }

  const { data: org } = await sb.from('orgs').select('*').eq('id', membership.org_id).maybeSingle();
  S.org = org || null;
  S.role = membership.role;
  await loadMembers();
  notify('org');
  return org;
}

export async function loadMembers() {
  if (!S.org) { S.members = []; return []; }
  const { data: members, error } = await sb.from('org_members')
    .select('user_id, role, joined_at').eq('org_id', S.org.id);
  if (error) throw error;
  const ids = (members || []).map(m => m.user_id);
  const { data: profiles } = ids.length
    ? await sb.from('profiles').select('user_id, username, full_name').in('user_id', ids)
    : { data: [] };
  S.members = (members || []).map(m => ({
    ...m,
    profile: (profiles || []).find(p => p.user_id === m.user_id) || null
  })).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  notify('members');
  return S.members;
}

export async function createWorkspace(name) {
  const { data: org, error } = await sb.from('orgs')
    .insert({ name: name.trim(), join_code: makeCode(), owner_id: S.user.id, kind: 'company' })
    .select().maybeSingle();
  if (error) throw error;
  const { error: memberError } = await sb.from('org_members')
    .insert({ org_id: org.id, user_id: S.user.id, role: 'owner' });
  if (memberError) throw memberError;
  await loadWorkspace();
  return org;
}

export async function joinWorkspace(code) {
  await rpc('join_org_by_code', { code: String(code || '').trim() });
  return await loadWorkspace();
}

export async function setRole(userId, role) {
  if (!ROLES.includes(role)) throw new Error('Unknown role');
  if (userId === S.org?.owner_id) throw new Error('The owner’s role cannot change');
  const { error } = await sb.from('org_members')
    .update({ role }).eq('org_id', S.org.id).eq('user_id', userId);
  if (error) throw error;
  await loadMembers();
}

export async function removeMember(userId) {
  const { error } = await sb.from('org_members')
    .delete().eq('org_id', S.org.id).eq('user_id', userId);
  if (error) throw error;
  await loadMembers();
}

export async function leaveWorkspace() {
  const { error } = await sb.from('org_members')
    .delete().eq('org_id', S.org.id).eq('user_id', S.user.id);
  if (error) throw error;
  S.org = null; S.role = null; S.members = [];
  notify('org');
}

export async function rotateJoinCode() {
  const code = makeCode();
  const { error } = await sb.from('orgs').update({ join_code: code }).eq('id', S.org.id);
  if (error) throw error;
  S.org.join_code = code;
  notify('org');
  return code;
}
