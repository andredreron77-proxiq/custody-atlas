alter table if exists public.user_profiles
  add column if not exists jurisdiction_state text,
  add column if not exists jurisdiction_county text;
