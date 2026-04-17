import { test, expect } from "@playwright/test";
import { AuthPage } from "../../pages/AuthPage";
import { clearSession, getSessionToken, loginUser, logoutUser } from "../../framework/auth";

const qaUserEmail = process.env.QA_USER_EMAIL;
const qaUserPassword = process.env.QA_USER_PASSWORD;

test.describe("Custody Atlas auth", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test("User can log in with valid credentials", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run auth coverage.");

    const authPage = new AuthPage(page);
    await authPage.login(qaUserEmail!, qaUserPassword!);
    await expect(page.getByTestId("button-user-menu")).toBeVisible();
  });

  test("User sees error with invalid credentials", async ({ page }) => {
    const authPage = new AuthPage(page);
    await authPage.gotoLogin();
    await page.getByTestId("input-email").fill("invalid@example.com");
    await page.getByTestId("input-password").fill("not-the-right-password");
    await page.getByTestId("button-submit-auth").click();
    await expect(page.getByTestId("text-auth-error")).toBeVisible();
  });

  test("User can log out", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run auth coverage.");

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    await logoutUser(page);
  });

  test("Session persists on page refresh", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run auth coverage.");

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    const tokenBeforeReload = await getSessionToken(page);
    await page.reload();
    await expect(page.getByTestId("button-user-menu")).toBeVisible();
    const tokenAfterReload = await getSessionToken(page);
    expect(tokenBeforeReload).toBeTruthy();
    expect(tokenAfterReload).toBeTruthy();
  });
});
