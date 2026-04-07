alter table if exists public.user_profiles
  add column if not exists welcome_dismissed_at timestamptz;
