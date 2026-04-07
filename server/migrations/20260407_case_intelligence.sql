create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.case_intelligence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  case_stage text,
  summary text,
  primary_issue text,
  active_issues_json jsonb not null default '[]'::jsonb,
  key_dates_json jsonb not null default '[]'::jsonb,
  obligations_json jsonb not null default '[]'::jsonb,
  risks_json jsonb not null default '[]'::jsonb,
  actions_json jsonb not null default '[]'::jsonb,
  what_matters_now_json jsonb not null default '{}'::jsonb,
  missing_information_json jsonb not null default '[]'::jsonb,
  source_document_ids_json jsonb not null default '[]'::jsonb,
  communication_profile_json jsonb not null default '{"mode":"simple","reading_level":"grade_5","explain_legal_terms":true,"tone":"calm_supportive_direct"}'::jsonb,
  confidence_score numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_case_intelligence_case_id
  on public.case_intelligence (case_id);

drop trigger if exists trg_case_intelligence_set_updated_at on public.case_intelligence;
create trigger trg_case_intelligence_set_updated_at
before update on public.case_intelligence
for each row
execute function public.set_updated_at();
