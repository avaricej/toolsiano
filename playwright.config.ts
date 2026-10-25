import { defineConfig } from '@playwright/test';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4321';
const browserName = (process.env.PLAYWRIGHT_BROWSER || 'chromium') as
  'chromium' | 'firefox' | 'webkit';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL,
    browserName,
    headless: true,
    acceptDownloads: true,
    launchOptions:
      browserName === 'chromium'
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined }
        : undefined,
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    env: { PORT: new URL(baseURL).port || '4321' },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
