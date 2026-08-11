-- ============================================================
-- Cadence v6 — repoint the public booking page at the real tables
--
-- WHY THIS EXISTS
-- v4/v5 built the booking RPCs against app_state.state_v2 — the single
-- JSONB blob the app used at the time. The app has since moved to per-row
-- tables (routines, events, tasks, ...) and no longer writes state_v2 at
-- all. The booking page has therefore been computing availability from a
-- table nobody updates: it shows stale slots for old users and a wide-open
-- calendar for anyone who signed up after the migration.
--
-- This republishes public_booking_link against the live tables while
-- keeping the EXACT output shape book.html already consumes, so the fix is
-- server-side only. Three shape conversions happen here:
--   1. start_min / end_min (integer minutes)  ->  'HH:MM' strings
--   2. events.day (date)                      ->  'date' text field
--   3. prefs.focus_start / focus_end (minutes) -> day_start / day_end (hours)
--
-- It also fixes two correctness gaps the old version never had:
--   - deleted rows (deleted_at) no longer block slots
--   - routine skip_dates and per-day event overrides are now exposed, so
--     the page stops blocking time the host has actually freed up
--
-- Privacy contract is unchanged: this returns time windows only. No titles,
-- notes, categories, tasks, or goals ever cross this boundary.
--
-- Run in Supabase SQL Editor after v5.
-- ============================================================

create or replace function public_booking_link(link_slug text)
returns table (
  link_id uuid, host_id uuid, title text, blurb text,
  duration_min int, lead_hours int, horizon_days int,
  routines jsonb, events jsonb, day_start int, day_end int,
  host_name text, meeting_url text
)
language sql
security definer
set search_path = public
as $$
  select
    bl.id, bl.user_id, bl.title, bl.blurb,
    bl.duration_min, bl.lead_hours, bl.horizon_days,

    -- Recurring routines: weekday set + window, plus the dates the host
    -- has explicitly skipped. to_jsonb() on `days` and `skip_dates` keeps
    -- this agnostic to whether those columns are arrays or jsonb.
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',    r.id,
        'days',  to_jsonb(r.days),
        'start', lpad((r.start_min / 60)::text, 2, '0') || ':' || lpad((r.start_min % 60)::text, 2, '0'),
        'end',   lpad((r.end_min   / 60)::text, 2, '0') || ':' || lpad((r.end_min   % 60)::text, 2, '0'),
        'skips', coalesce(to_jsonb(r.skip_dates), '[]'::jsonb)
      ))
      from routines r
      where r.user_id = bl.user_id
        and r.deleted_at is null
    ), '[]'::jsonb),

    -- One-off events. routine_id is carried through so the page can tell
    -- that this event REPLACES the routine on that date rather than
    -- stacking on top of it.
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'date',       e.day::text,
        'start',      lpad((e.start_min / 60)::text, 2, '0') || ':' || lpad((e.start_min % 60)::text, 2, '0'),
        'end',        lpad((e.end_min   / 60)::text, 2, '0') || ':' || lpad((e.end_min   % 60)::text, 2, '0'),
        'routine_id', e.routine_id
      ))
      from events e
      where e.user_id = bl.user_id
        and e.deleted_at is null
        and e.day >= (current_date - 1)
        and e.day <= (current_date + bl.horizon_days + 1)
    ), '[]'::jsonb),

    -- prefs stores focus_start/focus_end as minutes from midnight
    -- (540 = 09:00, 1020 = 17:00). book.html wants whole hours.
    coalesce((select (pr.focus_start / 60)::int from prefs pr where pr.user_id = bl.user_id), 9),
    coalesce((select ((pr.focus_end + 59) / 60)::int from prefs pr where pr.user_id = bl.user_id), 17),

    coalesce(p.full_name, p.username),
    bl.meeting_url
  from booking_links bl
  left join profiles p on p.user_id = bl.user_id
  where bl.slug = lower(trim(link_slug))
    and bl.active = true
  limit 1;
$$;

grant execute on function public_booking_link(text) to anon, authenticated;

-- public_booked_times and create_booking are unaffected — they read the
-- bookings table directly and never touched state_v2.
