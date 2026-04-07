import { expect, type Locator, type Page } from '@playwright/test';

export async function expectVisibleHeading(page: Page, headingText: string | RegExp): Promise<void> {
  await expect(page.getByRole('heading', { name: headingText })).toBeVisible();
}

export async function expectStablePage(page: Page, pageTestId: string, extraVisible?: Locator): Promise<void> {
  await expect(page.getByTestId(pageTestId)).toBeVisible();
  await expect(page.getByText(/loading/i)).toHaveCount(0);
  if (extraVisible) {
    await expect(extraVisible).toBeVisible();
  }
}
