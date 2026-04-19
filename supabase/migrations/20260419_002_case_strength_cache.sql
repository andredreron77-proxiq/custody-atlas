alter table if exists public.cases
  add column if not exists strength_report_json jsonb,
  add column if not exists strength_cached_at timestamptz;
