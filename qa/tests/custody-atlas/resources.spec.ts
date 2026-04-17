import { test, expect } from "@playwright/test";
import { ResourcesPage } from "../../pages/ResourcesPage";
import { clearSession, loginUser } from "../../framework/auth";

const qaUserEmail = process.env.QA_USER_EMAIL;
const qaUserPassword = process.env.QA_USER_PASSWORD;

test.describe("Custody Atlas resources", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run resource coverage.");

    await clearSession(page);
    await loginUser(page, qaUserEmail!, qaUserPassword!);
    await page.goto(`${process.env.QA_BASE_URL ?? "http://localhost:5050"}/ask?state=Georgia&county=Fulton`);
    await page.waitForLoadState("networkidle");
  });

  test("Resources page loads with all 5 categories", async ({ page }) => {
    const resourcesPage = new ResourcesPage(page);
    await resourcesPage.goto();
    await resourcesPage.assertCategoriesVisible();
  });

  test("Legal Aid section renders", async ({ page }) => {
    const resourcesPage = new ResourcesPage(page);
    await resourcesPage.goto();
    await expect(page.getByText(/free legal help/i)).toBeVisible();
  });

  test("Government Resources section renders", async ({ page }) => {
    const resourcesPage = new ResourcesPage(page);
    await resourcesPage.goto();
    await expect(page.getByText(/government and state programs/i)).toBeVisible();
  });

  test("Attorney Portal shows \"Coming soon\"", async ({ page }) => {
    const resourcesPage = new ResourcesPage(page);
    await resourcesPage.goto();
    await expect(page.getByText(/coming soon/i)).toBeVisible();
  });

  test("Waitlist join shows success state when logged in", async ({ page }) => {
    const resourcesPage = new ResourcesPage(page);
    await resourcesPage.goto();
    await resourcesPage.joinWaitlist();
    await resourcesPage.assertWaitlistSuccess();
  });

  test("Resources route requires sign in when logged out", async ({ page }) => {
    await clearSession(page);
    await page.goto(`${process.env.QA_BASE_URL ?? "http://localhost:5050"}/resources`);
    await expect(page.getByTestId("button-sign-in-gate")).toBeVisible();
  });
});
