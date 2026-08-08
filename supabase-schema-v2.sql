-- ============================================================
-- KingdomOS v2 schema — run this in Supabase SQL Editor.
-- Safe to run on top of v1; it adds org support without
-- destroying existing app_state rows.
-- ============================================================

-- 1. Organizations ------------------------------------------------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text unique not null,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- 2. Membership ---------------------------------------------------
create table if not exists org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member',   -- 'owner' | 'admin' | 'member'
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- 3. Add org link to existing state table -------------------------
alter table app_state add column if not exists org_id uuid references organizations(id);
alter table app_state add column if not exists display_name text;

-- 4. Helper: is the current user in this org? ---------------------
-- SECURITY DEFINER avoids infinite recursion in the policies below.
create or replace function is_org_member(check_org uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_id = check_org and user_id = auth.uid()
  );
$$;

-- 5. Row Level Security -------------------------------------------
alter table organizations enable row level security;
alter table org_members  enable row level security;

drop policy if exists "members can view their org" on organizations;
create policy "members can view their org"
  on organizations for select
  using (is_org_member(id));

drop policy if exists "anyone signed in can create an org" on organizations;
create policy "anyone signed in can create an org"
  on organizations for insert
  with check (auth.uid() = owner_id);

drop policy if exists "owner can update org" on organizations;
create policy "owner can update org"
  on organizations for update
  using (auth.uid() = owner_id);

drop policy if exists "members can see co-members" on org_members;
create policy "members can see co-members"
  on org_members for select
  using (is_org_member(org_id));

drop policy if exists "users can join orgs" on org_members;
create policy "users can join orgs"
  on org_members for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can leave orgs" on org_members;
create policy "users can leave orgs"
  on org_members for delete
  using (auth.uid() = user_id);

-- 6. Team visibility on app_state ---------------------------------
-- Members of the same org can READ each other's state (for the Team
-- view), but can only WRITE their own.
drop policy if exists "Users can read their own state" on app_state;
create policy "read own or org state"
  on app_state for select
  using (
    auth.uid() = user_id
    or (org_id is not null and is_org_member(org_id))
  );

-- 7. Look up an org by join code without being a member yet --------
create or replace function find_org_by_code(code text)
returns table (id uuid, name text)
language sql
security definer
set search_path = public
as $$
  select id, name from organizations where join_code = upper(trim(code));
$$;
