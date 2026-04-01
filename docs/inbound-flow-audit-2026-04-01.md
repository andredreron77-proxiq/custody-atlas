# Custody Atlas Inbound Flow Audit (Free vs Pro)

Date: 2026-04-01

## Scope audited
- Document ingestion: upload, re-analyze, OCR/scanned input, duplicate handling.
- Ask Atlas: general Q&A, document-aware questions, follow-ups, summary flow.
- Jurisdiction/location: ZIP, GPS detection, county ambiguity/confirmation, restoration.
- Workspace/state: onboarding prompts, active case prompts, counts, recent activity, unresolved signal logic.

---

## 1) Inbound flow map by mode (Free vs Pro)

### A. Document ingestion flows

#### Route and handler map
- **Common endpoint (Free + Pro):** `POST /api/analyze-document` in `server/routes.ts`.
  - Middleware stack: `requireAuth` -> `checkDocumentLimit` -> `multer.single("file")`.
  - Validation + extraction pipeline:
    1. `validateAnalyzeDocumentGuards(...)`
    2. MIME/type validation against `SUPPORTED_MIME_TYPES`
    3. OCR/text extraction via `extractText(...)`
    4. sparse-text rejection (`trim().length < 20`) with `422`
    5. AI JSON normalization/validation (`normalizeDocumentAnalysisPayload`, `documentAnalysisResultSchema`).
  - Persistence path:
    - compute SHA-256 of uploaded source file
    - `findDuplicateDocument(userId, { fileHash, caseId })`
    - if no duplicate: `saveDocument(...)`
    - if duplicate: `updateDocumentAnalysis(...)` on existing row.
- **Re-analysis endpoint (Free + Pro):** `POST /api/documents/:documentId/reanalyze`.
  - Loads existing document by ownership (`getDocumentById(documentId, user.id)`), re-runs AI on stored text, then `updateDocumentAnalysis(...)` only.
- **Document Q&A endpoint (Free + Pro):** `POST /api/ask-document` with schema validation and structured JSON response validation.

#### Client entrypoints
- Upload UI entrypoint is unified in `UploadDocumentPage.tsx`; both tiers submit to `/api/analyze-document`.
- Re-analyze in same page calls `/api/documents/:documentId/reanalyze` if `documentId` exists; fallback is full upload analyze if no id exists.
- Multi-page scan path is client-composed (`combineImagePages`) before upload; server treats combined text as one logical doc with `pageCount` metadata.

#### Free/Pro divergence
- Core ingestion logic is shared.
- Divergence is usage gating only:
  - `checkDocumentLimit` uses tier limits (`free:1`, `pro:10`/day).
- Pro users more commonly include `caseId` query param from case dashboard links, activating case-scoped persistence and post-analysis fact/action generation.

---

### B. Ask Atlas / question flows

#### Route and handler map
- **Common endpoint (Free + Pro):** `POST /api/ask`.
  - Middleware: `requireAuth` + `checkQuestionLimit`.
  - Validates request (`askAIRequestSchema` + case/conversation extension).
  - Enforces jurisdiction state+county presence.
  - Supports two persistence/state modes:
    1. **Legacy thread mode** (no `caseId`): client-provided history + thread storage.
    2. **Case conversation mode** (`caseId`): ownership checks via `getCaseById`, conversation ownership via `getConversationById`, server-loaded history via `getRecentConversationMessages`, message persistence via `appendConversationMessage`.
  - Document context options:
    - `documentId`: strict document-scope injection, ownership-enforced by `getDocumentById`.
    - `selectedDocumentIds`: filtered context injection.
  - Deterministic FACT resolver path: `detectIntent` + `resolveFactDeterministically`; early return without LLM when found/conflict.
- **Document-specific follow-up endpoint:** `POST /api/ask-document`.
- **Summary flow endpoint:** `POST /api/workspace/summarize` (workspace-level synthesis).

#### Client entrypoints
- Ask page uses shared `ChatBox` and always posts to `/api/ask`.
- Follow-ups are sent through same conversation path (case conversation id or legacy history).
- Document-context injection originates from Ask URL param `?document=` and selected doc IDs in Ask UI.

#### Free/Pro divergence
- Core `/api/ask` logic is shared.
- Divergence is quota + UI affordance:
  - `checkQuestionLimit` uses tier limits (`free:5`, `pro:25`/day).
  - Pro-only emphasis in workspace UI for “Summarize my situation” CTA, but endpoint itself is not tier-guarded server-side.

---

### C. Jurisdiction / location flows

#### Route and handler map
- `POST /api/geocode/zip` -> `geocodeByZip(...)`:
  - strict ZIP regex via schema
  - exact postal-code match filtering
  - US-country validation
  - county fallback via reverse geocode center-point with `countyIsApproximate=true`.
- `POST /api/geocode/coordinates` -> `geocodeByCoordinates(...)`.

#### Client entrypoints and state behavior
- `LocationSelector` drives GPS and ZIP flows.
- County ambiguity paths are explicit UI states:
  - `county_confirm` (approximate county needs user confirmation)
  - `county_ambiguous` (no county resolved; manual entry required).
- Returning-user restoration is handled by `useJurisdiction` localStorage with:
  - user-scoped storage guard (`sessionStorage` user id match)
  - stale-entry purge (90-day soft expiry)
  - sentinel county normalization.

#### Free/Pro divergence
- No server-side Free/Pro divergence detected in geocoding/location routes.

---

### D. Workspace/state flows

#### Route and handler map
- `GET /api/workspace` returns threads + documents + timeline events (auth-scoped).
- `GET /api/cases/:caseId/actions` returns enriched actions and triggers idempotent action generation.
- `GET /api/cases/:caseId/facts`, `/timeline`, etc. support active-case state.

