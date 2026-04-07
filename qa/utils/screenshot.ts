import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

const SCREENSHOT_DIR = path.resolve('qa/artifacts');

export async function captureQaScreenshot(page: Page, name: string): Promise<string> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}
