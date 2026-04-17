import { expect, type Page } from "@playwright/test";
import { getUsageState } from "./api";

export async function fillTestCard(page: Page): Promise<void> {
  const cardFrame = page
    .frameLocator('iframe[name^="__privateStripeFrame"]')
    .first();

  await cardFrame.locator('input[name="cardnumber"]').fill("4242424242424242");
  await cardFrame.locator('input[name="exp-date"]').fill("1234");
  await cardFrame.locator('input[name="cvc"]').fill("123");

  const postalCode = cardFrame.locator('input[name="postal"], input[name="postalCode"]');
  if (await postalCode.count()) {
    await postalCode.first().fill("30303");
  }
}

export async function completeCheckout(page: Page): Promise<void> {
  await fillTestCard(page);
  await page.getByRole("button", { name: /pay|subscribe|start subscription|complete/i }).click();
}

export async function waitForBillingSuccess(page: Page): Promise<void> {
  await page.waitForURL(/\/billing\/success/);
  await expect(page.getByRole("heading", { name: /you're now on pro/i })).toBeVisible();
}

export async function assertTierUpdated(token: string, expectedTier: string): Promise<void> {
  await expect
    .poll(async () => {
      const usage = await getUsageState<{ tier?: string }>(token);
      return usage.tier;
    }, {
      message: `Expected usage tier to become "${expectedTier}".`,
      timeout: 30_000,
    })
    .toBe(expectedTier);
}
