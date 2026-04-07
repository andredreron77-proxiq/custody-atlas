import { expect, type Page } from '@playwright/test';
import type { QaCredentials } from '../fixtures/env';

export async function loginWithEmail(page: Page, credentials: QaCredentials): Promise<void> {
  await page.goto('/');
  await page.getByTestId('button-login').click();
  await page.getByTestId('input-email').fill(credentials.email);
  await page.getByTestId('input-password').fill(credentials.password);
  await page.getByTestId('button-submit-auth').click();

  await expect(page.getByTestId('button-user-menu')).toBeVisible();
}
