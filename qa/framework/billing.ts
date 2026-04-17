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
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });

  const testCardBtn = page.getByText(/use test card|test card/i);
  if (await testCardBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await testCardBtn.click();
  } else {
    const cardFrame = page.frameLocator(
      'iframe[name^="__privateStripeFrame"]',
    ).first();

    await cardFrame
      .locator('[placeholder*="1234"], input[autocomplete*="cc-number"]')
      .fill("4242424242424242", { timeout: 10_000 });
    await cardFrame
      .locator('[placeholder*="MM"], input[autocomplete*="cc-exp"]')
      .fill("12/34");
    await cardFrame
      .locator('[placeholder*="CVC"], input[autocomplete*="cc-csc"]')
      .fill("123");
  }

  const payBtn = page.getByRole("button", {
    name: /pay|subscribe|confirm/i,
  }).first();
  await payBtn.click({ timeout: 15_000 });
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
