import { test } from '@playwright/test';
import { getDefaultUserCredentials, getMissingDefaultUserEnvVars } from '../../fixtures/env';
import { qaProduct } from '../../fixtures/product';
import { loginWithEmail } from '../../utils/auth';
import { expectStablePage } from '../../utils/assertions';

test.describe('Custody Atlas workspace', () => {
  test('workspace page loads as a smoke test', async ({ page }) => {
    const missingDefaultUserVars = getMissingDefaultUserEnvVars();
    test.skip(
      missingDefaultUserVars.length > 0,
      `Missing ${missingDefaultUserVars.join(', ')} in .env.qa; skipping authenticated QA flow.`,
    );

    await loginWithEmail(page, getDefaultUserCredentials());
    await page.goto(qaProduct.routes.workspace);

    await expectStablePage(page, qaProduct.testIds.pageWorkspace);
  });
});
