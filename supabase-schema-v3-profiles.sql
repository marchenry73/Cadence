-- ============================================================
-- Cadence v3 — user profiles, usernames, richer signup
-- Run in Supabase SQL Editor after the v2 files.
-- ============================================================

create table if not exists profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  full_name   text,
  job_title   text,
  company     text,
  timezone    text default 'UTC',
  avatar_hue  int  default 40,
  created_at  timestamptz not null default now()
);

-- Usernames: 3–20 chars, letters/numbers/underscore, stored lowercase.
alter table profiles drop constraint if exists username_format;
alter table profiles add constraint username_format
  check (username ~ '^[a-z0-9_]{3,20}$');

alter table profiles enable row level security;

drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles for select
  using (auth.uid() = user_id);

-- Teammates can see each other's profiles.
drop policy if exists "read teammate profiles" on profiles;
create policy "read teammate profiles" on profiles for select
  using (
    exists (
      select 1 from org_members me
      join org_members them on me.org_id = them.org_id
      where me.user_id = auth.uid() and them.user_id = profiles.user_id
    )
  );

drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles for update
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Sign in with a username: resolve it to the account email.
-- SECURITY DEFINER so it can read auth.users, which clients cannot.
-- ---------------------------------------------------------------
create or replace function email_for_username(uname text)
returns text
language sql
security definer
set search_path = public
as $$
  select u.email
  from profiles p
  join auth.users u on u.id = p.user_id
  where p.username = lower(trim(uname))
  limit 1;
$$;

-- Check availability while someone types, without exposing the table.
create or replace function username_available(uname text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from profiles where username = lower(trim(uname))
  );
$$;

grant execute on function email_for_username(text) to anon, authenticated;
grant execute on function username_available(text)  to anon, authenticated;
