import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";

export class BasePage {
  constructor(protected page: Page) {}

  async goto(pathname: string): Promise<void> {
    const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:5050";
    await this.page.goto(`${baseUrl}${pathname}`);
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState("networkidle");
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async screenshot(name: string): Promise<void> {
    const filePath = path.join(process.cwd(), "qa", "screenshots", `${name}.png`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await this.page.screenshot({ path: filePath, fullPage: true });
  }
}
