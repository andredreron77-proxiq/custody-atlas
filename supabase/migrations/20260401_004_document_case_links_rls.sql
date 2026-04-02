alter table public.document_case_links enable row level security;

create policy "users can view own document_case_links"
on public.document_case_links
for select
to authenticated
using (
  exists (
    select 1
    from public.documents d
    where d.id = document_case_links.document_id
      and d.user_id = auth.uid()
  )
);

create policy "users can insert own document_case_links"
on public.document_case_links
for insert
to authenticated
with check (
  exists (
    select 1
    from public.documents d
    where d.id = document_case_links.document_id
      and d.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.cases c
    where c.id = document_case_links.case_id
      and c.user_id = auth.uid()
  )
);

create policy "users can delete own document_case_links"
on public.document_case_links
for delete
to authenticated
using (
  exists (
    select 1
    from public.documents d
    where d.id = document_case_links.document_id
      and d.user_id = auth.uid()
  )
);