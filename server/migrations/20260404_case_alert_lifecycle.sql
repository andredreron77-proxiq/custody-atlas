create extension if not exists pgcrypto;

create table if not exists public.case_alerts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_key text not null,
  alert_type text not null,
  state text not null default 'active',
  title text not null,
  message text not null,
  impact text not null,
  severity text not null default 'info',
  related_item text not null,
  recommended_action text not null,
  target_label text not null,
  target_href text not null,
  target_section text not null,
  resolution_method text,
  resolved_by_document_id uuid,
  resolved_by_event_id uuid,
  resolved_by_user_id uuid,
  resolution_note text,
  suggested_resolution_json jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, alert_key)
);

create index if not exists idx_case_alerts_case_user
  on public.case_alerts (case_id, user_id, updated_at desc);

alter table public.case_alerts enable row level security;

drop policy if exists "users can view own case alerts" on public.case_alerts;
create policy "users can view own case alerts"
on public.case_alerts
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "users can insert own case alerts" on public.case_alerts;
create policy "users can insert own case alerts"
on public.case_alerts
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can update own case alerts" on public.case_alerts;
create policy "users can update own case alerts"
on public.case_alerts
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
