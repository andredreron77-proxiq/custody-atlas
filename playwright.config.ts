import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadEnvFile(filename: string) {
  const fullPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(fullPath)) return;

  const raw = fs.readFileSync(fullPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = stripWrappingQuotes(trimmed.slice(equalsIndex + 1).trim());

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');
loadEnvFile('.env.qa');

const baseURL = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5000';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './qa/tests',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  webServer: {
    command: 'npm run dev:local',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
