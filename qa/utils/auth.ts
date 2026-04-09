import { expect, type Page } from '@playwright/test';
import type { QaCredentials } from '../fixtures/env';
import { qaEnv } from '../fixtures/env';

export async function loginWithEmail(page: Page, credentials: QaCredentials): Promise<void> {
  await page.goto('/');
  await page.getByTestId('button-login').click();
  await page.getByTestId('input-email').fill(credentials.email);
  await page.getByTestId('input-password').fill(credentials.password);
  await page.getByTestId('button-submit-auth').click();

  await expect(page.getByTestId('button-user-menu')).toBeVisible();
}

export async function resetFreshUserOnboardingState(email: string): Promise<void> {
  if (!qaEnv.resetToken) {
    throw new Error('Missing QA_RESET_TOKEN. Cannot reset fresh-user onboarding state.');
  }

  const response = await fetch(`${qaEnv.baseUrl}/api/qa/reset-onboarding-user`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-qa-reset-token': qaEnv.resetToken,
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Fresh-user reset failed (${response.status} ${response.statusText})${body ? `: ${body}` : ''}`,
    );
  }
}
