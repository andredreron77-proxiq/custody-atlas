alter table if exists public.user_profiles
  add column if not exists display_name text;
