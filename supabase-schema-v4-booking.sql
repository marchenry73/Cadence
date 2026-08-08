-- ============================================================
-- Cadence v4 — public booking links
-- Lets anyone with your link see your open slots and request one.
-- Run in Supabase SQL Editor after v3.
-- ============================================================

create table if not exists booking_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  slug         text unique not null,
  title        text not null default 'Book a time',
  blurb        text,
  duration_min int  not null default 30,
  lead_hours   int  not null default 12,   -- earliest bookable, from now
  horizon_days int  not null default 14,   -- how far ahead to show
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists bookings (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references booking_links(id) on delete cascade,
  host_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  email      text not null,
  note       text,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  status     text not null default 'confirmed',
  created_at timestamptz not null default now()
);

create index if not exists bookings_host_idx on bookings(host_id, starts_at);

alter table booking_links enable row level security;
alter table bookings      enable row level security;

-- Owners manage their own links.
drop policy if exists "own links" on booking_links;
create policy "own links" on booking_links for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Hosts see bookings made with them.
drop policy if exists "host reads bookings" on bookings;
create policy "host reads bookings" on bookings for select
  using (auth.uid() = host_id);

drop policy if exists "host manages bookings" on bookings;
create policy "host manages bookings" on bookings for update
  using (auth.uid() = host_id);

-- ---------------------------------------------------------------
-- Public read: a visitor needs the link's settings and the host's
-- schedule to compute open slots. This exposes ONLY availability —
-- never block titles, notes, tasks, or any other personal data.
-- ---------------------------------------------------------------
create or replace function public_booking_link(link_slug text)
returns table (
  link_id uuid, host_id uuid, title text, blurb text,
  duration_min int, lead_hours int, horizon_days int,
  routines jsonb, events jsonb, day_start int, day_end int, host_name text
)
language sql
security definer
set search_path = public
as $$
  select
    bl.id, bl.user_id, bl.title, bl.blurb,
    bl.duration_min, bl.lead_hours, bl.horizon_days,
    -- strip everything except the time windows
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
    coalesce(p.full_name, p.username)
  from booking_links bl
  left join app_state s on s.user_id = bl.user_id
  left join profiles  p on p.user_id = bl.user_id
  where bl.slug = lower(trim(link_slug)) and bl.active = true
  limit 1;
$$;

-- Existing bookings block slots too (times only, no visitor details).
create or replace function public_booked_times(link_slug text)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select b.starts_at, b.ends_at
  from bookings b
  join booking_links bl on bl.id = b.link_id
  where bl.slug = lower(trim(link_slug))
    and b.status = 'confirmed'
    and b.starts_at > now();
$$;

-- Visitors create a booking through this function only.
create or replace function create_booking(
  link_slug text, visitor_name text, visitor_email text,
  visitor_note text, slot_start timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  bl booking_links%rowtype;
  new_id uuid;
begin
  select * into bl from booking_links
   where slug = lower(trim(link_slug)) and active = true;
  if not found then raise exception 'Link not found'; end if;

  if slot_start < now() + (bl.lead_hours || ' hours')::interval then
    raise exception 'That time is too soon';
  end if;

  if exists (
    select 1 from bookings
     where link_id = bl.id and status = 'confirmed'
       and starts_at < slot_start + (bl.duration_min || ' minutes')::interval
       and ends_at   > slot_start
  ) then
    raise exception 'That slot was just taken';
  end if;

  insert into bookings(link_id, host_id, name, email, note, starts_at, ends_at)
  values (bl.id, bl.user_id, visitor_name, visitor_email, visitor_note,
          slot_start, slot_start + (bl.duration_min || ' minutes')::interval)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public_booking_link(text) to anon, authenticated;
grant execute on function public_booked_times(text) to anon, authenticated;
grant execute on function create_booking(text,text,text,text,timestamptz) to anon, authenticated;
