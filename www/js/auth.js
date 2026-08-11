// Authentication and the account lifecycle, including real self-service
// deletion (a Play Store and GDPR requirement, and simply the right thing).
import { sb, rpc, flush } from './net.js';
import { S, notify } from './state.js';
import { idb, metaSet } from './idb.js';

export async function currentSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session || null;
}

export function onAuthChange(fn) {
  return sb.auth.onAuthStateChange((event, session) => fn(event, session));
}

const looksLikeEmail = s => /\S+@\S+\.\S+/.test(s);

export async function signIn(identifier, password) {
  let email = identifier.trim();
  if (!looksLikeEmail(email)) {
    const resolved = await rpc('email_for_username', { uname: email });
    if (!resolved) throw new Error('No account with that username');
    email = resolved;
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUp({ email, password, username, name }) {
  const clean = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(clean)) throw new Error('Username: 3–20 letters, numbers or _');
  const free = await rpc('username_available', { uname: clean });
  if (!free) throw new Error('That username is taken');

  const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
  if (error) throw error;

  // Email confirmation may be on, in which case there is no session yet and
  // the profile is written on first sign-in instead.
  if (data.session) await ensureProfile({ username: clean, full_name: name });
  return data;
}

export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: location.origin + location.pathname
  });
  if (error) throw error;
}

export async function usernameAvailable(u) {
  const clean = String(u || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(clean)) return false;
  return await rpc('username_available', { uname: clean });
}

export async function ensureProfile(patch = {}) {
  const user = S.user || (await sb.auth.getUser()).data.user;
  if (!user) return null;
  const { data: existing } = await sb.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (existing && !Object.keys(patch).length) { S.profile = existing; return existing; }

  const fallbackName = (user.email || 'user').split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase();
  const row = {
    user_id: user.id,
    username: patch.username || existing?.username || (fallbackName.slice(0, 20) || 'user'),
    full_name: patch.full_name ?? existing?.full_name ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    ...patch
  };
  const { data, error } = await sb.from('profiles').upsert(row, { onConflict: 'user_id' }).select().maybeSingle();
  if (error) throw error;
  S.profile = data;
  notify('profile');
  return data;
}

export async function saveProfile(patch) {
  const { data, error } = await sb.from('profiles')
    .update(patch).eq('user_id', S.user.id).select().maybeSingle();
  if (error) throw error;
  S.profile = data;
  notify('profile');
  return data;
}

export async function signOut() {
  // Never drop queued work on the floor: push it before the session dies.
  try { await flush(); } catch {}
  await metaSet('lastPull', null);
  await idb.wipe();
  await sb.auth.signOut();
  location.reload();
}

export async function deleteAccount() {
  try { await rpc('delete_my_account'); }
  finally {
    await idb.wipe();
    try { await sb.auth.signOut(); } catch {}
    location.reload();
  }
}


// ------------------------------------------------------------------ OAuth
// Google sign-in. Enable the provider once in Supabase (Authentication ->
// Providers -> Google) and this works on web and in the Android WebView.
// Redirect comes back to wherever the app is running, so no per-build config.
export async function signInWithProvider(provider = 'google') {
  const { data, error } = await sb.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: location.origin + location.pathname,
      // Calendar scope is requested up front so the same consent covers
      // reading the user's Google Calendar later.
      scopes: provider === 'google'
        ? 'email profile https://www.googleapis.com/auth/calendar.readonly' : undefined,
      queryParams: provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : undefined
    }
  });
  if (error) throw error;
  return data;
}

// The Google access token Supabase hands back after OAuth — what a live
// calendar import needs. Null when the user signed in with a password.
export async function providerToken() {
  const { data } = await sb.auth.getSession();
  return data?.session?.provider_token || null;
}
