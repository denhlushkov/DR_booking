import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type APIRequestContext, expect, type Page } from '@playwright/test';

export interface Credentials {
  email: string;
  password: string;
}

/** Демо-облікові записи, які створює сервер при SEED_DEMO_DATA=true. */
export const EMPLOYEE: Credentials = { email: 'employee@company.com', password: 'Employee12345' };
export const ADMIN: Credentials = { email: 'admin@company.com', password: 'Admin12345' };

const TOKEN_KEY = 'dr-booking.token';
const tokens = new Map<string, string>();

/** Вхід через API з кешуванням токена — щоб не впертися в rate limit входу (NFR-04). */
export async function apiLogin(request: APIRequestContext, creds: Credentials): Promise<string> {
  const cached = tokens.get(creds.email);
  if (cached) return cached;
  const res = await request.post('/api/v1/auth/login', { data: creds });
  expect(res.status(), `login ${creds.email}`).toBe(200);
  const { token } = (await res.json()) as { token: string };
  tokens.set(creds.email, token);
  return token;
}

/** Відкриває застосунок уже автентифікованим (токен кладеться в localStorage до завантаження сторінки). */
export async function loginAs(page: Page, creds: Credentials): Promise<string> {
  const token = await apiLogin(page.request, creds);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TOKEN_KEY, token] as const);
  return token;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Адміністратор створює окремий ресурс для тесту — прогони не заважають один одному. */
export async function createResource(
  request: APIRequestContext,
  adminToken: string,
  data: { name: string; type: 'DESK' | 'MEETING_ROOM'; floor?: number; attributes?: Record<string, unknown> },
): Promise<{ id: string; name: string }> {
  const res = await request.post('/api/v1/resources', {
    headers: auth(adminToken),
    data: { floor: 3, ...data },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

/** Найближчий робочий день (Пн–Пт) не раніше ніж через `minDays` днів, у форматі YYYY-MM-DD. */
export function nextWorkday(minDays = 1): string {
  const d = new Date();
  d.setDate(d.getDate() + minDays);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Зберігає результати вимірювань NFR для звіту (docs/results/). */
export function saveResult(name: string, data: unknown): void {
  const file = resolve(__dirname, '../../docs/results', `${name}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ measuredAt: new Date().toISOString(), ...(data as object) }, null, 2)}\n`);
}
