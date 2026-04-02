insert into public.document_case_links (document_id, case_id)
select d.id, d.case_id
from public.documents d
where d.case_id is not null
on conflict (document_id, case_id) do nothing;