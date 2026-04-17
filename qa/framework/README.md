# QA Framework

This folder contains a reusable Playwright framework layer designed for Supabase + Express + React SaaS products, with Custody Atlas page objects and test suites built on top of it.

## How to copy this to a new project

1. Copy `qa/framework/` into the new repo.
2. Keep the generic framework files:
   - `auth.ts`
   - `api.ts`
   - `assertions.ts`
   - `BasePage.ts`
   - `billing.ts`
   - `index.ts`
3. Replace `qa/pages/` with page objects for the new product.
4. Replace or extend `qa/tests/` with product-specific suites.
5. Update selectors in the page objects first, then update the tests.

## Required environment variables

- `QA_BASE_URL`
  Default: `http://localhost:5050`
- `QA_USER_EMAIL`
- `QA_USER_PASSWORD`
- `QA_FRESH_USER_EMAIL`
- `QA_FRESH_USER_PASSWORD`
- `QA_RESET_TOKEN`

Optional billing/runtime variables used by the product under test:

- Stripe test credentials handled by the checkout page
- Any app-specific env vars already required by the server

## How to add new page objects

1. Create a new file in `qa/pages/`.
2. Extend `BasePage`.
3. Encapsulate selectors and user flows as methods, not raw test code.
4. Keep page objects product-specific and keep `qa/framework/` generic.

Example shape:

```ts
import { BasePage } from "../framework/BasePage";

export class ExamplePage extends BasePage {
  async goto() {
    await super.goto("/example");
  }
}
```

## How to run tests locally

Install dependencies:

```bash
npm install
npx playwright install chromium
```

Run the full QA suite:

```bash
npm run qa:all
```

Useful focused commands:

```bash
npm run qa:test
npm run qa:test:headed
npm run qa:test:debug
```

## How to add to CI

The included GitHub Actions workflow lives at:

- `.github/workflows/playwright.yml`

It expects these GitHub Secrets:

- `QA_USER_EMAIL`
- `QA_USER_PASSWORD`
- `QA_FRESH_USER_EMAIL`
- `QA_FRESH_USER_PASSWORD`
- `QA_RESET_TOKEN`
- `QA_BASE_URL`

On failure, configure the workflow to upload:

- `playwright-report/`
- `test-results/`
- `qa/screenshots/`

## Notes

- Keep the framework layer stateless and reusable.
- Put app-specific logic in page objects or fixtures.
- Prefer API seeding for setup and UI verification for outcomes.
