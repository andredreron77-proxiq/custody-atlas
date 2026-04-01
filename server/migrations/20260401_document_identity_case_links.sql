-- Canonical document identity + case association migration
-- Date: 2026-04-01

begin;

-- 1) Canonical identity column on documents
alter table if exists public.documents
  add column if not exists source_file_sha256 text;

-- Backfill from legacy analysis_json payload when present.
update public.documents
set source_file_sha256 = lower(analysis_json->>'source_file_sha256')
where source_file_sha256 is null
  and analysis_json ? 'source_file_sha256'
  and coalesce(analysis_json->>'source_file_sha256', '') <> '';

create unique index if not exists documents_user_hash_unique
  on public.documents (user_id, source_file_sha256)
  where source_file_sha256 is not null;

-- 2) Association table for many-to-many case linkage
create table if not exists public.document_case_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (document_id, case_id)
);

create index if not exists document_case_links_case_user_idx
  on public.document_case_links (case_id, user_id, created_at desc);

-- 3) Backfill links from legacy one-to-one documents.case_id
insert into public.document_case_links (document_id, case_id, user_id)
select d.id, d.case_id, d.user_id
from public.documents d
where d.case_id is not null
on conflict (document_id, case_id) do nothing;

commit;
