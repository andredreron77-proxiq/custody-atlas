import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../framework/BasePage";

export class AskAtlasPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(useCaseId?: string): Promise<void> {
    const params = new URLSearchParams({
      state: "Georgia",
      county: "Fulton",
      country: "United States",
    });
    if (useCaseId) {
      params.set("case", useCaseId);
    }
    await super.goto(`/ask?${params.toString()}`);
    await this.page.waitForLoadState("networkidle");

    const displayNameInput = this.page.getByPlaceholder(/preferred name/i);
    if (await displayNameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await displayNameInput.fill("QA User");
      const continueBtn = this.page.getByRole("button", { name: /continue|save|done/i }).first();
      await continueBtn.click({ force: true });
      await this.page.waitForLoadState("networkidle");
    }

    const modal = this.page.getByTestId("modal-onboarding");
    while (await modal.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const btn = this.page.getByRole("button", { name: /continue|skip|next|done/i }).first();
      if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await btn.click({ force: true });
        await this.page.waitForTimeout(400);
      } else {
        break;
      }
    }

    const skipBtn = this.page.getByRole("button", { name: /skip for now/i });
    if (await skipBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skipBtn.click();
      await this.page.waitForLoadState("networkidle");
    }

    await expect(this.page.getByTestId("input-question")).toBeVisible({ timeout: 30_000 });
  }

  async linkCase(caseName: string): Promise<void> {
    await this.page.getByTestId("button-pick-case").click();
    const option = this.page.getByRole("button", { name: new RegExp(caseName, "i") }).first();
    await expect(option).toBeVisible();
    await option.click();
  }

  async askQuestion(question: string): Promise<void> {
    const input = this.page.getByTestId("input-question");
    await input.click();
    await input.fill(question);
    await input.dispatchEvent("input");
    await input.dispatchEvent("change");
    await this.page.waitForTimeout(300);
    await expect(
      this.page.getByTestId("button-send"),
    ).toBeEnabled({ timeout: 5_000 });
    await this.page.keyboard.press("Enter");
  }

  async waitForResponse(): Promise<void> {
    await expect(
      this.page.getByText(/generating your answer/i),
    ).toBeVisible({ timeout: 10_000 }).catch(() => {});

    await expect(
      this.page.getByText(/generating your answer/i),
    ).toHaveCount(0, { timeout: 60_000 });

    await this.page.waitForSelector(
      '[data-testid^="message-assistant-"]',
      { state: "attached", timeout: 90_000 },
    );

    const lastMessage = this.page.locator(
      '[data-testid^="message-assistant-"]',
    ).last();
    await lastMessage.scrollIntoViewIfNeeded();
    await expect(lastMessage).toBeVisible({ timeout: 10_000 });
  }

  async getResponseText(): Promise<string> {
    return (await this.lastAssistantResponse().innerText()).trim();
  }

  async getQuestionCount(): Promise<{ used: number; limit: number }> {
    const token = await this.page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.includes("auth") || key?.includes("token") || key?.includes("session")) {
          const val = localStorage.getItem(key) ?? "";
          try {
            const parsed = JSON.parse(val);
            return parsed?.access_token ?? parsed?.token ?? null;
          } catch {
            return val;
          }
        }
      }
      return null;
    });
    const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:5050";
    const res = await this.page.evaluate(async ({ url, tok }) => {
      const r = await fetch(`${url}/api/usage`, {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      return r.json();
    }, { url: baseUrl, tok: token });
    return { used: res.questionsUsed, limit: res.questionsLimit };
  }

  async assertUpgradeModalVisible(): Promise<void> {
    await expect(
      this.page.locator('[role="dialog"]'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      this.page.getByText(/upgrade to custody atlas pro/i)
        .or(this.page.getByText(/\$19\.99/i)),
    ).toBeVisible({ timeout: 5_000 });
  }

  async selectPlan(plan: "monthly" | "annual"): Promise<void> {
    const modal = this.page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    const buttons = modal.getByRole('button', { name: /choose this plan/i });
    const buttonIndex = plan === 'monthly' ? 0 : 1;
    await buttons.nth(buttonIndex).click();
  }

  getLastAssistantResponseLocator(): Locator {
    return this.lastAssistantResponse();
  }

  private lastAssistantResponse(): Locator {
    return this.page.locator('[data-testid^="message-assistant-"]').last();
  }
}
