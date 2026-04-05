alter table if exists public.documents
  add column if not exists file_hash text,
  add column if not exists normalized_filename text,
  add column if not exists file_size_bytes bigint,
  add column if not exists source_kind text,
  add column if not exists intake_text_hash text,
  add column if not exists intake_text_preview text,
  add column if not exists duplicate_of_document_id uuid,
  add column if not exists duplicate_confidence double precision;

update public.documents
set file_hash = lower(nullif(trim(source_file_sha256), ''))
where (file_hash is null or trim(file_hash) = '')
  and source_file_sha256 is not null;

create index if not exists idx_documents_user_file_hash
  on public.documents (user_id, file_hash);

create index if not exists idx_documents_user_intake_text_hash
  on public.documents (user_id, intake_text_hash);

create table if not exists public.upload_intake_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  file_name text not null,
  normalized_filename text,
  mime_type text,
  file_size_bytes bigint,
  source_kind text,
  file_hash text,
  intake_text_hash text,
  intake_text_preview text,
  duplicate_decision text not null,
  duplicate_confidence double precision,
  duplicate_of_document_id uuid,
  allowed_actions jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
