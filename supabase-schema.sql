-- Run this once in your Supabase project's SQL Editor (Supabase dashboard -> SQL Editor -> New query)

create table if not exists app_state (
  user_id uuid references auth.users(id) primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: every user can only read/write their own state.
alter table app_state enable row level security;

create policy "Users can read their own state"
  on app_state for select
  using (auth.uid() = user_id);

create policy "Users can insert their own state"
  on app_state for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own state"
  on app_state for update
  using (auth.uid() = user_id);
