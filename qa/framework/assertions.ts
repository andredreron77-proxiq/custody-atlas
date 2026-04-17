import { expect, type Page } from "@playwright/test";

export async function waitForToast(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text, { exact: false })).toBeVisible();
}

export async function waitForNavigation(page: Page, urlPattern: string | RegExp): Promise<void> {
  await page.waitForURL(urlPattern);
}

export async function assertElementVisible(
  page: Page,
  selector: string,
  timeout = 10_000,
): Promise<void> {
  const locator = page.locator(selector);
  await expect(locator, `Expected element "${selector}" to be visible.`).toBeVisible({ timeout });
}

export async function assertTextContains(
  page: Page,
  selector: string,
  text: string,
): Promise<void> {
  const locator = page.locator(selector);
  await expect(locator, `Expected "${selector}" to contain "${text}".`).toContainText(text);
}

export async function assertNetworkResponse(
  page: Page,
  urlPattern: string | RegExp,
  expectedStatus: number,
): Promise<void> {
  const response = await page.waitForResponse((candidate) => {
    const url = candidate.url();
    return typeof urlPattern === "string" ? url.includes(urlPattern) : urlPattern.test(url);
  });

  expect(
    response.status(),
    `Expected network response for ${String(urlPattern)} to have status ${expectedStatus}.`,
  ).toBe(expectedStatus);
}
