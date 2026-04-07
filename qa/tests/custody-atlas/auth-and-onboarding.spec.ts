import { test, expect } from '@playwright/test';
import { qaEnv, getDefaultUserCredentials, getFreshUserCredentials } from '../../fixtures/env';
import { loginWithEmail } from '../../utils/auth';
import { expectStablePage } from '../../utils/assertions';

test.describe('Custody Atlas auth + onboarding', () => {
  test('sign in flow authenticates a returning user', async ({ page }) => {
    test.skip(!qaEnv.defaultUser.email || !qaEnv.defaultUser.password, 'Set QA_USER_EMAIL and QA_USER_PASSWORD.');

    await loginWithEmail(page, getDefaultUserCredentials());
    await page.goto('/workspace');
    await expectStablePage(page, 'page-workspace');
  });

  test('preferred name onboarding flow saves preferred name for a fresh user', async ({ page }) => {
    test.skip(
      !qaEnv.freshUser.email || !qaEnv.freshUser.password,
      'Set QA_FRESH_USER_EMAIL and QA_FRESH_USER_PASSWORD for onboarding coverage.',
    );

    const freshCreds = getFreshUserCredentials();
    await loginWithEmail(page, freshCreds);

    await expect(page.getByRole('heading', { name: 'What should we call you?' })).toBeVisible();
    await page.getByTestId('input-display-name').fill(qaEnv.freshUser.preferredName);
    await page.getByTestId('button-continue-display-name').click();

    await expectStablePage(page, 'page-workspace');
    await expect(page.getByText(new RegExp(`${qaEnv.freshUser.preferredName}\\'s Workspace`, 'i'))).toBeVisible();
  });
});
