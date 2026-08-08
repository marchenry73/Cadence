-- ============================================================
-- Cadence v5 — meeting link on booking pages
-- Run after v4.
-- ============================================================

alter table booking_links add column if not exists meeting_url text;

-- Republish the booking lookup so it returns the meeting link too.
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
    coalesce((
      select jsonb_agg(jsonb_build_object('days',r->'days','start',r->'start','end',r->'end'))
      from jsonb_array_elements(s.state_v2->'routines') r
    ),'[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('date',e->'date','start',e->'start','end',e->'end'))
      from jsonb_array_elements(s.state_v2->'events') e
    ),'[]'::jsonb),
    coalesce((s.state_v2->'prefs'->>'dayStart')::int, 9),
    coalesce((s.state_v2->'prefs'->>'dayEnd')::int, 17),
    coalesce(p.full_name, p.username),
    bl.meeting_url
  from booking_links bl
  left join app_state s on s.user_id = bl.user_id
  left join profiles  p on p.user_id = bl.user_id
  where bl.slug = lower(trim(link_slug)) and bl.active = true
  limit 1;
$$;

grant execute on function public_booking_link(text) to anon, authenticated;
