// Cadence — Google access-token refresh.
//
// Supabase hands back Google's access token at sign-in and then never
// refreshes it; Google expires those after about an hour, which is what
// silently pauses background calendar sync. Exchanging the long-lived
// refresh token for a fresh access token requires the Google client
// SECRET, which must never reach a browser — so it happens here, where
// the secret lives in Edge Function env and nowhere else.
//
// Contract: POST with the caller's Supabase JWT in Authorization.
//   200 { access_token, expires_in }
//   401 not signed in
//   404 no refresh token stored -> the client should ask for consent again
//   502 Google refused the exchange (usually a revoked refresh token)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
  const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!CLIENT_ID || !CLIENT_SECRET) {
    // Misconfiguration, not the user's fault — say so plainly rather than
    // returning something that looks like an auth failure.
    return json({ error: 'server_not_configured' }, 500);
  }

  // 1. Who is calling? The caller's own JWT decides — never a user id from
  //    the request body, which anyone could forge.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_authenticated' }, 401);

  const asCaller = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json({ error: 'not_authenticated' }, 401);

  // 2. Read that user's refresh token. Service role, because the table is
  //    deliberately unreadable by the client (see the v8 migration).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: row, error: rowErr } = await admin
    .from('google_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .maybeSingle();

  if (rowErr) return json({ error: 'lookup_failed' }, 500);
  if (!row?.refresh_token) return json({ error: 'no_refresh_token' }, 404);

  // 3. Trade it for a fresh access token.
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token'
    })
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    // invalid_grant means the user revoked access or the token aged out.
    // It will never succeed again, so drop it and make the client re-consent
    // rather than retrying a dead token every five minutes forever.
    if (body?.error === 'invalid_grant') {
      await admin.from('google_tokens').delete().eq('user_id', user.id);
      return json({ error: 'refresh_token_revoked' }, 404);
    }
    return json({ error: 'google_refused', detail: body?.error ?? null }, 502);
  }

  // Never return the refresh token itself — only the short-lived access one.
  return json({
    access_token: body.access_token,
    expires_in: body.expires_in ?? 3600
  });
});
