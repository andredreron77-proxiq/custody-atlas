import { expect, type Page } from "@playwright/test";
import { BasePage } from "../framework/BasePage";

export class WorkspacePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await super.goto("/workspace");
  }

  async assertCaseMemoryVisible(): Promise<void> {
    await expect(this.page.getByTestId("card-case-memory-strip")).toBeVisible();
  }

  async assertWhatMattersNowVisible(): Promise<void> {
    await expect(this.page.getByText(/what matters now/i).first()).toBeVisible();
  }

  async createCase(name: string): Promise<void> {
    await this.page.getByTestId("button-create-case").click();
    await this.page.getByLabel(/case name/i).fill(name);
    await this.page.getByRole("button", { name: /^Create Case$|^Create$/i }).last().click();
  }
}
