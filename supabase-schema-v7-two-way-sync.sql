-- ============================================================
-- Cadence v7 — columns needed for two-way Google Calendar sync
--
-- Run this in the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/eznsmotrmzeryduwkuuf/sql/new
--
-- WHY
-- Sync has to remember which Google event each Cadence row corresponds to,
-- or every sync would create duplicates instead of updating what is already
-- there. `events` already has external_id (added directly in the SQL editor
-- at some point, never captured in a migration until now). `routines` does
-- not, which is what currently blocks pushing routines to Google as
-- recurring events.
--
-- Safe to run more than once: every statement is IF NOT EXISTS.
-- Adds nullable columns only — no data is read, moved, or deleted.
-- ============================================================

-- Let a routine remember the recurring Google event it maps to.
alter table if exists public.routines
  add column if not exists external_id text;

-- Same for events, declared here so the schema is reproducible from the
-- repo even though the live table already has it.
alter table if exists public.events
  add column if not exists external_id text;

-- Sync looks rows up by external_id on every pass, so index it. Partial:
-- most rows are local-only and never carry one.
create index if not exists routines_external_id_idx
  on public.routines (user_id, external_id)
  where external_id is not null;

create index if not exists events_external_id_idx
  on public.events (user_id, external_id)
  where external_id is not null;
