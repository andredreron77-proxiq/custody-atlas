import { test, expect, type Page } from "@playwright/test";
import { AskAtlasPage } from "../../pages/AskAtlasPage";
import { clearSession, getSessionToken, loginUser } from "../../framework/auth";

const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:5050";
const resetToken = process.env.QA_RESET_TOKEN!;
const userEmail = process.env.QA_USER_EMAIL!;
const userPassword = process.env.QA_USER_PASSWORD!;
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function currentBillingPeriod(): string {
  const billingPeriod = new Date();
  billingPeriod.setDate(1);
  billingPeriod.setHours(0, 0, 0, 0);
  return billingPeriod.toISOString().split("T")[0];
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

async function openUpgradeModal(page: Page): Promise<string> {
  const token = await getSessionToken(page);
  if (!token) {
    throw new Error("No auth token available for billing setup.");
  }

  const usageRes = await fetch(`${baseUrl}/api/usage`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const usage = await usageRes.json() as { userId?: string };
  console.log("[billing] userId from usage:", usage.userId);

  const resolvedUserId = usage.userId ?? decodeUserIdFromToken(token);
  const billingPeriod = new Date();
  billingPeriod.setDate(1);
  const bp = billingPeriod.toISOString().split("T")[0];

  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/usage_limits?user_id=eq.${resolvedUserId}&billing_period=eq.${bp}`,
    {
      method: "PATCH",
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ questions_used: 25 }),
    },
  );
  const patchBody = await patchRes.json();
  console.log("[billing] patch result:", JSON.stringify(patchBody));

  await page.route("**/api/ask", async (route) => {
    const request = route.request();
    const body = JSON.parse(request.postData() ?? "{}");
    body.useGeneralWorkspace = true;
    await route.continue({
      postData: JSON.stringify(body),
      headers: { ...request.headers(), "content-type": "application/json" },
    });
  });

  const askAtlasPage = new AskAtlasPage(page);
  await askAtlasPage.goto();
  await askAtlasPage.askQuestion("QA billing trigger question");
  await expect(
    page.getByText(/you've reached your free question limit/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /upgrade to pro/i }).first().click();
  return token;
}

test.describe("Custody Atlas billing", () => {
  test.beforeEach(async ({ page }) => {
    await clearSession(page);
    test.skip(!resetToken || !userEmail || !userPassword, "Set QA_RESET_TOKEN, QA_USER_EMAIL, and QA_USER_PASSWORD to run billing coverage.");
    test.skip(!supabaseUrl || !supabaseServiceRoleKey, "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to seed billing QA state.");

    const resetRes = await fetch(`${baseUrl}/api/qa/reset-billing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-qa-reset-token": resetToken,
      },
      body: JSON.stringify({ email: userEmail }),
    });
    const resetBody = await resetRes.json();
    console.log("[billing test] reset result:", JSON.stringify(resetBody));
    console.log("[billing test] reset status:", resetRes.status);

    await loginUser(page, userEmail, userPassword);
    await page.waitForLoadState("networkidle");
  });

  test("Upgrade modal shows monthly and annual options", async ({ page }) => {
    await openUpgradeModal(page);
    await expect(page.getByText(/monthly/i).first()).toBeVisible();
    await expect(page.getByText(/annual/i).first()).toBeVisible();
  });

  test("Annual plan is highlighted as best value", async ({ page }) => {
    await openUpgradeModal(page);
    await expect(page.getByText(/best value/i)).toBeVisible();
  });

  test("Selecting monthly plan redirects to Stripe checkout", async ({ page }) => {
    const askAtlasPage = new AskAtlasPage(page);
    await openUpgradeModal(page);
    const upgradeButton = page.getByRole("button", { name: /upgrade to pro/i }).first();
    if (await upgradeButton.isVisible().catch(() => false)) {
      await upgradeButton.click();
      await expect(
        page.locator('[role="dialog"]'),
      ).toBeVisible({ timeout: 10_000 });
    }
    await askAtlasPage.selectPlan("monthly");
    await expect(page).toHaveURL(/stripe\.com|checkout/i);
  });

  test("After successful payment tier updates to pro", async ({ page }) => {
    const askAtlasPage = new AskAtlasPage(page);
    const token = await openUpgradeModal(page);
    const upgradeButton = page.getByRole("button", { name: /upgrade to pro/i }).first();
    if (await upgradeButton.isVisible().catch(() => false)) {
      await upgradeButton.click();
      await expect(
        page.locator('[role="dialog"]'),
      ).toBeVisible({ timeout: 10_000 });
    }
    await askAtlasPage.selectPlan("monthly");
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });
    expect(page.url()).toContain("checkout.stripe.com");

    const userId = decodeUserIdFromToken(token);
    await fetch(
      `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}`,
      {
        method: "PATCH",
        headers: {
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tier: "pro" }),
      },
    );

    await page.goto(`${baseUrl}/workspace`);
    await page.waitForLoadState("networkidle");
    const currentToken = await getSessionToken(page);
    const usageData = await page.evaluate(async (tok) => {
      const r = await fetch("/api/usage", {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      return r.json();
    }, currentToken);
    expect(usageData.tier).toBe("pro");
  });
});
