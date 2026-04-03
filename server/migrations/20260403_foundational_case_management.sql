-- Foundational Case Management
-- 1) create cases table
-- 2) add nullable case_id to documents for direct assignment

create extension if not exists pgcrypto;

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  case_number text,
  jurisdiction text,
  created_at timestamptz not null default now()
);

create index if not exists cases_user_created_idx
  on public.cases (user_id, created_at desc);

alter table public.documents
  add column if not exists case_id uuid references public.cases(id) on delete set null;

create index if not exists documents_case_idx
  on public.documents (case_id, user_id, created_at desc);
