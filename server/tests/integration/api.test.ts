import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config/env';
import { buildContainer } from '../../src/container';
import { BcryptPasswordHasher } from '../../src/modules/auth/password-hasher';
import { DEMO_ACCOUNTS, seedDemoData } from '../../src/infrastructure/seed';
import { at, FakeNotifier, FixedClock } from '../helpers/fakes';

/** Наскрізний сценарій через HTTP: in-memory сховище, зафіксований час. */
describe('REST API /api/v1', () => {
  const config = loadConfig({ NODE_ENV: 'test', DATA_STORE: 'memory', JWT_SECRET: 'test-secret' });
  const container = buildContainer(config, {
    clock: new FixedClock(at('2026-12-01T08:00:00Z')),
    notifier: new FakeNotifier(),
    passwordHasher: new BcryptPasswordHasher(4),
  });
  const app = createApp(container);
  let employeeToken: string;
  let adminToken: string;

  const login = async (email: string, password: string) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.token as string;
  };

  beforeAll(async () => {
    await seedDemoData(container.repositories, container.passwordHasher);
    employeeToken = await login(DEMO_ACCOUNTS.employee.email, DEMO_ACCOUNTS.employee.password);
    adminToken = await login(DEMO_ACCOUNTS.admin.email, DEMO_ACCOUNTS.admin.password);
  });

  it('GET /health', async () => {
    await request(app).get('/api/v1/health').expect(200, { status: 'ok' });
  });

  it('відхиляє невірний пароль без розкриття деталей (FR-01)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: DEMO_ACCOUNTS.employee.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Невірна електронна пошта або пароль');
  });

  it('вимагає токен для захищених маршрутів', async () => {
    await request(app).get('/api/v1/resources').expect(401);
  });

  it('повертає профіль без хешу пароля (FR-02)', async () => {
    const res = await request(app).get('/api/v1/users/me').auth(employeeToken, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: DEMO_ACCOUNTS.employee.email, role: 'EMPLOYEE' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('бронює вільний ресурс і повертає 409 на повторне бронювання (FR-03, FR-04)', async () => {
    const search = await request(app)
      .get('/api/v1/resources')
      .query({ type: 'MEETING_ROOM', participants: 6 })
      .auth(employeeToken, { type: 'bearer' });
    expect(search.status).toBe(200);
    expect(search.body).toHaveLength(1);
    const roomId = search.body[0].id as string;

    const slot = { resourceId: roomId, startTime: '2026-12-01T10:00:00Z', endTime: '2026-12-01T11:00:00Z' };
    const created = await request(app).post('/api/v1/bookings').send(slot).auth(employeeToken, { type: 'bearer' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('CONFIRMED');

    const conflict = await request(app).post('/api/v1/bookings').send(slot).auth(adminToken, { type: 'bearer' });
    expect(conflict.status).toBe(409);

    const free = await request(app)
      .get('/api/v1/resources')
      .query({ type: 'MEETING_ROOM', from: slot.startTime, to: slot.endTime })
      .auth(employeeToken, { type: 'bearer' });
    expect(free.body.map((r: { id: string }) => r.id)).not.toContain(roomId);

    const mine = await request(app).get('/api/v1/bookings/me').auth(employeeToken, { type: 'bearer' });
    expect(mine.body).toHaveLength(1);
  });

  it('дозволяє адмін-маршрути лише адміністратору (FR-06, FR-07)', async () => {
    const newDesk = { name: 'Стіл C-301', type: 'DESK', floor: 3 };
    await request(app).post('/api/v1/resources').send(newDesk).auth(employeeToken, { type: 'bearer' }).expect(403);
    await request(app).post('/api/v1/resources').send(newDesk).auth(adminToken, { type: 'bearer' }).expect(201);

    const csv = await request(app)
      .get('/api/v1/analytics/utilization.csv')
      .query({ from: '2026-12-01', to: '2026-12-08' })
      .auth(adminToken, { type: 'bearer' });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('utilization_percent');
  });

  it('валідує тіло запиту', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .send({ resourceId: 'not-a-uuid' })
      .auth(employeeToken, { type: 'bearer' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
