-- Ensure durable same-user exact duplicate identity exists on documents.
-- This migration makes content hash persistence non-optional and enforces
-- one canonical row per (user_id, source_file_sha256).

alter table if exists public.documents
  add column if not exists source_file_sha256 text;

-- Backfill from prior analysis_json embedding where available.
update public.documents
set source_file_sha256 = lower(nullif(trim(analysis_json->>'source_file_sha256'), ''))
where (source_file_sha256 is null or trim(source_file_sha256) = '')
  and analysis_json ? 'source_file_sha256';

create unique index if not exists documents_user_source_hash_unique
  on public.documents (user_id, source_file_sha256)
  where source_file_sha256 is not null and source_file_sha256 <> '';
