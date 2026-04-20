-- schema_audit.sql
-- Read-only audit for Custody Atlas Supabase schema.
-- Paste into the Supabase SQL Editor.
-- Returns one result set containing:
-- 1. Detailed PASS/FAIL rows for every table, column, index, trigger, policy, and RLS check
-- 2. Final summary rows per check_type

with expected_tables as (
  select *
  from (
    values
      ('public', 'documents', 'Foundational document store plus later additive columns'),
      ('public', 'document_case_links', '20260401_002_add_document_case_links.sql'),
      ('public', 'cases', '20260403_002_foundational_case_management.sql'),
      ('public', 'case_alerts', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'upload_intake_attempts', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'case_intelligence', '20260407_001_case_intelligence.sql'),
      ('public', 'attorney_waitlist', '20260414_001_attorney_waitlist.sql'),
      ('public', 'user_profiles', 'Pre-existing table altered by multiple migrations'),
      ('public', 'usage_limits', 'Pre-existing table altered by 20260416_001_monthly_usage.sql'),
      ('public', 'signals', 'Manual signals table')
  ) as t(schema_name, table_name, source_migration)
),
expected_columns as (
  select *
  from (
    values
      ('public', 'documents', 'source_file_sha256', '20260401_001_add_document_hash.sql'),
      ('public', 'documents', 'case_id', '20260403_002_foundational_case_management.sql'),
      ('public', 'documents', 'file_hash', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'documents', 'normalized_filename', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'documents', 'file_size_bytes', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'documents', 'source_kind', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'documents', 'intake_text_hash', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'documents', 'intake_text_preview', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'documents', 'duplicate_of_document_id', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'documents', 'duplicate_confidence', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'documents', 'analysis_status', '20260406_003_document_status_constraint_alignment.sql'),
      ('public', 'documents', 'ocr_status', '20260406_003_document_status_constraint_alignment.sql'),

      ('public', 'document_case_links', 'id', '20260401_002_add_document_case_links.sql'),
      ('public', 'document_case_links', 'document_id', '20260401_002_add_document_case_links.sql'),
      ('public', 'document_case_links', 'case_id', '20260401_002_add_document_case_links.sql'),
      ('public', 'document_case_links', 'linked_at', '20260401_002_add_document_case_links.sql'),

      ('public', 'cases', 'id', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'user_id', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'title', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'description', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'jurisdiction_state', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'jurisdiction_county', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'status', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'created_at', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'updated_at', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'strength_report_json', '20260419_002_case_strength_cache.sql'),
      ('public', 'cases', 'strength_cached_at', '20260419_002_case_strength_cache.sql'),

      ('public', 'case_alerts', 'id', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'case_id', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'user_id', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'alert_key', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'alert_type', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'state', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'title', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'message', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'impact', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'severity', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'related_item', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'recommended_action', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'target_label', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'target_href', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'target_section', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'resolution_method', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'resolved_by_document_id', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'resolved_by_event_id', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'resolved_by_user_id', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'resolution_note', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'suggested_resolution_json', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'resolved_at', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'created_at', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'updated_at', '20260404_001_case_alert_lifecycle.sql'),

      ('public', 'upload_intake_attempts', 'id', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'user_id', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'file_name', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'normalized_filename', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'mime_type', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'file_size_bytes', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'source_kind', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'file_hash', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'intake_text_hash', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'intake_text_preview', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'duplicate_decision', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'duplicate_confidence', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'duplicate_of_document_id', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'allowed_actions', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'metadata', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'upload_intake_attempts', 'created_at', '20260405_002_document_intake_dedupe.sql'),

      ('public', 'case_intelligence', 'id', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'case_id', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'case_stage', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'summary', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'primary_issue', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'active_issues_json', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'key_dates_json', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'obligations_json', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'risks_json', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'actions_json', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'what_matters_now_json', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'missing_information_json', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'source_document_ids_json', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'communication_profile_json', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'confidence_score', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'created_at', '20260407_001_case_intelligence.sql'),
      ('public', 'case_intelligence', 'updated_at', '20260407_001_case_intelligence.sql'),

      ('public', 'attorney_waitlist', 'id', '20260414_001_attorney_waitlist.sql'),
      ('public', 'attorney_waitlist', 'user_id', '20260414_001_attorney_waitlist.sql'),
      ('public', 'attorney_waitlist', 'email', '20260414_001_attorney_waitlist.sql'),
      ('public', 'attorney_waitlist', 'state', '20260414_001_attorney_waitlist.sql'),
      ('public', 'attorney_waitlist', 'county', '20260414_001_attorney_waitlist.sql'),
      ('public', 'attorney_waitlist', 'created_at', '20260414_001_attorney_waitlist.sql'),

      ('public', 'user_profiles', 'display_name', '20260403_001_user_profiles_display_name.sql'),
      ('public', 'user_profiles', 'welcome_dismissed_at', '20260407_002_user_profiles_welcome_dismissed.sql'),
      ('public', 'user_profiles', 'stripe_customer_id', '20260415_001_stripe_billing.sql'),
      ('public', 'user_profiles', 'stripe_subscription_id', '20260415_001_stripe_billing.sql'),
      ('public', 'user_profiles', 'subscription_status', '20260415_001_stripe_billing.sql'),
      ('public', 'user_profiles', 'communication_style', '20260419_001_user_preferences.sql'),
      ('public', 'user_profiles', 'response_format', '20260419_001_user_preferences.sql'),
      ('public', 'user_profiles', 'explain_terms', '20260419_001_user_preferences.sql'),
      ('public', 'user_profiles', 'detected_knowledge_level', '20260419_001_user_preferences.sql'),
      ('public', 'user_profiles', 'questions_asked_count', '20260419_001_user_preferences.sql'),
      ('public', 'user_profiles', 'preference_locked', '20260419_001_user_preferences.sql'),

      ('public', 'usage_limits', 'billing_period', '20260416_001_monthly_usage.sql'),

      ('public', 'signals', 'id', 'Manual signals table'),
      ('public', 'signals', 'case_id', 'Manual signals table'),
      ('public', 'signals', 'document_id', 'Manual signals table'),
      ('public', 'signals', 'type', 'Manual signals table'),
      ('public', 'signals', 'title', 'Manual signals table'),
      ('public', 'signals', 'detail', 'Manual signals table'),
      ('public', 'signals', 'due_date', 'Manual signals table'),
      ('public', 'signals', 'source_document_ids', 'Manual signals table'),
      ('public', 'signals', 'dismissed', 'Manual signals table'),
      ('public', 'signals', 'score', 'Manual signals table'),
      ('public', 'signals', 'created_at', 'Manual signals table')
  ) as c(schema_name, table_name, column_name, source_migration)
),
expected_indexes as (
  select *
  from (
    values
      ('public', 'idx_documents_user_hash', 'documents', '20260401_001_add_document_hash.sql'),
      ('public', 'idx_document_case_links_document_id', 'document_case_links', '20260401_002_add_document_case_links.sql'),
      ('public', 'idx_document_case_links_case_id', 'document_case_links', '20260401_002_add_document_case_links.sql'),
      ('public', 'idx_cases_user_created_at', 'cases', '20260403_002_foundational_case_management.sql'),
      ('public', 'idx_case_alerts_case_user', 'case_alerts', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'idx_documents_user_file_hash', 'documents', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'idx_documents_user_intake_text_hash', 'documents', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'idx_documents_duplicate_of_document_id', 'documents', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'idx_upload_intake_attempts_user_created', 'upload_intake_attempts', '20260405_002_document_intake_dedupe.sql'),
      ('public', 'idx_case_intelligence_case_id', 'case_intelligence', '20260407_001_case_intelligence.sql'),
      ('public', 'attorney_waitlist_user_id_idx', 'attorney_waitlist', '20260414_001_attorney_waitlist.sql'),
      ('public', 'idx_user_profiles_stripe_customer', 'user_profiles', '20260415_001_stripe_billing.sql'),
      ('public', 'usage_limits_user_billing_period_idx', 'usage_limits', '20260416_001_monthly_usage.sql'),
      ('public', 'idx_signals_case_id', 'signals', 'Manual signals table'),
      ('public', 'idx_signals_document_id', 'signals', 'Manual signals table'),
      ('public', 'idx_signals_due_date', 'signals', 'Manual signals table'),
      ('public', 'idx_signals_type', 'signals', 'Manual signals table')
  ) as i(schema_name, index_name, table_name, source_migration)
),
expected_triggers as (
  select *
  from (
    values
      ('public', 'case_intelligence', 'trg_case_intelligence_set_updated_at', '20260407_001_case_intelligence.sql')
  ) as t(schema_name, table_name, trigger_name, source_migration)
),
expected_policies as (
  select *
  from (
    values
      ('public', 'document_case_links', 'users can view own document_case_links', '20260401_004_document_case_links_rls.sql'),
      ('public', 'document_case_links', 'users can insert own document_case_links', '20260401_004_document_case_links_rls.sql'),
      ('public', 'document_case_links', 'users can delete own document_case_links', '20260401_004_document_case_links_rls.sql'),
      ('public', 'cases', 'users can view own cases', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'users can insert own cases', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'users can update own cases', '20260403_002_foundational_case_management.sql'),
      ('public', 'cases', 'users can delete own cases', '20260403_002_foundational_case_management.sql'),
      ('public', 'case_alerts', 'users can view own case alerts', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'users can insert own case alerts', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'case_alerts', 'users can update own case alerts', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'attorney_waitlist', 'Users can manage their own waitlist entry', '20260414_001_attorney_waitlist.sql')
  ) as p(schema_name, table_name, policy_name, source_migration)
),
expected_rls as (
  select *
  from (
    values
      ('public', 'document_case_links', '20260401_004_document_case_links_rls.sql'),
      ('public', 'cases', '20260403_002_foundational_case_management.sql'),
      ('public', 'case_alerts', '20260404_001_case_alert_lifecycle.sql'),
      ('public', 'attorney_waitlist', '20260414_001_attorney_waitlist.sql')
  ) as r(schema_name, table_name, source_migration)
),
detail_rows as (
  select
    'TABLE'::text as check_type,
    format('%I.%I', t.schema_name, t.table_name) as object_name,
    case when cls.oid is not null then 'PASS' else 'FAIL' end as status,
    t.source_migration
  from expected_tables t
  left join pg_namespace ns
    on ns.nspname = t.schema_name
  left join pg_class cls
    on cls.relnamespace = ns.oid
   and cls.relname = t.table_name
   and cls.relkind in ('r', 'p')

  union all

  select
    'COLUMN'::text as check_type,
    format('%I.%I.%I', c.schema_name, c.table_name, c.column_name) as object_name,
    case when cols.column_name is not null then 'PASS' else 'FAIL' end as status,
    c.source_migration
  from expected_columns c
  left join information_schema.columns cols
    on cols.table_schema = c.schema_name
   and cols.table_name = c.table_name
   and cols.column_name = c.column_name

  union all

  select
    'INDEX'::text as check_type,
    format('%I.%I', i.schema_name, i.index_name) as object_name,
    case when idx.indexname is not null then 'PASS' else 'FAIL' end as status,
    i.source_migration
  from expected_indexes i
  left join pg_indexes idx
    on idx.schemaname = i.schema_name
   and idx.indexname = i.index_name

  union all

  select
    'TRIGGER'::text as check_type,
    format('%I.%I.%I', t.schema_name, t.table_name, t.trigger_name) as object_name,
    case when trg.tgname is not null then 'PASS' else 'FAIL' end as status,
    t.source_migration
  from expected_triggers t
  left join pg_namespace ns
    on ns.nspname = t.schema_name
  left join pg_class cls
    on cls.relnamespace = ns.oid
   and cls.relname = t.table_name
  left join pg_trigger trg
    on trg.tgrelid = cls.oid
   and trg.tgname = t.trigger_name
   and not trg.tgisinternal

  union all

  select
    'POLICY'::text as check_type,
    format('%I.%I.%s', p.schema_name, p.table_name, p.policy_name) as object_name,
    case when pol.policyname is not null then 'PASS' else 'FAIL' end as status,
    p.source_migration
  from expected_policies p
  left join pg_policies pol
    on pol.schemaname = p.schema_name
   and pol.tablename = p.table_name
   and pol.policyname = p.policy_name

  union all

  select
    'RLS'::text as check_type,
    format('%I.%I', r.schema_name, r.table_name) as object_name,
    case when cls.relrowsecurity then 'PASS' else 'FAIL' end as status,
    r.source_migration
  from expected_rls r
  left join pg_namespace ns
    on ns.nspname = r.schema_name
  left join pg_class cls
    on cls.relnamespace = ns.oid
   and cls.relname = r.table_name
   and cls.relkind in ('r', 'p')
),
summary_rows as (
  select
    'SUMMARY'::text as check_type,
    check_type || ' totals' as object_name,
    (count(*) filter (where status = 'PASS'))::text || '/' || count(*)::text || ' passed' as status,
    'failed=' || (count(*) filter (where status = 'FAIL'))::text as source_migration
  from detail_rows
  group by check_type
)
select
  check_type,
  object_name,
  status,
  source_migration
from (
  select * from detail_rows
  union all
  select * from summary_rows
) results
order by
  case when check_type = 'SUMMARY' then 1 else 0 end,
  case when status = 'FAIL' then 0 else 1 end,
  check_type,
  object_name;
