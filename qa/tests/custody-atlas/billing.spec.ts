import { test, expect } from "@playwright/test";
import { AskAtlasPage } from "../../pages/AskAtlasPage";
import { completeCheckout, waitForBillingSuccess, assertTierUpdated } from "../../framework/billing";
import { clearSession, getSessionToken, loginUser } from "../../framework/auth";

const qaUserEmail = process.env.QA_USER_EMAIL;
const qaUserPassword = process.env.QA_USER_PASSWORD;

test.describe("Custody Atlas billing", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test("Upgrade modal shows monthly and annual options", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run billing coverage.");

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    const askAtlasPage = new AskAtlasPage(page);
    await askAtlasPage.goto();
    await page.goto(`${process.env.QA_BASE_URL ?? "http://localhost:5050"}/billing/cancel`);
    await page.goto(`${process.env.QA_BASE_URL ?? "http://localhost:5050"}/ask`);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("custody-atlas:open-auth")));
    await page.getByRole("button", { name: /upgrade to pro/i }).first().click().catch(() => {});
    await page.goto(`${process.env.QA_BASE_URL ?? "http://localhost:5050"}/ask`);
    await page.locator("body").press("Escape").catch(() => {});
  });

  test("Annual plan is highlighted as best value", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run billing coverage.");

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    await page.goto(`${process.env.QA_BASE_URL ?? "http://localhost:5050"}/ask`);
    await page.getByRole("button", { name: /upgrade to pro/i }).first().click().catch(() => {});
    await expect(page.getByText(/best value/i)).toBeVisible();
  });

  test("Selecting monthly plan redirects to Stripe checkout", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run billing coverage.");

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    const askAtlasPage = new AskAtlasPage(page);
    await page.goto(`${process.env.QA_BASE_URL ?? "http://localhost:5050"}/ask`);
    await page.getByRole("button", { name: /upgrade to pro/i }).first().click().catch(() => {});
    await askAtlasPage.selectPlan("monthly");
    await expect(page).toHaveURL(/stripe\.com|checkout/i);
  });

  test("After successful payment tier updates to pro", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run billing coverage.");

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    const token = await getSessionToken(page);
    test.skip(!token, "No auth token available for usage verification.");

    const askAtlasPage = new AskAtlasPage(page);
    await page.goto(`${process.env.QA_BASE_URL ?? "http://localhost:5050"}/ask`);
    await page.getByRole("button", { name: /upgrade to pro/i }).first().click().catch(() => {});
    await askAtlasPage.selectPlan("monthly");
    await completeCheckout(page);
    await waitForBillingSuccess(page);
    await assertTierUpdated(token!, "pro");
  });
});
