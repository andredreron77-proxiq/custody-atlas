begin;

create extension if not exists pgcrypto;

create table if not exists public.resources_cache (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  county text not null,
  state_normalized text not null,
  county_normalized text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (state_normalized, county_normalized)
);

create index if not exists resources_cache_lookup_idx
  on public.resources_cache (state_normalized, county_normalized, created_at desc);

create table if not exists public.attorney_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  state text not null,
  county text not null,
  created_at timestamptz not null default now(),
  unique (user_id, state, county)
);

create index if not exists attorney_waitlist_lookup_idx
  on public.attorney_waitlist (state, county, created_at desc);

commit;
