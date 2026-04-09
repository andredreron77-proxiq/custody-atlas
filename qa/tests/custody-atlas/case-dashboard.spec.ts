import { test, expect } from '@playwright/test';
import { qaEnv, getDefaultUserCredentials, getMissingDefaultUserEnvVars } from '../../fixtures/env';
import { qaProduct } from '../../fixtures/product';
import { loginWithEmail } from '../../utils/auth';
import { captureQaScreenshot } from '../../utils/screenshot';
import { expectStablePage } from '../../utils/assertions';

test.describe('Custody Atlas case dashboard intelligence', () => {
  test('shows core intelligence sections and captures a screenshot', async ({ page }) => {
    const missingDefaultUserVars = getMissingDefaultUserEnvVars();
    test.skip(
      missingDefaultUserVars.length > 0,
      `Missing ${missingDefaultUserVars.join(', ')} in .env.qa; skipping authenticated QA flow.`,
    );
    test.skip(!qaEnv.caseId, 'Set QA_CASE_ID to validate a specific case dashboard.');

    await loginWithEmail(page, getDefaultUserCredentials());
    await page.goto(qaProduct.routes.caseDashboard(qaEnv.caseId));

    await expectStablePage(page, qaProduct.testIds.pageCaseDashboard);
    await expect(page.getByTestId(qaProduct.testIds.sectionWhatMattersNow)).toBeVisible();
    await expect(page.getByTestId(qaProduct.testIds.sectionTopRisks)).toBeVisible();
    await expect(page.getByTestId(qaProduct.testIds.sectionRecommendedActions)).toBeVisible();
    await expect(page.getByTestId(qaProduct.testIds.sectionKeyDates)).toBeVisible();

    const screenshotPath = await captureQaScreenshot(page, `case-dashboard-${qaEnv.caseId}`);
    await expect(page.getByTestId(qaProduct.testIds.sectionWhatMattersNow)).toBeVisible();
    test.info().annotations.push({ type: 'screenshot', description: screenshotPath });
  });
});
