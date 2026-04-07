import { test, expect } from '@playwright/test';
import { qaEnv, getDefaultUserCredentials, getFreshUserCredentials } from '../../fixtures/env';
import { qaProduct } from '../../fixtures/product';
import { loginWithEmail } from '../../utils/auth';
import { expectStablePage } from '../../utils/assertions';

test.describe('Custody Atlas auth + onboarding', () => {
  test('sign in flow authenticates a returning user', async ({ page }) => {
    test.skip(!qaEnv.defaultUser.email || !qaEnv.defaultUser.password, 'Set QA_USER_EMAIL and QA_USER_PASSWORD.');

    await loginWithEmail(page, getDefaultUserCredentials());
    await page.goto(qaProduct.routes.workspace);
    await expectStablePage(page, qaProduct.testIds.pageWorkspace);
  });

  test('preferred name onboarding flow saves preferred name for a fresh user', async ({ page }) => {
    test.skip(
      !qaEnv.freshUser.email || !qaEnv.freshUser.password,
      'Set QA_FRESH_USER_EMAIL and QA_FRESH_USER_PASSWORD for onboarding coverage.',
    );

    const freshCreds = getFreshUserCredentials();
    await loginWithEmail(page, freshCreds);

    await expect(page.getByTestId(qaProduct.testIds.preferredNamePrompt)).toBeVisible();
    await page.getByTestId(qaProduct.testIds.preferredNameInput).fill(qaEnv.freshUser.preferredName);
    await page.getByTestId(qaProduct.testIds.preferredNameSaveButton).click();

    await expectStablePage(page, qaProduct.testIds.pageWorkspace);
    await expect(page.getByTestId(qaProduct.testIds.headerDisplayName)).toHaveText(
      `${qaEnv.freshUser.preferredName}'s Workspace`,
    );
  });
});
