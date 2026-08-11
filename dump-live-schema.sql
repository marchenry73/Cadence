-- ============================================================
-- Run this in the Supabase SQL Editor and paste the output back.
--
-- The tables the app actually writes to (categories, routines, events,
-- tasks, goals, milestones, checkins, activity, prefs) have no migration
-- file anywhere in the repo — they were created directly in the SQL
-- Editor. That means the database cannot be rebuilt from source, nobody
-- can review the RLS policies, and a second environment (staging, a new
-- developer, a restore) cannot be stood up at all.
--
-- This dumps the real structure so it can be checked in as the baseline
-- migration. Three result sets: columns, then policies, then indexes.
-- ============================================================

-- 1. Columns -------------------------------------------------------
select
  c.table_name,
  c.ordinal_position as pos,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'categories','routines','events','tasks','goals','milestones',
    'checkins','activity','prefs','app_state','profiles',
    'organizations','org_members','booking_links','bookings'
  )
order by c.table_name, c.ordinal_position;

-- 2. Row Level Security policies -----------------------------------
select
  schemaname, tablename, policyname, permissive,
  roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3. Indexes and constraints ---------------------------------------
select
  tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 4. Is anything still writing to the old blob? --------------------
-- If max_updated is recent, something still depends on state_v2 and the
-- v6 migration needs a closer look before you apply it.
select
  count(*)              as app_state_rows,
  count(state_v2)       as rows_with_blob,
  max(updated_at)       as max_updated
from app_state;
