create extension if not exists pgcrypto;

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  description text,
  jurisdiction_state text,
  jurisdiction_county text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cases
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists jurisdiction_state text,
  add column if not exists jurisdiction_county text,
  add column if not exists status text not null default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.cases
set
  title = coalesce(title, name),
  jurisdiction_state = coalesce(jurisdiction_state, jurisdiction),
  description = coalesce(description, case_number),
  updated_at = coalesce(updated_at, created_at, now())
where
  title is null
  or jurisdiction_state is null
  or description is null
  or updated_at is null;

alter table public.cases
  alter column title set not null;

create index if not exists idx_cases_user_created_at
  on public.cases (user_id, created_at desc);

alter table public.cases enable row level security;

drop policy if exists "users can view own cases" on public.cases;
create policy "users can view own cases"
on public.cases
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can insert own cases" on public.cases;
create policy "users can insert own cases"
on public.cases
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can update own cases" on public.cases;
create policy "users can update own cases"
on public.cases
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users can delete own cases" on public.cases;
create policy "users can delete own cases"
on public.cases
for delete
to authenticated
using (user_id = auth.uid());
