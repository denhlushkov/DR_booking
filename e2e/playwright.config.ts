import { defineConfig, devices } from '@playwright/test';

/**
 * E2E-тести інтегрованої системи (Nginx + API + PostgreSQL), запущеної через docker compose.
 * Локально використовується встановлений Microsoft Edge (channel msedge), у CI — Chromium.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://localhost:8443',
    ignoreHTTPSErrors: true, // самопідписаний сертифікат локального стенду
    locale: 'uk-UA',
    timezoneId: 'Europe/Kyiv',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PW_CHANNEL ?? (process.env.CI ? undefined : 'msedge'),
      },
    },
  ],
});
