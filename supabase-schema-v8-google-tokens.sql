-- ============================================================
-- Cadence v8 — server-side storage for the Google refresh token
--
-- Run in the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/eznsmotrmzeryduwkuuf/sql/new
--
-- WHY
-- Supabase hands back Google's access token at sign-in but never refreshes
-- it, and Google expires those after about an hour — so background calendar
-- sync stops until the user signs in with Google again. Google also issues a
-- long-lived REFRESH token, which can be exchanged for a fresh access token
-- indefinitely. That exchange requires the Google client secret, which must
-- never reach the browser, so it happens in an Edge Function and the refresh
-- token is parked here.
--
-- SECURITY SHAPE
-- The client may INSERT and UPDATE its own row and can never SELECT one —
-- not even its own. There is deliberately no select policy, and with RLS on,
-- no policy means no access. Only the Edge Function reads this, using the
-- service role, which bypasses RLS. So a stolen anon key or a compromised
-- browser session cannot exfiltrate anyone's refresh token.
--
-- Safe to run more than once.
-- ============================================================

create table if not exists public.google_tokens (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at    timestamptz not null default now()
);

alter table public.google_tokens enable row level security;

-- Write-only from the client: it already holds the token at sign-in time,
-- so letting it store one leaks nothing it did not have.
drop policy if exists google_tokens_insert_own on public.google_tokens;
create policy google_tokens_insert_own on public.google_tokens
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists google_tokens_update_own on public.google_tokens;
create policy google_tokens_update_own on public.google_tokens
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Deleting your own row is how "disconnect Google" should work.
drop policy if exists google_tokens_delete_own on public.google_tokens;
create policy google_tokens_delete_own on public.google_tokens
  for delete to authenticated
  using (auth.uid() = user_id);

-- NOTE: no SELECT policy on purpose. Reading is the Edge Function's job.
