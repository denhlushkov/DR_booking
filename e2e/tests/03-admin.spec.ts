import { expect, test } from '@playwright/test';
import { ADMIN, apiLogin, auth, createResource, EMPLOYEE, loginAs } from './helpers';

test.describe('Адміністратор', () => {
  test('блокування ресурсу скасовує бронювання і сповіщає власника (FR-06, FR-11)', async ({ page }) => {
    const adminToken = await apiLogin(page.request, ADMIN);
    const employeeToken = await apiLogin(page.request, EMPLOYEE);
    const room = await createResource(page.request, adminToken, {
      name: `E2E кімната ${Date.now()}`,
      type: 'MEETING_ROOM',
      attributes: { capacity: 6 },
    });

    // Співробітник бронює кімнату на післязавтра.
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 2);
    start.setUTCHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);
    const booked = await page.request.post('/api/v1/bookings', {
      headers: auth(employeeToken),
      data: { resourceId: room.id, startTime: start.toISOString(), endTime: end.toISOString() },
    });
    expect(booked.status()).toBe(201);

    // Адміністратор переводить кімнату на обслуговування через UI.
    await loginAs(page, ADMIN);
    await page.goto('/admin');
    await page.getByLabel(`Статус ${room.name}`).selectOption('MAINTENANCE');
    await expect(page.getByRole('status')).toContainText('Скасовано бронювань: 1');

    // Власник бачить сповіщення про примусове скасування.
    const inbox = await page.request.get('/api/v1/notifications/me', { headers: auth(employeeToken) });
    const { items } = (await inbox.json()) as { items: Array<{ type: string; message: string }> };
    expect(items[0]).toMatchObject({ type: 'BOOKING_CANCELLED_BY_ADMIN' });
    expect(items[0].message).toContain(room.name);
  });

  test('створює користувача, який входить через форму (FR-13, FR-01)', async ({ page }) => {
    const email = `e2e.${Date.now()}@company.com`;
    await loginAs(page, ADMIN);
    await page.goto('/admin');

    await page.getByPlaceholder('ПІБ').fill('Тест Наскрізний');
    await page.getByPlaceholder('Корпоративна пошта').fill(email);
    await page.getByPlaceholder(/Початковий пароль/).fill('Welcome12345');
    await page.getByPlaceholder('Відділ').fill('QA');
    await page.getByPlaceholder('Посада').fill('Tester');
    await page.getByRole('button', { name: 'Створити' }).click();
    await expect(page.getByRole('status')).toContainText(`Обліковий запис ${email} створено`);

    // Вихід і вхід новим користувачем.
    await page.getByRole('button', { name: 'Вийти' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Електронна пошта').fill(email);
    await page.getByLabel('Пароль').fill('Welcome12345');
    await page.getByRole('button', { name: 'Увійти' }).click();
    await expect(page.getByRole('heading', { name: 'Пошук вільних місць' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Адміністрування' })).toHaveCount(0);
  });

  test('експортує звіт завантаженості у CSV (FR-07)', async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.goto('/admin');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Завантажити CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^utilization_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
    const content = await (await file.createReadStream()).toArray();
    expect(Buffer.concat(content).toString('utf8')).toContain('utilization_percent');
  });
});
