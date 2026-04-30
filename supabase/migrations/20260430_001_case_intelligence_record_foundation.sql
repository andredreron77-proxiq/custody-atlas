alter table if exists public.case_intelligence
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists intelligence_data jsonb not null default '{}'::jsonb,
  add column if not exists version integer not null default 1,
  add column if not exists change_log jsonb not null default '[]'::jsonb,
  add column if not exists last_refreshed_at timestamptz not null default now();

update public.case_intelligence ci
set
  user_id = c.user_id,
  last_refreshed_at = coalesce(ci.last_refreshed_at, ci.updated_at, ci.created_at, now())
from public.cases c
where c.id = ci.case_id
  and (ci.user_id is null or ci.last_refreshed_at is null);

alter table public.case_intelligence
  alter column user_id set not null;

create index if not exists idx_case_intelligence_user
  on public.case_intelligence (user_id);

create index if not exists idx_case_intelligence_updated
  on public.case_intelligence (updated_at desc);

alter table public.case_intelligence enable row level security;

drop policy if exists "users can view own case intelligence" on public.case_intelligence;
create policy "users can view own case intelligence"
on public.case_intelligence
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can insert own case intelligence" on public.case_intelligence;
create policy "users can insert own case intelligence"
on public.case_intelligence
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can update own case intelligence" on public.case_intelligence;
create policy "users can update own case intelligence"
on public.case_intelligence
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users can delete own case intelligence" on public.case_intelligence;
create policy "users can delete own case intelligence"
on public.case_intelligence
for delete
to authenticated
using (user_id = auth.uid());
