# Document Intake Duplicate-Prevention Redesign

## Root cause of prior duplicate handling failures

The previous flow performed parts of duplicate handling too late and with weak signals:

1. Exact duplicate checks existed, but semantic checks were based on filename heuristics only.
2. Full analysis could run before semantic duplicate classification.
3. Duplicate checks were not anchored on durable text identity (`intake_text_hash`) generated from lightweight OCR/extraction.
4. Existing duplicate rows already in the database continued to flow into downstream systems (alerts, timelines, case facts).

Result: duplicate analyzed records and duplicate downstream artifacts could still be produced.

## New intake sequence (pre-canonical)

New effective pipeline order:

1. Receive upload.
2. Collect metadata (filename, mime, file size, source kind).
3. Compute duplicate fingerprints (`file_hash`, normalized filename, `intake_text_hash`).
4. Run lightweight extraction/OCR (existing extraction path).
5. Classify duplicate tier: `EXACT_DUPLICATE`, `SEMANTIC_DUPLICATE`, `LIKELY_DUPLICATE`, `NEW_DOCUMENT`.
6. Return structured duplicate decision + allowed actions.
7. Only after approval, create canonical `documents` row and run full analysis.

Canonical row creation is now downstream of duplicate classification.

## Duplicate tiers and behavior

- `EXACT_DUPLICATE`: same user + same file hash; default block, allow View existing / Upload anyway.
- `SEMANTIC_DUPLICATE`: same user + matching normalized extracted-text hash; default block, allow Review existing / Upload anyway.
- `LIKELY_DUPLICATE`: lower-confidence match (filename overlap + text similarity); warn, allow continue upload.
- `NEW_DOCUMENT`: proceed normally.

## Durable identity fields

Added/persisted fields:

- `file_hash`
- `normalized_filename`
- `file_size_bytes`
- `source_kind`
- `intake_text_hash`
- `intake_text_preview`
- `duplicate_of_document_id`
- `duplicate_confidence`

At minimum, `file_hash` and `intake_text_hash` are persisted for durable matching.

## Staging model

Added `upload_intake_attempts` table. Each intake attempt records:

- fingerprints
- duplicate decision
- confidence
- matched document (when found)
- allowed actions

This allows pre-canonical decisioning and auditability.

## Full-scope same-user duplicate checks

Duplicate classification now evaluates against the user’s full document set via paged fetch, not just recent/session uploads.

## Structured API response behavior

The API now emits structured duplicate decisions and metadata for:

- `EXACT_DUPLICATE`
- `SEMANTIC_DUPLICATE`
- `LIKELY_DUPLICATE`
- `NEW_DOCUMENT` (in success payload)

with matching document metadata and actionable options.

## Pre-existing duplicate remediation strategy

`script/remediateDocumentDuplicates.ts` provides a dry-run/apply workflow:

1. Group same-user duplicates by `file_hash` and `intake_text_hash`.
2. Select canonical per group by:
   - richer analysis payload
   - case linkage
   - older stable record tie-breaker
3. Repoint dependent references to canonical document:
   - `document_case_links`
   - `document_analysis_runs`
   - `document_chunks`
   - `document_facts`
   - `document_dates`
   - `intelligence_audit_logs`
   - `case_facts.source` (document-id source)
4. Soft-clean duplicates:
   - set `duplicate_of_document_id`
   - set `duplicate_confidence`
   - set `lifecycle_state = 'duplicate_suppressed'`

No hard delete is required by default.
