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

test.describe('Custody Atlas auth + onboarding', () => {
async function dismissWelcomeModalIfVisible(page: Page) {
  const modal = page.getByTestId(qaProduct.testIds.onboardingModal);
  const skipButton = page.getByTestId(qaProduct.testIds.onboardingSkipButton);

  await page.waitForTimeout(500);

  const visible = await modal.isVisible().catch(() => false);
  if (!visible) return;

  await skipButton.click();
  await expect(modal).toBeHidden({ timeout: 5000 });
}

  test('sign in flow authenticates a returning user', async ({ page }) => {
    const missingDefaultUserVars = getMissingDefaultUserEnvVars();
    test.skip(
      missingDefaultUserVars.length > 0,
      `Missing ${missingDefaultUserVars.join(', ')} in .env.qa; skipping authenticated QA flow.`,
    );

    await loginWithEmail(page, getDefaultUserCredentials());
    await page.goto(qaProduct.routes.workspace);
    await expect(
      page.getByText(/general workspace/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('preferred name onboarding flow saves preferred name for a fresh user', async ({ page }) => {
  test.skip(
    !qaEnv.freshUser.email || !qaEnv.freshUser.password,
    'Set QA_FRESH_USER_EMAIL and QA_FRESH_USER_PASSWORD for onboarding coverage.',
  );

  await resetFreshUserOnboardingState(qaEnv.freshUser.email);

  const freshCreds = getFreshUserCredentials();
  await loginWithEmail(page, freshCreds);

// STEP 1: Handle onboarding modal FIRST
const modal = page.getByTestId(qaProduct.testIds.onboardingModal);
const skipButton = page.getByTestId(qaProduct.testIds.onboardingSkipButton);
const preferredNamePrompt = page.getByTestId(qaProduct.testIds.preferredNamePrompt);

// Wait until either modal OR onboarding prompt is visible
await Promise.race([
  modal.waitFor({ state: 'visible' }).catch(() => {}),
  preferredNamePrompt.waitFor({ state: 'visible' }),
]);

// If modal is visible → dismiss it
if (await modal.isVisible().catch(() => false)) {
  await skipButton.click();
  await expect(modal).toBeHidden({ timeout: 5000 });
}

// STEP 2: Now interact with preferred name
const preferredNameInput = page.getByTestId(qaProduct.testIds.preferredNameInput);
const continueButton = page.getByTestId(qaProduct.testIds.preferredNameSaveButton);

await expect(preferredNamePrompt).toBeVisible();
await expect(preferredNameInput).toBeVisible();
await expect(preferredNameInput).toBeEditable();

// Now safe to interact
await preferredNameInput.click();
await preferredNameInput.fill('');
await preferredNameInput.type(qaEnv.freshUser.preferredName);

// Validate
await expect(preferredNameInput).toHaveValue(qaEnv.freshUser.preferredName);
await expect(continueButton).toBeEnabled();

// Submit
await continueButton.click({ force: true });

  await dismissWelcomeModalIfVisible(page);

  await expect(
    page.getByText(/general workspace/i).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(qaProduct.testIds.headerDisplayName)).toContainText(
    qaEnv.freshUser.preferredName,
  );
});
});
