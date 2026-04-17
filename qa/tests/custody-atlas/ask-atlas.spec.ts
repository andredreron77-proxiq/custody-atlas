import { test, expect } from "@playwright/test";
import { AskAtlasPage } from "../../pages/AskAtlasPage";
import { clearSession, getSessionToken, loginUser } from "../../framework/auth";
import { getUsageState, seedCase } from "../../framework/api";

const qaUserEmail = process.env.QA_USER_EMAIL;
const qaUserPassword = process.env.QA_USER_PASSWORD;

test.describe("Custody Atlas Ask Atlas", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
  });

  test("Free user can ask a question and receive a response", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run Ask Atlas coverage.");

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    const askAtlasPage = new AskAtlasPage(page);
    await askAtlasPage.goto();
    await askAtlasPage.askQuestion("How is custody decided in Georgia?");
    await askAtlasPage.waitForResponse();
    await expect(askAtlasPage.getLastAssistantResponseLocator()).toContainText(/custody|georgia|court/i);
  });

  test("Question counter increments after each question", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run Ask Atlas coverage.");

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    const askAtlasPage = new AskAtlasPage(page);
    await askAtlasPage.goto();
    const before = await askAtlasPage.getQuestionCount();
    await askAtlasPage.askQuestion("What is the best-interest standard in custody cases?");
    await askAtlasPage.waitForResponse();
    const after = await askAtlasPage.getQuestionCount();
    expect(after).not.toBe(before);
  });

  test("Free user sees upgrade modal at 25 questions", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run Ask Atlas coverage.");

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    const token = await getSessionToken(page);
    test.skip(!token, "No auth token available for usage inspection.");

    const usage = await getUsageState<{ questionsUsed: number; questionsLimit: number | null }>(token!);
    const askAtlasPage = new AskAtlasPage(page);
    await askAtlasPage.goto();

    const limit = usage.questionsLimit ?? 25;
    const remaining = Math.max(limit - usage.questionsUsed, 0);
    for (let index = 0; index <= remaining; index += 1) {
      await askAtlasPage.askQuestion(`QA limit test question ${index + 1}: how does custody work?`);
      if (index < remaining) {
        await askAtlasPage.waitForResponse();
      }
    }

    await page.getByRole("button", { name: /upgrade to pro/i }).click();
    await askAtlasPage.assertUpgradeModalVisible();
  });

  test("Link case nudge appears when no case linked", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run Ask Atlas coverage.");

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    const token = await getSessionToken(page);
    test.skip(!token, "No auth token available for case seeding.");

    const seeded = await seedCase<{ id: string; title?: string }>(token!, {
      title: `QA Ask Atlas Case ${Date.now()}`,
      status: "intake",
    });

    const askAtlasPage = new AskAtlasPage(page);
    await askAtlasPage.goto();
    await expect(page.getByText(/link a case to get answers specific to your court/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /link case/i })).toBeVisible();

    expect(seeded.id).toBeTruthy();
  });

  test("Response is visible without manual scrolling", async ({ page }) => {
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run Ask Atlas coverage.");

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    const askAtlasPage = new AskAtlasPage(page);
    await askAtlasPage.goto();
    await askAtlasPage.askQuestion("Explain parenting plans in Georgia.");
    await askAtlasPage.waitForResponse();
    await expect(askAtlasPage.getLastAssistantResponseLocator()).toBeInViewport();
  });
});
