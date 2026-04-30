alter table if exists public.user_profiles
  add column if not exists auto_update_cir boolean not null default false;

alter table if exists public.conversations
  add column if not exists cir_analysis_triggered boolean not null default false;

create table if not exists public.cir_update_proposals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  proposal_data jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'partially_accepted', 'auto_applied')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_cir_proposals_case
  on public.cir_update_proposals(case_id, status);

create index if not exists idx_cir_proposals_user
  on public.cir_update_proposals(user_id, status);

alter table public.cir_update_proposals enable row level security;

drop policy if exists "users can view own cir proposals" on public.cir_update_proposals;
create policy "users can view own cir proposals"
on public.cir_update_proposals
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users can insert own cir proposals" on public.cir_update_proposals;
create policy "users can insert own cir proposals"
on public.cir_update_proposals
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can update own cir proposals" on public.cir_update_proposals;
create policy "users can update own cir proposals"
on public.cir_update_proposals
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users can delete own cir proposals" on public.cir_update_proposals;
create policy "users can delete own cir proposals"
on public.cir_update_proposals
for delete
to authenticated
using (user_id = auth.uid());
