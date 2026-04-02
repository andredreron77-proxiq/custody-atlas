# Custody Atlas: Attorney-Grade Document Retention & Intelligence Architecture (Phase 1)

## 1) Audit of the current storage model (before this refactor)

### Original uploaded files
- Upload requests are processed in `/api/analyze-document`.
- Files are extracted, then temporary upload files are deleted in `finally` via `unlinkSync`.
- Original files were **not always persisted** in object storage (`storagePath` can be `null`), so long-term file durability was inconsistent.

### Extracted text retained
- `documents.extracted_text` stores truncated text (first ~14k chars).
- This text was deleted only when the entire document row was deleted.

### Structured analysis retained
- `documents.analysis_json` stores the AI summary + extracted facts.
- Case-level copy of facts is separately upserted into `case_facts` for deterministic retrieval.

### What gets deleted and when
- Hard delete endpoint removes Supabase Storage object (if present) and then deletes the `documents` row.
- This also deletes all analysis/text attached to that row.
- There was no first-class retention window metadata (tier-aware expiry, lifecycle state, or analysis run history).

## 2) Target architecture (three-layer model)

### Layer A — Original Document Storage
- Canonical immutable upload artifact metadata on `documents`:
  - `storage_path`, `source_file_sha256`, MIME metadata
  - `retention_tier`, `original_expires_at`, `lifecycle_state`
- Security assumptions:
  - Private bucket only
  - Signed URL only after ownership check
  - No raw storage path leakage to client

### Layer B — Document Intelligence Storage
- Durable, queryable intelligence linked to document ID:
  - `document_analysis_runs` (versioned analysis history)
  - `document_chunks` (retrieval corpus)
  - `document_facts` (normalized extracted facts)
  - `document_dates` (timeline-ready extracted dates)

### Layer C — Case Intelligence Storage
- Cross-document case memory and actionability:
  - Existing `case_facts` remains deterministic resolution source.
  - Existing `case_actions`, `timeline_events`, and conversation memory remain case-level layer.
  - New `intelligence_audit_logs` scaffold enables attorney-grade traceability.

## 3) Tiered retention direction

Proposed defaults (implemented in code-level policy helper):
- **Free**: short original retention, medium intelligence retention.
- **Pro**: longer original + intelligence retention.
- **Attorney/Firm**: long horizon and indefinite-original preference.

These windows are now computed server-side at ingestion and written into document/intelligence records.

## 4) Ask Atlas retrieval direction

Ask Atlas should not rely only on lightweight summaries:
- Continue deterministic fact resolver for high-confidence fields.
- Inject retained chunk corpus (`document_chunks`) into system prompt for fact-heavy and context-heavy answers.
- Keep summary injection as secondary context, not sole source.

## 5) Migration plan

1. Run `server/migrations/20260402_document_retention_intelligence.sql` in Supabase.
2. Backfill existing documents:
   - assign default `retention_tier`
   - derive initial expiry windows
   - create baseline `document_analysis_runs` rows from current `analysis_json`.
3. Start dual-read:
   - Ask resolver uses existing `case_facts` + new `document_chunks` context.
4. Then enable lifecycle jobs:
   - scheduled retention sweeper to redact/expire originals while retaining permitted intelligence by tier.

## 6) Recommended next implementation steps

1. Add RLS policies for all new tables with strict `user_id` ownership checks.
2. Add a background retention worker that enforces `original_expires_at` and `expires_at`.
3. Add signed URL access logging into `intelligence_audit_logs`.
4. Add chunk embedding + vector index (pgvector) for semantic retrieval.
5. Add admin/attorney controls to set per-firm retention policy overrides.
6. Add migration/backfill scripts and operational dashboards for retention health.

