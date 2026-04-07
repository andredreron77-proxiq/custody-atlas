# QA Foundation (Playwright)

Minimal reusable QA foundation for browser-based regression checks.

## Folder layout

- `qa/tests/custody-atlas/` — product-specific Custody Atlas flows.
- `qa/utils/` — reusable helpers (auth, screenshots, assertions).
- `qa/fixtures/` — env-driven test data wiring.
- `qa/artifacts/` — captured screenshots.

## Setup

1. Install Playwright test tooling:
   ```bash
   npm install -D @playwright/test
   npx playwright install chromium
   ```
2. Set environment variables:
   ```bash
   QA_BASE_URL=http://127.0.0.1:5000
   QA_USER_EMAIL=<returning-user-email>
   QA_USER_PASSWORD=<returning-user-password>
   QA_FRESH_USER_EMAIL=<fresh-user-email>
   QA_FRESH_USER_PASSWORD=<fresh-user-password>
   QA_FRESH_USER_PREFERRED_NAME=Taylor
   QA_CASE_ID=<existing-case-id>
   ```

## Run

```bash
npm run qa:test
```

Optional:

```bash
npm run qa:test:headed
npm run qa:test:debug
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
