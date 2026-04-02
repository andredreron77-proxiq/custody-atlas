create table if not exists public.document_case_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  linked_at timestamptz not null default now(),
  constraint uq_document_case unique (document_id, case_id)
);

create index if not exists idx_document_case_links_document_id
on public.document_case_links(document_id);

create index if not exists idx_document_case_links_case_id
on public.document_case_links(case_id);