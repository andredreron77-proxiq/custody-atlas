do $$
declare
  constraint_def text;
  existing_values text[];
  merged_values text[];
  values_sql text;
begin
  select pg_get_constraintdef(c.oid)
    into constraint_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where c.conname = 'conversations_conversation_type_check'
    and n.nspname = 'public'
    and t.relname = 'conversations';

  if constraint_def is null then
    raise exception 'Constraint public.conversations.conversations_conversation_type_check not found';
  end if;

  select array_agg(distinct m[1])
    into existing_values
  from regexp_matches(constraint_def, '''([^'']+)''', 'g') as m;

  merged_values := array(
    select distinct value
    from unnest(
      coalesce(existing_values, array[]::text[])
      || array[
        'general',
        'document_review',
        'guided_hearing_prep',
        'guided_respond_to_filing',
        'guided_respond_filing',
        'guided_more_time',
        'guided_figuring_it_out'
      ]
    ) as value
    order by value
  );

  select string_agg(quote_literal(value), ', ')
    into values_sql
  from unnest(merged_values) as value;

  execute 'alter table public.conversations drop constraint if exists conversations_conversation_type_check';

  execute format(
    'alter table public.conversations add constraint conversations_conversation_type_check check (conversation_type in (%s))',
    values_sql
  );
end
$$;
