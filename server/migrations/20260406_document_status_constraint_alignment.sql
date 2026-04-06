begin;

-- Normalize legacy lifecycle values before tightening/realigning constraints.
update public.documents
set analysis_status = case lower(coalesce(trim(analysis_status), ''))
  when 'analyzed' then 'completed'
  when 'success' then 'completed'
  when 'processing' then 'pending'
  when 'analyzing' then 'pending'
  when 'uploaded' then 'pending'
  when 'error' then 'failed'
  else analysis_status
end
where analysis_status is not null
  and lower(coalesce(trim(analysis_status), '')) in ('analyzed', 'success', 'processing', 'analyzing', 'uploaded', 'error');

update public.documents
set ocr_status = case lower(coalesce(trim(ocr_status), ''))
  when 'analyzed' then 'completed'
  when 'success' then 'completed'
  when 'processing' then 'pending'
  when 'analyzing' then 'pending'
  when 'uploaded' then 'pending'
  when 'error' then 'failed'
  else ocr_status
end
where ocr_status is not null
  and lower(coalesce(trim(ocr_status), '')) in ('analyzed', 'success', 'processing', 'analyzing', 'uploaded', 'error');

alter table if exists public.documents
  drop constraint if exists documents_analysis_status_check,
  drop constraint if exists documents_ocr_status_check;

-- Keep lifecycle columns forward-compatible while accepting legacy values during rollout.
alter table if exists public.documents
  add constraint documents_analysis_status_check
    check (lower(analysis_status) in (
      'pending',
      'completed',
      'failed',
      'analyzed',
      'processing',
      'analyzing',
      'uploaded',
      'success',
      'error'
    )),
  add constraint documents_ocr_status_check
    check (lower(ocr_status) in (
      'pending',
      'completed',
      'failed',
      'analyzed',
      'processing',
      'analyzing',
      'uploaded',
      'success',
      'error'
    ));

commit;
