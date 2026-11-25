import { expect, test } from '@playwright/test';
import { ADMIN, apiLogin, createResource, EMPLOYEE, loginAs, nextWorkday } from './helpers';

test.describe('Співробітник', () => {
  test('вхід: невірний пароль → повідомлення без деталей (FR-01)', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Електронна пошта').fill(EMPLOYEE.email);
    await page.getByLabel('Пароль').fill('wrong-password');
    await page.getByRole('button', { name: 'Увійти' }).click();
    await expect(page.getByText('Невірна електронна пошта або пароль')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('бронює через календар, отримує сповіщення, переносить і скасовує (FR-02, FR-03, FR-05, FR-10, FR-11)', async ({
    page,
  }) => {
    const desk = await createResource(page.request, await apiLogin(page.request, ADMIN), {
      name: `E2E стіл ${Date.now()}`,
      type: 'DESK',
      attributes: { zone: 'E2E', equipment: ['monitor'] },
    });
    await loginAs(page, EMPLOYEE);
    await page.goto('/');

    // FR-10: календар ресурсу на обраний день
    const card = page.getByTestId('resource-card').filter({ hasText: desk.name });
    await card.getByRole('button', { name: 'Календар' }).click();
    const calendar = page.getByRole('dialog', { name: desk.name });
    await calendar.getByLabel('Дата').fill(nextWorkday(2));
    await calendar.getByRole('button', { name: '10:00–11:00 вільно' }).click();

    // FR-03: підтвердження
    await expect(page.getByRole('status')).toContainText(`Заброньовано: ${desk.name}`);

    // FR-11: сповіщення з назвою ресурсу
    await expect(page.getByTestId('unread-count')).toBeVisible();
    await page.getByRole('button', { name: /^Сповіщення/ }).click();
    const inbox = page.getByRole('dialog', { name: 'Сповіщення' });
    await expect(inbox.getByText('Бронювання підтверджено').first()).toBeVisible();
    await expect(inbox).toContainText(desk.name);
    await page.keyboard.press('Escape');

    // FR-02: бронювання в особистому кабінеті; перенесення на інший час
    await page.getByRole('link', { name: 'Мої бронювання' }).click();
    const item = page.getByTestId('booking-item').filter({ hasText: desk.name });
    await expect(item).toContainText('10:00–11:00');
    await item.getByRole('button', { name: 'Змінити час' }).click();
    await item.getByLabel('Новий початок').fill('14:00');
    await item.getByLabel('Нове завершення').fill('15:30');
    await item.getByRole('button', { name: 'Зберегти' }).click();
    await expect(item).toContainText('14:00–15:30');

    // FR-05: скасування → бронювання в історії зі статусом «Скасоване»
    await item.getByRole('button', { name: 'Скасувати' }).click();
    await expect(item).toHaveCount(0);
    await page.getByRole('tab', { name: 'Завершені та скасовані' }).click();
    await expect(page.getByTestId('booking-item').filter({ hasText: desk.name })).toContainText('Скасоване');
  });

  test('пошук за місткістю показує лише відповідні кімнати (FR-09, FR-12)', async ({ page }) => {
    await loginAs(page, EMPLOYEE);
    await page.goto('/');
    await page.getByLabel('Дата').fill(nextWorkday(3));
    await page.getByLabel('Тип ресурсу').selectOption('MEETING_ROOM');
    await page.getByLabel('Кількість учасників').fill('6');
    await page.getByRole('button', { name: 'Знайти вільні' }).click();

    const cards = page.getByTestId('resource-card');
    await expect(cards.filter({ hasText: 'Переговорна «Київ»' })).toBeVisible();
    await expect(cards.filter({ hasText: 'Переговорна «Львів»' })).toHaveCount(0); // місткість 4
  });
});
