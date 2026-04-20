-- Backfill missing schema pieces from 20260403_002_foundational_case_management.sql

alter table if exists public.cases
  add column if not exists description text;

create index if not exists idx_cases_user_created_at
  on public.cases (user_id, created_at desc);

alter table if exists public.cases enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cases'
      and policyname = 'users can view own cases'
  ) then
    create policy "users can view own cases"
    on public.cases
    for select
    to authenticated
    using (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cases'
      and policyname = 'users can insert own cases'
  ) then
    create policy "users can insert own cases"
    on public.cases
    for insert
    to authenticated
    with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cases'
      and policyname = 'users can update own cases'
  ) then
    create policy "users can update own cases"
    on public.cases
    for update
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cases'
      and policyname = 'users can delete own cases'
  ) then
    create policy "users can delete own cases"
    on public.cases
    for delete
    to authenticated
    using (user_id = auth.uid());
  end if;
end
$$;
