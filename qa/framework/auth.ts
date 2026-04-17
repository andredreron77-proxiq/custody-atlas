import { expect, type Page } from "@playwright/test";

function authBaseUrl(): string {
  return process.env.QA_BASE_URL ?? "http://localhost:5050";
}

export async function loginUser(page: Page, email: string, password: string): Promise<void> {
  await page.goto(authBaseUrl());
  await page.getByTestId("button-login").click();
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-submit-auth").click();
  await expect(page.getByTestId("button-user-menu")).toBeVisible();
}

export async function logoutUser(page: Page): Promise<void> {
  await page.getByTestId("button-user-menu").click();
  await page.getByTestId("button-logout").click();
  await expect(page.getByTestId("button-login")).toBeVisible();
}

export async function signupUser(
  page: Page,
  email: string,
  password: string,
  displayName: string,
): Promise<void> {
  await page.goto(authBaseUrl());
  await page.getByTestId("button-login").click();
  await page.getByTestId("button-toggle-auth-mode").click();
  await page.getByTestId("input-email").fill(email);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-submit-auth").click();

  const preferredNameInput = page.getByTestId("input-display-name");
  if (await preferredNameInput.isVisible().catch(() => false)) {
    await preferredNameInput.fill(displayName);
    await page.getByTestId("button-continue-display-name").click();
  }
}

export async function getSessionToken(page: Page): Promise<string | null> {
  const localStorageToken = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw) as
          | { access_token?: string; currentSession?: { access_token?: string } }
          | Array<{ access_token?: string }>;

        if (Array.isArray(parsed) && typeof parsed[0]?.access_token === "string") {
          return parsed[0].access_token;
        }

        if (typeof parsed.access_token === "string") return parsed.access_token;
        if (typeof parsed.currentSession?.access_token === "string") {
          return parsed.currentSession.access_token;
        }
      } catch {
        if (raw.startsWith("eyJ")) return raw;
      }
    }
    return null;
  });

  if (localStorageToken) return localStorageToken;

  const cookies = await page.context().cookies();
  const authCookie = cookies.find((cookie) =>
    /access|auth|token|session/i.test(cookie.name),
  );

  return authCookie?.value ?? null;
}

export async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto(authBaseUrl());
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    if ("indexedDB" in window && typeof indexedDB.databases === "function") {
      const databases = await indexedDB.databases();
      await Promise.all(
        databases
          .map((db) => db.name)
          .filter((name): name is string => Boolean(name))
          .map((name) => new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
          })),
      );
    }
  });
}
