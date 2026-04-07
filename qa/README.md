# QA Foundation (Playwright)

Minimal reusable QA foundation for browser-based regression checks.

## Folder layout

- `qa/tests/custody-atlas/` — product-specific Custody Atlas flows.
- `qa/utils/` — reusable helpers (auth, screenshots, assertions).
- `qa/fixtures/` — env-driven test data wiring.
- `qa/artifacts/` — captured screenshots.

## Command flow

### 1) Install dependencies

```bash
npm install
npm install -D @playwright/test
```

### 2) Install browser binaries

```bash
npx playwright install chromium
```

### 3) Set QA environment variables

```bash
export QA_BASE_URL=http://127.0.0.1:5000
export QA_USER_EMAIL=<returning-user-email>
export QA_USER_PASSWORD=<returning-user-password>
export QA_FRESH_USER_EMAIL=<fresh-user-email>
export QA_FRESH_USER_PASSWORD=<fresh-user-password>
export QA_FRESH_USER_PREFERRED_NAME=Taylor
export QA_CASE_ID=<existing-case-id>
```

### 4) Run tests

```bash
npm run qa:test
```

Optional:

```bash
npm run qa:test:headed
npm run qa:test:debug
```

### 5) Open the Playwright HTML report

```bash
npx playwright show-report
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
