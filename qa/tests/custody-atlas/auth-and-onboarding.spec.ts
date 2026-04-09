import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  qaEnv,
  getDefaultUserCredentials,
  getFreshUserCredentials,
  getMissingDefaultUserEnvVars,
  getMissingFreshUserEnvVars,
  getMissingFreshUserResetEnvVars,
} from '../../fixtures/env';
import { qaProduct } from '../../fixtures/product';
import { loginWithEmail, resetFreshUserOnboardingState } from '../../utils/auth';
import { expectStablePage } from '../../utils/assertions';

test.describe('Custody Atlas auth + onboarding', () => {
  async function dismissWelcomeModalIfVisible(page: Page) {
    const welcomeModal = page.getByTestId(qaProduct.testIds.onboardingModal);
    if (await welcomeModal.isVisible()) {
      await expect(welcomeModal).toBeVisible();
      await page.getByTestId(qaProduct.testIds.onboardingSkipButton).click();
      await expect(welcomeModal).toBeHidden();
    }
  }

  test('sign in flow authenticates a returning user', async ({ page }) => {
    const missingDefaultUserVars = getMissingDefaultUserEnvVars();
    test.skip(
      missingDefaultUserVars.length > 0,
      `Missing ${missingDefaultUserVars.join(', ')} in .env.qa; skipping authenticated QA flow.`,
    );

    await loginWithEmail(page, getDefaultUserCredentials());
    await page.goto(qaProduct.routes.workspace);
    await expectStablePage(page, qaProduct.testIds.pageWorkspace);
  });

  test('preferred name onboarding flow saves preferred name for a fresh user', async ({ page }) => {
    const missingFreshUserVars = getMissingFreshUserEnvVars();
    const missingFreshUserResetVars = getMissingFreshUserResetEnvVars();
    test.skip(
      missingFreshUserVars.length > 0 || missingFreshUserResetVars.length > 0,
      `Missing ${[...new Set([...missingFreshUserVars, ...missingFreshUserResetVars])].join(', ')} in .env.qa; skipping onboarding coverage.`,
    );

    const freshCreds = getFreshUserCredentials();
    await resetFreshUserOnboardingState(freshCreds.email);
    await loginWithEmail(page, freshCreds);

    await dismissWelcomeModalIfVisible(page);

    await expect(page.getByTestId(qaProduct.testIds.preferredNamePrompt)).toBeVisible();
    await page.getByTestId(qaProduct.testIds.preferredNameInput).fill(qaEnv.freshUser.preferredName);
    await dismissWelcomeModalIfVisible(page);
    await page.getByTestId(qaProduct.testIds.preferredNameSaveButton).click();

    await dismissWelcomeModalIfVisible(page);
    await expectStablePage(page, qaProduct.testIds.pageWorkspace);
    await expect(page.getByTestId(qaProduct.testIds.headerDisplayName)).toHaveText(
      `${qaEnv.freshUser.preferredName}'s Workspace`,
    );
  });
});
