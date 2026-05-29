-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- 1. Create the waitlist table
create table if not exists public.waitlist (
  id         uuid        primary key default gen_random_uuid(),
  name       text,
  email      text        not null unique,
  city       text,
  created_at timestamptz not null default now()
);

-- 2. Enable Row Level Security
alter table public.waitlist enable row level security;

-- 3. Allow anyone to INSERT (public waitlist form)
create policy "Public can join waitlist"
  on public.waitlist
  for insert
  with check (true);

-- 4. Only the service role (your backend / Supabase dashboard) can SELECT
--    The anon key used in the browser cannot read rows.
create policy "Service role reads waitlist"
  on public.waitlist
  for select
  using (auth.role() = 'service_role');
