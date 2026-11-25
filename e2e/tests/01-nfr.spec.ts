import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { ADMIN, EMPLOYEE, loginAs, saveResult } from './helpers';

const SCREENSHOTS = resolve(__dirname, '../../docs/screenshots');

test.describe('NFR-05: адаптивність від 360 до 1920 px', () => {
  const viewports = [
    { width: 360, height: 740 },
    { width: 1920, height: 1080 },
  ];
  const pages = [
    { path: '/', heading: 'Пошук вільних місць', name: 'search' },
    { path: '/bookings', heading: 'Мої бронювання', name: 'bookings' },
    { path: '/admin', heading: 'Адміністрування', name: 'admin' },
  ];

  for (const viewport of viewports) {
    test(`${viewport.width}px: без горизонтальної прокрутки`, async ({ page }) => {
      const results: Record<string, number> = {};
      await page.setViewportSize(viewport);

      await page.goto('/login');
      results.login = await horizontalOverflow(page);
      await page.screenshot({ path: `${SCREENSHOTS}/login-${viewport.width}.png` });

      await loginAs(page, ADMIN);
      for (const p of pages) {
        await page.goto(p.path);
        await expect(page.getByRole('heading', { name: p.heading })).toBeVisible();
        await page.waitForLoadState('networkidle');
        results[p.name] = await horizontalOverflow(page);
        await page.screenshot({ path: `${SCREENSHOTS}/${p.name}-${viewport.width}.png`, fullPage: true });
      }

      saveResult(`nfr-05-viewport-${viewport.width}`, { viewport, horizontalOverflowPx: results });
      for (const [name, overflow] of Object.entries(results)) {
        expect(overflow, `горизонтальне переповнення сторінки ${name}`).toBeLessThanOrEqual(0);
      }
    });
  }
});

test('NFR-02: головна сторінка з переліком завантажується ≤ 2.0 с при 10 Мбіт/с', async ({ page }) => {
  await loginAs(page, EMPLOYEE);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 20, // мс RTT
    downloadThroughput: (10 * 1_000_000) / 8, // 10 Мбіт/с у байтах/с
    uploadThroughput: (10 * 1_000_000) / 8,
  });

  const started = Date.now();
  await page.goto('/');
  await page.getByTestId('resource-card').first().waitFor();
  const listVisibleMs = Date.now() - started;

  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return {
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
      loadEventMs: Math.round(nav.loadEventEnd),
      transferredBytes: nav.transferSize + resources.reduce((sum, r) => sum + r.transferSize, 0),
      requests: resources.length + 1,
    };
  });

  saveResult('nfr-02-page-load', {
    network: '10 Мбіт/с, RTT 20 мс, кеш вимкнено',
    listVisibleMs,
    ...timing,
    limitMs: 2000,
  });
  expect(listVisibleMs).toBeLessThanOrEqual(2000);
});

async function horizontalOverflow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
