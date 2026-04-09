# QA Foundation (Playwright)

Minimal reusable QA foundation for browser-based regression checks.

## Folder layout

- `qa/tests/custody-atlas/` — product-specific Custody Atlas flows.
- `qa/utils/` — reusable helpers (auth, screenshots, assertions).
- `qa/fixtures/` — env-driven test data wiring.
- `qa/artifacts/` — captured screenshots.

## One-time local setup

### 1) Install dependencies

```bash
npm install
npm install -D @playwright/test
```

### 2) Install browser binaries

```bash
npx playwright install chromium
```

### 3) Create root env files

Create these in the repository root (not inside `qa/`):

`.env.local` (used by the local app server)

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

`.env.qa` (used by Playwright)

```bash
QA_BASE_URL=http://127.0.0.1:5050
QA_USER_EMAIL=returning-user@example.com
QA_USER_PASSWORD=replace-with-password
QA_FRESH_USER_EMAIL=fresh-user@example.com
QA_FRESH_USER_PASSWORD=replace-with-password
QA_FRESH_USER_PREFERRED_NAME=Taylor
QA_CASE_ID=replace-with-existing-case-id
```

No repeated `export ...` commands are required once files are in place.

## QA commands

Run targeted suites:

```bash
npm run qa:workspace
npm run qa:onboarding
npm run qa:dashboard
npm run qa:all
```

Open the report:

```bash
npm run qa:report
```

## Combined flow (common local loop)

Start app, wait for `http://127.0.0.1:5050`, run workspace QA:

```bash
npm run qa:workspace:local
```

## Covered MVP flows

- Sign in flow
- Preferred name onboarding flow
- Workspace load smoke
- Case dashboard intelligence sections
  - What Matters Now
  - Top Risks
  - Recommended Actions
  - Key Dates
- Screenshot capture for case dashboard
