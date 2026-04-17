import { type Page } from "@playwright/test";
import { BasePage } from "../framework/BasePage";
import { loginUser, signupUser } from "../framework/auth";

export class AuthPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoLogin(): Promise<void> {
    await super.goto("/");
    await this.page.getByTestId("button-login").click();
  }

  async login(email: string, password: string): Promise<void> {
    await loginUser(this.page, email, password);
  }

  async gotoSignup(): Promise<void> {
    await this.gotoLogin();
    await this.page.getByTestId("button-toggle-auth-mode").click();
  }

  async signup(email: string, password: string, displayName: string): Promise<void> {
    await signupUser(this.page, email, password, displayName);
  }
}
