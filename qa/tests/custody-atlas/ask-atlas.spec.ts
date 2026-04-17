import { test, expect } from "@playwright/test";
import { AskAtlasPage } from "../../pages/AskAtlasPage";
import { clearSession, getSessionToken, loginUser } from "../../framework/auth";
import { seedCase } from "../../framework/api";

const qaUserEmail = process.env.QA_USER_EMAIL;
const qaUserPassword = process.env.QA_USER_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function currentBillingPeriod(): string {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().split("T")[0];
}

function decodeUserIdFromToken(token: string): string {
  const [, payload] = token.split(".");
  if (!payload) {
    throw new Error("Could not decode auth token payload.");
  }

  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const json = JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as { sub?: string };
  if (!json.sub) {
    throw new Error("JWT payload does not include user id.");
  }
  return json.sub;
}

async function resetMonthlyQuestionUsage(token: string): Promise<void> {
  return setMonthlyQuestionUsage(token, 0);
}

async function setMonthlyQuestionUsage(token: string, questionsUsed: number): Promise<void> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for Ask Atlas QA setup.");
  }

  const userId = decodeUserIdFromToken(token);
  const billingPeriod = currentBillingPeriod();
  const response = await fetch(
    `${supabaseUrl}/rest/v1/usage_limits?user_id=eq.${userId}&billing_period=eq.${billingPeriod}`,
    {
      method: "PATCH",
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ questions_used: questionsUsed }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to reset monthly question usage (${response.status}): ${body}`);
  }
}

test.describe("Custody Atlas Ask Atlas", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    test.skip(!qaUserEmail || !qaUserPassword, "Set QA_USER_EMAIL and QA_USER_PASSWORD to run Ask Atlas coverage.");
    test.skip(!supabaseUrl || !supabaseServiceRoleKey, "Set Supabase env vars to reset monthly Ask Atlas usage.");

    await page.route("**/api/ask", async (route) => {
      const request = route.request();
      const originalBody = JSON.parse(request.postData() ?? "{}");
      const body = { ...originalBody, useGeneralWorkspace: true };
      await route.continue({
        postData: JSON.stringify(body),
        headers: {
          ...request.headers(),
          "content-type": "application/json",
        },
      });
    });

    await loginUser(page, qaUserEmail!, qaUserPassword!);
    const token = await getSessionToken(page);
    test.skip(!token, "No auth token available for usage reset.");

    const casesRes = await fetch(
      `${process.env.QA_BASE_URL ?? "http://localhost:5050"}/api/cases`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const { cases } = await casesRes.json() as { cases?: Array<{ id: string; title?: string }> };
    for (const c of cases ?? []) {
      if (c.title?.startsWith("QA ")) {
        await fetch(
          `${process.env.QA_BASE_URL ?? "http://localhost:5050"}/api/cases/${c.id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        );
      }
    }

    await resetMonthlyQuestionUsage(token!);
  });

  test("Free user can ask a question and receive a response", async ({ page }) => {
    const askAtlasPage = new AskAtlasPage(page);
    await askAtlasPage.goto();
    await askAtlasPage.askQuestion("How is custody decided in Georgia?");
    await askAtlasPage.waitForResponse();
    await expect(askAtlasPage.getLastAssistantResponseLocator()).toContainText(/custody|georgia|court/i);
  });

  test("Question counter increments after each question", async ({ page }) => {
    const askAtlasPage = new AskAtlasPage(page);
    await askAtlasPage.goto();
    const before = await askAtlasPage.getQuestionCount();
    await askAtlasPage.askQuestion("What is the best-interest standard in custody cases?");
    await askAtlasPage.waitForResponse();
    const after = await askAtlasPage.getQuestionCount();
    expect(after.used).toBeGreaterThan(before.used);
  });

  test("Free user sees upgrade modal at 25 questions", async ({ page }) => {
    const token = await getSessionToken(page);
    test.skip(!token, "No auth token available for usage inspection.");

    await setMonthlyQuestionUsage(token!, 24);
    const verifyRes = await fetch(
      `${process.env.QA_BASE_URL ?? "http://localhost:5050"}/api/usage`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const usage = await verifyRes.json() as { questionsUsed?: number; questionsLimit?: number };

    const askAtlasPage = new AskAtlasPage(page);
    await askAtlasPage.goto();
    await askAtlasPage.askQuestion("QA limit test question: how does custody work?");
    if (usage.questionsUsed !== 24) {
      throw new Error(`Usage seed failed. Expected 24 questions used, got ${usage.questionsUsed}`);
    }
    await expect(
      page.getByText(/you've reached your free question limit/i)
        .or(page.getByText(/upgrade to pro/i))
        .or(page.getByText(/25 free questions/i))
        .first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("Link case nudge appears when no case linked", async ({ page }) => {
    const token = await getSessionToken(page);
    test.skip(!token, "No auth token available for case seeding.");

    const seeded = await seedCase<{ id: string; title?: string }>(token!, {
      title: `QA Ask Atlas Case ${Date.now()}`,
      status: "intake",
    });

    const askAtlasPage = new AskAtlasPage(page);
    await askAtlasPage.goto();
    await expect(page.getByText(/link a case to get answers specific to your court/i)).toBeVisible();
    await expect(page.getByTestId("button-pick-case")).toBeVisible();

    expect(seeded.id).toBeTruthy();
  });

  test("Response is visible without manual scrolling", async ({ page }) => {
    const askAtlasPage = new AskAtlasPage(page);
    await askAtlasPage.goto();
    await askAtlasPage.askQuestion("Explain parenting plans in Georgia.");
    await askAtlasPage.waitForResponse();
    await expect(askAtlasPage.getLastAssistantResponseLocator()).toBeInViewport();
  });
});