#### Client state engines
- Onboarding modal is first-auth-visit localStorage gated (`custody-atlas:onboarded`).
- Workspace primary state is derived by `deriveCaseActivityState(...)` using document/question counts + unresolved signals.
- “Next best step” prompt selection uses scenario resolver in `WorkspacePage`.
- Document and question counts come from `/api/workspace` (documents, threads).
- Unresolved risk/action is currently signal-based (risk inferred from analyzed docs in workspace page; action urgency from case actions endpoints/UI).

#### Free/Pro divergence
- Shared workspace data pipeline.
- Pro-specific UX branch: “pro-summarize” scenario and Pro badge rendering.

---

## 2) Validation audit by inbound path

### Authentication and user scoping
- `/api/analyze-document`, `/api/ask`, `/api/ask-document`, `/api/workspace`, case routes all require auth.
- Ownership checks are present for document and case scoped operations (`getDocumentById`, `getCaseById`, conversation-to-case matching).

### Case scoping
- Applied in `/api/ask` case path and case routes; case existence/ownership is verified before read/write.
- In document ingestion, case scoping is optional via `caseId` form field and affects dedupe scope + fact/action post-processing.

### Deduplication
- Implemented in analyze-document path using source-file SHA-256 + `findDuplicateDocument`.
- Dedupe is **scope-sensitive** to `(user_id, file_hash, case_id)` where case must match exactly (`eq(case_id, X)` or `is null`).

### Sparse document handling
- Explicit check rejects extracted text `< 20` chars with `422`.

### OCR/extraction failure handling
- Extraction errors return `422` with readable message.
- Guard/precondition failures return structured error with code `DOCUMENT_ANALYSIS_PRECONDITION_FAILED`.

### Structured error responses
- Present on most main endpoints (400/401/403/404/422/429/500).
- Some branches include `code`, others return plain `error` only (inconsistent but functional).

### State-aware prompts
- `/api/ask` injects case memory, conversation history, and intent mode addenda.
- Deterministic FACT mode reduces hallucination risk and is state-aware.

### Document-context-aware Q&A
- Strong support in `/api/ask` via `documentId` and `selectedDocumentIds`.
- Separate `/api/ask-document` flow also context-aware but uses client-provided analysis/text payload rather than server document lookup.

---

## 3) Inconsistencies (Free vs Pro without clear product reason)

1. **Dedupe scope differs by case linkage, not by tier intent**
   - Same file can be de-duplicated in one scope (null case) but inserted again in another scope (case-linked), which feels like inconsistent behavior to end users.

2. **Workspace summary is effectively available to both tiers server-side**
   - UI emphasizes Pro scenario, but `/api/workspace/summarize` has no tier check.

3. **Document follow-up endpoint lacks quota middleware**
   - `/api/ask-document` is authenticated but does not apply `checkQuestionLimit`; `/api/ask` does.

4. **Structured error shape varies across routes**
   - Some endpoints return `{ error, code, details }`, others only `{ error }`.

---

## 4) Root cause: why duplicates still appear in Pro mode

### Primary root cause
The dedupe check in `findDuplicateDocument` is case-scoped, and the analyze route passes `caseId` from the active case context. Therefore duplicates are only blocked when **both hash and case_id match exactly**. If the same binary file is uploaded in a different scope (no-case vs case, or case A vs case B), dedupe intentionally misses and creates a new row.

Why this is seen mostly in Pro:
- Pro users are far more likely to operate via case dashboard flows that append `?case=<id>` to upload routes.
- Free usage is more often unscoped (case_id null), so repeats hit the same null-scope bucket and dedupe appears to “work better.”

### Secondary contributing factors
- Legacy rows created before source hash backfill (no `analysis_json.source_file_sha256`) cannot be matched by hash contains lookup.
- Client fallback path (`reanalyzeDocument` -> `analyzeDocument` when `documentId` missing) can create a fresh analyze request instead of in-place reanalysis.

---

## 5) Recommended refactor plan (audit-first, low-risk sequence)

1. **Define dedupe policy explicitly**
   - Decide whether dedupe should be global per user hash or scoped per case.
   - If global: canonical document row + case-document linking table.

2. **Two-phase dedupe lookup**
   - Phase 1: exact scope match (current behavior).
   - Phase 2: same user+hash across any scope -> optionally link instead of insert.

3. **Backfill source hashes**
   - Migration/job to compute and store `source_file_sha256` for old documents where possible.

4. **Normalize error contract**
   - Standardize `{ error, code, details? }` across inbound APIs.

5. **Align quota strategy**
   - Decide whether `/api/ask-document` counts against question limits; enforce consistently.

6. **Make summary tier policy explicit server-side**
   - Either gate endpoint for Pro or intentionally document it as all-tier.

---

## 6) Recommended regression tests

1. **Dedup matrix tests (critical)**
   - same user + same hash + same case_id -> no new row
   - same user + same hash + null case_id twice -> no new row
   - same user + same hash + case A then case B -> policy-defined behavior asserted
   - same user + same hash + null then case A -> policy-defined behavior asserted

2. **Case ownership tests**
   - `/api/ask` with чужой caseId/conversationId/documentId returns 403/404 as expected.

3. **Document context tests**
   - `/api/ask` with `selectedDocumentIds=[]` must inject no document context.
   - `/api/ask` with `documentId` must answer from scoped document when facts exist.

4. **Sparse/OCR handling tests**
   - extraction failure -> 422
   - sparse text <20 -> 422

5. **Quota consistency tests**
   - verify `/api/ask` vs `/api/ask-document` intended quota behavior.

6. **Workspace state derivation tests**
   - state transitions for empty/documents_only/analyzed_no_questions/active_attention/active_case.

