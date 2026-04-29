alter table if exists public.documents
  add column if not exists doc_questions_used integer not null default 0;
