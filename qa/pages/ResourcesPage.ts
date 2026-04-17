import { expect, type Page } from "@playwright/test";
import { BasePage } from "../framework/BasePage";

export class ResourcesPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/resources");
  }

  async assertCategoriesVisible(): Promise<void> {
    for (const heading of [
      /free legal help/i,
      /government and state programs/i,
      /court self-help centers/i,
      /mediation services/i,
      /vetted family law attorneys/i,
    ]) {
      await expect(this.page.getByText(heading).first()).toBeVisible();
    }
  }

  async joinWaitlist(): Promise<void> {
    await this.page.getByRole("button", { name: /notify me when available/i }).click();
  }

  async assertWaitlistSuccess(): Promise<void> {
    await expect(this.page.getByRole("button", { name: /you’re on the list|you're on the list/i })).toBeVisible();
  }
}
