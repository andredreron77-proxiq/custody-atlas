begin;

alter table if exists public.documents
  add column if not exists ocr_status text not null default 'pending',
  add column if not exists analysis_status text not null default 'pending';

-- OCR considered completed whenever extracted text exists.
update public.documents
set ocr_status = 'completed'
where coalesce(trim(extracted_text), '') <> ''
  and coalesce(trim(ocr_status), '') in ('', 'pending', 'uploaded', 'analyzing', 'processing');

-- Analysis lifecycle reconciliation from legacy analysis_json payload.
update public.documents
set analysis_status = case
  when lower(coalesce(analysis_json->>'analysis_status', '')) in ('failed', 'error') then 'failed'
  when coalesce(trim(analysis_json->>'summary'), '') <> '' then 'completed'
  when lower(coalesce(analysis_json->>'analysis_status', '')) in ('analyzed', 'completed', 'success') then 'completed'
  else analysis_status
end
where analysis_json is not null;

commit;
