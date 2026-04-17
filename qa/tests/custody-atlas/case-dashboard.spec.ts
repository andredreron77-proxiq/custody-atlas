import { test, expect } from '@playwright/test';
import { qaEnv, getDefaultUserCredentials, getMissingDefaultUserEnvVars } from '../../fixtures/env';
import { qaProduct } from '../../fixtures/product';
import { loginWithEmail } from '../../utils/auth';
import { loginUser } from '../../framework/auth';
import { captureQaScreenshot } from '../../utils/screenshot';

test.describe('Custody Atlas case dashboard intelligence', () => {
  test('shows core intelligence sections and captures a screenshot', async ({ page }) => {
    const missingDefaultUserVars = getMissingDefaultUserEnvVars();
    test.skip(
      missingDefaultUserVars.length > 0,
      `Missing ${missingDefaultUserVars.join(', ')} in .env.qa; skipping authenticated QA flow.`,
    );
    test.skip(!qaEnv.caseId, 'Set QA_CASE_ID to validate a specific case dashboard.');

    await loginUser(page, process.env.QA_USER_EMAIL!, process.env.QA_USER_PASSWORD!);
    await page.goto(qaProduct.routes.caseDashboard(qaEnv.caseId));

    await expect(
      page.getByText(/what matters now/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(qaProduct.testIds.onboardingModal)).toBeHidden();
    await expect(page.getByText(/ask my first question/i)).toHaveCount(0);
    await expect(page.getByTestId(qaProduct.testIds.sectionTopRisks)).toBeVisible();
    await expect(page.getByTestId(qaProduct.testIds.sectionRecommendedActions)).toBeVisible();
    await expect(page.getByTestId(qaProduct.testIds.sectionKeyDates)).toBeVisible();

    const screenshotPath = await captureQaScreenshot(page, `case-dashboard-${qaEnv.caseId}`);
    await expect(
      page.getByText(/what matters now/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    test.info().annotations.push({ type: 'screenshot', description: screenshotPath });
  });
});
