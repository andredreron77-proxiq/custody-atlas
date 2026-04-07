import { test } from '@playwright/test';
import { qaEnv, getDefaultUserCredentials } from '../../fixtures/env';
import { loginWithEmail } from '../../utils/auth';
import { expectStablePage, expectVisibleHeading } from '../../utils/assertions';

test.describe('Custody Atlas workspace', () => {
  test('workspace page loads as a smoke test', async ({ page }) => {
    test.skip(!qaEnv.defaultUser.email || !qaEnv.defaultUser.password, 'Set QA_USER_EMAIL and QA_USER_PASSWORD.');

    await loginWithEmail(page, getDefaultUserCredentials());
    await page.goto('/workspace');

    await expectStablePage(page, 'page-workspace');
    await expectVisibleHeading(page, /workspace/i);
  });
});
