alter table if exists public.user_profiles
  add column if not exists communication_style
    text default 'auto'
    check (communication_style in ('auto', 'simple', 'balanced', 'professional')),
  add column if not exists response_format
    text default 'auto'
    check (response_format in ('auto', 'bullets', 'prose')),
  add column if not exists explain_terms
    text default 'auto'
    check (explain_terms in ('auto', 'always', 'once', 'never')),
  add column if not exists detected_knowledge_level
    text default 'beginner'
    check (detected_knowledge_level in ('beginner', 'intermediate', 'advanced')),
  add column if not exists questions_asked_count
    integer default 0,
  add column if not exists preference_locked
    boolean default false;
