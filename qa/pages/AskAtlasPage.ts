import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../framework/BasePage";

export class AskAtlasPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/ask");
  }

  async linkCase(caseName: string): Promise<void> {
    await this.page.getByTestId("button-pick-case").click();
    const option = this.page.getByRole("button", { name: new RegExp(caseName, "i") }).first();
    await expect(option).toBeVisible();
    await option.click();
  }

  async askQuestion(question: string): Promise<void> {
    await this.page.getByTestId("input-question").fill(question);
    await this.page.getByTestId("button-send").click();
  }

  async waitForResponse(): Promise<void> {
    await expect(this.lastAssistantResponse()).toBeVisible({ timeout: 30_000 });
    await expect(this.page.getByText(/generating your answer/i)).toHaveCount(0);
  }

  async getResponseText(): Promise<string> {
    return (await this.lastAssistantResponse().innerText()).trim();
  }

  async getQuestionCount(): Promise<string> {
    const indicator = this.page.getByTestId("usage-indicator");
    await expect(indicator).toBeVisible();
    const text = await indicator.innerText();
    const match = text.match(/Questions\s*(\d+\/(?:\d+|∞))/i) ?? text.match(/(\d+\/(?:\d+|∞))/);
    if (!match) {
      throw new Error(`Could not parse question count from usage indicator: ${text}`);
    }
    return match[1];
  }

  async assertUpgradeModalVisible(): Promise<void> {
    await expect(
      this.page.getByRole("heading", { name: /upgrade to custody atlas pro/i }),
    ).toBeVisible();
  }

  async selectPlan(plan: "monthly" | "annual"): Promise<void> {
    const cardTitle = plan === "monthly" ? /monthly/i : /annual/i;
    const card = this.page.locator('[role="dialog"]').getByText(cardTitle).locator("..").locator("..");
    await card.getByRole("button", { name: /choose this plan/i }).click();
  }

  getLastAssistantResponseLocator(): Locator {
    return this.lastAssistantResponse();
  }

  private lastAssistantResponse(): Locator {
    return this.page.locator('[data-testid^="card-response-"]').last();
  }
}
