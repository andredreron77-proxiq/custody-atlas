alter table public.documents
add column if not exists source_file_sha256 text;

create index if not exists idx_documents_user_hash
on public.documents (user_id, source_file_sha256);