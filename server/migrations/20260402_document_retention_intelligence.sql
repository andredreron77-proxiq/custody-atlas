-- Attorney-grade document retention and intelligence layer
-- Date: 2026-04-02

begin;

-- ── Documents: retention metadata + lifecycle state ──────────────────────────
alter table if exists public.documents
  add column if not exists retention_tier text not null default 'free',
  add column if not exists original_expires_at timestamptz,
  add column if not exists intelligence_expires_at timestamptz,
  add column if not exists lifecycle_state text not null default 'active';

create index if not exists documents_user_lifecycle_idx
  on public.documents (user_id, lifecycle_state, created_at desc);

-- ── Document intelligence storage ─────────────────────────────────────────────
create table if not exists public.document_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  model_name text not null,
  prompt_version text not null,
  status text not null default 'completed',
  analysis_json jsonb not null,
  extracted_text_snapshot text,
  retention_tier text not null default 'free',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists document_analysis_runs_document_idx
  on public.document_analysis_runs (document_id, created_at desc);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  chunk_index integer not null,
  chunk_text text not null,
  token_estimate integer,
  retention_tier text not null default 'free',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists document_chunks_doc_lookup_idx
  on public.document_chunks (document_id, chunk_index);

create table if not exists public.document_facts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  fact_type text not null,
  fact_value text not null,
  confidence text not null default 'medium',
  source text not null default 'analysis',
  retention_tier text not null default 'free',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists document_facts_case_idx
  on public.document_facts (case_id, user_id, fact_type, created_at desc);

create table if not exists public.document_dates (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  date_label text not null,
  normalized_date timestamptz,
  source text not null default 'analysis',
  retention_tier text not null default 'free',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists document_dates_case_idx
  on public.document_dates (case_id, user_id, created_at desc);

-- ── Case intelligence audit log scaffold ─────────────────────────────────────
create table if not exists public.intelligence_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  action text not null,
  actor_type text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists intelligence_audit_logs_lookup_idx
  on public.intelligence_audit_logs (user_id, case_id, created_at desc);

commit;
