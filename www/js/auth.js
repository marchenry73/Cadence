// Authentication and the account lifecycle, including real self-service
// deletion (a Play Store and GDPR requirement, and simply the right thing).
import { sb, rpc, flush } from './net.js';
import { CONFIG } from './config.js';
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
//
// Google refuses to run OAuth inside an embedded WebView (it returns
// disallowed_useragent), which is exactly what the Capacitor Android build
// is. So the two platforms take different routes to the same place:
//
//   web     — ordinary redirect in the current tab, back to the app URL.
//   native  — open the consent screen in a REAL browser tab, then catch the
//             redirect coming back through the app's custom URL scheme and
//             install the session by hand.
//
// The native path needs `com.yourname.kingdomos://auth` allowlisted under
// Supabase → Authentication → URL Configuration → Redirect URLs, and the
// matching BROWSABLE intent-filter in AndroidManifest.xml.
const NATIVE_REDIRECT = 'com.yourname.kingdomos://auth';

const isNative = () => !!window.Capacitor?.isNativePlatform?.();

// Google only needs email+profile to identify someone. calendar.readonly is
// a *sensitive* scope: asking for it here would drag the whole sign-in flow
// into Google's verification review, so it is requested separately, later,
// only if the user actually imports a calendar.
const GOOGLE_SCOPES = 'email profile';

export async function signInWithProvider(provider = 'google', { extraScopes = '' } = {}) {
  const options = {
    redirectTo: isNative() ? NATIVE_REDIRECT : location.origin + location.pathname,
    scopes: provider === 'google' ? (GOOGLE_SCOPES + (extraScopes ? ' ' + extraScopes : '')) : undefined,
    queryParams: provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : undefined
  };

  if (!isNative()) {
    const { data, error } = await sb.auth.signInWithOAuth({ provider, options });
    if (error) throw error;
    return data;
  }

  // Native: ask Supabase for the URL instead of letting it navigate the
  // WebView, then hand that URL to the system browser.
  const { data, error } = await sb.auth.signInWithOAuth({
    provider, options: { ...options, skipBrowserRedirect: true }
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start Google sign-in');

  const { Browser, App } = window.Capacitor.Plugins;
  const session = await new Promise((resolve, reject) => {
    let settled = false;
    let handle = null;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      handle?.remove?.();
      Browser?.close?.().catch(() => {});
      fn(arg);
    };

    App.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith(NATIVE_REDIRECT)) return;
      try {
        // Supabase returns either ?code=... (PKCE) or #access_token=...
        const u = new URL(url);
        const hash = new URLSearchParams((u.hash || '').replace(/^#/, ''));
        const err = u.searchParams.get('error_description') || hash.get('error_description');
        if (err) return finish(reject, new Error(err));

        const code = u.searchParams.get('code');
        if (code) {
          const r = await sb.auth.exchangeCodeForSession(code);
          if (r.error) return finish(reject, r.error);
          return finish(resolve, r.data.session);
        }
        const access_token = hash.get('access_token');
        const refresh_token = hash.get('refresh_token');
        if (access_token && refresh_token) {
          const r = await sb.auth.setSession({ access_token, refresh_token });
          if (r.error) return finish(reject, r.error);
          return finish(resolve, r.data.session);
        }
        finish(reject, new Error('Google sign-in returned nothing usable'));
      } catch (e) {
        finish(reject, e);
      }
    }).then(h => {
      handle = h;
      // If the listener registered only after the redirect already fired,
      // the promise would hang forever — bail out rather than freeze.
      if (settled) h.remove?.();
    });

    Browser.open({ url: data.url }).catch(e => finish(reject, e));
  });

  return { session, user: session?.user || null };
}

// Calendar access is asked for only when someone actually imports a
// calendar — a second, narrower consent rather than a scary one at
// sign-up. Re-running OAuth with the extra scope upgrades the same
// account; it does not create a second one.
export function requestGoogleCalendarAccess() {
  return signInWithProvider('google', { extraScopes: 'https://www.googleapis.com/auth/calendar' });
}

// The Google access token Supabase hands back after OAuth — what a live
// calendar import needs. Null when the user signed in with a password.
//
// Supabase never refreshes this, and Google expires it after about an
// hour, so a session token alone means sync dies quietly after one hour.
// When it runs out we trade the stored refresh token for a fresh one via
// the google-token Edge Function (the exchange needs the Google client
// secret, which must never reach a browser).
let cachedToken = null;      // { token, expiresAt }

// Google issues the refresh token exactly once, on the FIRST consent with
// access_type=offline, and Supabase surfaces it ONLY on the session object
// handed to the auth-state listener — it is never persisted to storage, so
// by the next page load it is gone for good.
//
// The first version of this called getSession() during boot and quietly
// found nothing, because by then the value had already been dropped. It
// now takes the session directly from the SIGNED_IN event, which is the
// one moment the token is guaranteed to exist.
//
// Returns a reason rather than a bare boolean: a silent false here is
// indistinguishable from "worked", and this failing is exactly what makes
// sync start nagging for a reconnect later.
export async function captureGoogleRefreshToken(session = null) {
  if (!session) {
    const { data } = await sb.auth.getSession();
    session = data?.session;
  }
  if (!session?.user?.id) return { ok: false, reason: 'no_session' };
  const refresh = session.provider_refresh_token;
  // A password sign-in legitimately has none; so does a Google sign-in where
  // Google decided not to re-issue one (it only does so with prompt=consent).
  if (!refresh) return { ok: false, reason: 'no_refresh_token_in_session' };

  const { error } = await sb.from('google_tokens')
    .upsert({ user_id: session.user.id, refresh_token: refresh, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' });
  if (error) return { ok: false, reason: 'write_failed', detail: error.message };
  return { ok: true, reason: 'stored' };
}

// Why the last refresh failed, so a caller can tell a permanent problem
// (nothing stored, access revoked -> the user must reconnect) from a
// transient one (function down, no network -> just try again shortly).
// Latching sync off for a transient blip would demand a pointless tap.
let lastRefreshFailure = null;   // 'needs_consent' | 'transient' | null
export function googleRefreshFailureReason() { return lastRefreshFailure; }

async function refreshViaEdge() {
  const { data } = await sb.auth.getSession();
  const jwt = data?.session?.access_token;
  if (!jwt) return null;
  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/functions/v1/google-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      // 404 covers both "never stored" and "revoked", and neither is fixable
      // by retrying — only by asking the user for consent again.
      lastRefreshFailure = res.status === 404 ? 'needs_consent' : 'transient';
      return null;
    }
    const body = await res.json();
    if (!body?.access_token) { lastRefreshFailure = 'transient'; return null; }
    // Expire our copy a minute early so a token never dies mid-request.
    cachedToken = {
      token: body.access_token,
      expiresAt: Date.now() + Math.max(0, (Number(body.expires_in) || 3600) - 60) * 1000
    };
    lastRefreshFailure = null;
    return cachedToken.token;
  } catch {
    lastRefreshFailure = 'transient';   // network blip, not a consent problem
    return null;
  }
}

export async function providerToken({ forceRefresh = false } = {}) {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  if (forceRefresh) cachedToken = null;
  if (!forceRefresh) {
    // Right after sign-in the session token is real and unexpired — use it
    // rather than burning an Edge Function call on every sync.
    const { data } = await sb.auth.getSession();
    const fromSession = data?.session?.provider_token;
    if (fromSession) return fromSession;
  }
  return await refreshViaEdge();
}
