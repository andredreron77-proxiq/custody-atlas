import { test, expect } from '@playwright/test';
import { qaEnv, getDefaultUserCredentials } from '../../fixtures/env';
import { loginWithEmail } from '../../utils/auth';
import { captureQaScreenshot } from '../../utils/screenshot';
import { expectStablePage, expectVisibleHeading } from '../../utils/assertions';

test.describe('Custody Atlas case dashboard intelligence', () => {
  test('shows core intelligence sections and captures a screenshot', async ({ page }) => {
    test.skip(!qaEnv.defaultUser.email || !qaEnv.defaultUser.password, 'Set QA_USER_EMAIL and QA_USER_PASSWORD.');
    test.skip(!qaEnv.caseId, 'Set QA_CASE_ID to validate a specific case dashboard.');

    await loginWithEmail(page, getDefaultUserCredentials());
    await page.goto(`/case/${qaEnv.caseId}`);

    await expectStablePage(page, 'page-case-dashboard');
    await expectVisibleHeading(page, 'What Matters Now');
    await expectVisibleHeading(page, 'Top Risks');
    await expectVisibleHeading(page, 'Recommended Actions');
    await expectVisibleHeading(page, 'Key Dates');

    const screenshotPath = await captureQaScreenshot(page, `case-dashboard-${qaEnv.caseId}`);
    await expect(page.getByRole('heading', { name: 'What Matters Now' })).toBeVisible();
    test.info().annotations.push({ type: 'screenshot', description: screenshotPath });
  });
});
