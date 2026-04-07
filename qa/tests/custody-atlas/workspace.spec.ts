import { test } from '@playwright/test';
import { qaEnv, getDefaultUserCredentials } from '../../fixtures/env';
import { qaProduct } from '../../fixtures/product';
import { loginWithEmail } from '../../utils/auth';
import { expectStablePage } from '../../utils/assertions';

test.describe('Custody Atlas workspace', () => {
  test('workspace page loads as a smoke test', async ({ page }) => {
    test.skip(!qaEnv.defaultUser.email || !qaEnv.defaultUser.password, 'Set QA_USER_EMAIL and QA_USER_PASSWORD.');

    await loginWithEmail(page, getDefaultUserCredentials());
    await page.goto(qaProduct.routes.workspace);

    await expectStablePage(page, qaProduct.testIds.pageWorkspace);
  });
});
