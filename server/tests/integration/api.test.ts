import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config/env';
import { buildContainer } from '../../src/container';
import { DEMO_ACCOUNTS, seedDemoData } from '../../src/infrastructure/seed';
import { BcryptPasswordHasher } from '../../src/modules/auth/password-hasher';
import { at, FakeNotifier, FixedClock } from '../helpers/fakes';

/** Наскрізний сценарій через HTTP: усі модулі разом, in-memory сховище, зафіксований час. */
describe('REST API /api/v1', () => {
  const config = loadConfig({ NODE_ENV: 'test', DATA_STORE: 'memory', JWT_SECRET: 'test-secret' });
  const container = buildContainer(config, {
    clock: new FixedClock(at('2026-12-01T08:00:00Z')),
    extraNotifier: new FakeNotifier(),
    passwordHasher: new BcryptPasswordHasher(4),
  });
  const app = createApp(container);
  let employee: string;
  let admin: string;
  let roomId: string;
  let bookingId: string;

  const login = async (email: string, password: string) => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return res.body.token as string;
  };
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await seedDemoData(container.repositories, container.passwordHasher);
    employee = await login(DEMO_ACCOUNTS.employee.email, DEMO_ACCOUNTS.employee.password);
    admin = await login(DEMO_ACCOUNTS.admin.email, DEMO_ACCOUNTS.admin.password);
  });

  it('GET /health повідомляє стан сервісу (NFR-03)', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
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
    const res = await request(app).get('/api/v1/users/me').set(as(employee));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: DEMO_ACCOUNTS.employee.email, role: 'EMPLOYEE' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('бронює вільну кімнату за місткістю і повертає 409 на повторне бронювання (FR-03, FR-04, FR-12)', async () => {
    const search = await request(app)
      .get('/api/v1/resources')
      .query({ type: 'MEETING_ROOM', participants: 6 })
      .set(as(employee));
    expect(search.status).toBe(200);
    expect(search.body).toHaveLength(1);
    roomId = search.body[0].id;

    const slot = { resourceId: roomId, startTime: '2026-12-01T10:00:00Z', endTime: '2026-12-01T11:00:00Z' };
    const created = await request(app).post('/api/v1/bookings').send(slot).set(as(employee));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('CONFIRMED');
    bookingId = created.body.id;

    await request(app).post('/api/v1/bookings').send(slot).set(as(admin)).expect(409);

    const free = await request(app)
      .get('/api/v1/resources')
      .query({ type: 'MEETING_ROOM', from: slot.startTime, to: slot.endTime })
      .set(as(employee));
    expect(free.body.map((r: { id: string }) => r.id)).not.toContain(roomId);
  });

  it('показує зайняті інтервали в календарі ресурсу (FR-10)', async () => {
    const res = await request(app)
      .get(`/api/v1/resources/${roomId}/schedule`)
      .query({ from: '2026-12-01T00:00:00Z', to: '2026-12-02T00:00:00Z' })
      .set(as(employee));
    expect(res.body).toEqual([
      { bookingId, startTime: '2026-12-01T10:00:00.000Z', endTime: '2026-12-01T11:00:00.000Z' },
    ]);
  });

  it('переносить бронювання на інший час (PATCH)', async () => {
    const res = await request(app)
      .patch(`/api/v1/bookings/${bookingId}`)
      .send({ startTime: '2026-12-01T12:00:00Z', endTime: '2026-12-01T13:30:00Z' })
      .set(as(employee));
    expect(res.status).toBe(200);
    expect(res.body.startTime).toBe('2026-12-01T12:00:00.000Z');
  });

  it('зберігає сповіщення з назвою ресурсу, датою і часом (FR-11)', async () => {
    const res = await request(app).get('/api/v1/notifications/me').set(as(employee));
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(2);
    expect(res.body.items.map((n: { type: string }) => n.type)).toEqual(['BOOKING_UPDATED', 'BOOKING_CREATED']);
    // 12:00 UTC = 14:00 за Києвом
    expect(res.body.items[0].message).toBe('«Переговорна «Київ»», 01.12.2026, 14:00–15:30');

    await request(app).post('/api/v1/notifications/read-all').set(as(employee)).expect(200, { updated: 2 });
  });

  it('блокування ресурсу скасовує бронювання і сповіщає власника (FR-06)', async () => {
    const res = await request(app)
      .patch(`/api/v1/resources/${roomId}/status`)
      .send({ status: 'MAINTENANCE' })
      .set(as(admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ resource: { status: 'MAINTENANCE' }, cancelledBookings: 1 });

    const mine = await request(app).get('/api/v1/bookings/me').set(as(employee));
    expect(mine.body[0].status).toBe('CANCELLED');

    const inbox = await request(app).get('/api/v1/notifications/me?unreadOnly=true').set(as(employee));
    expect(inbox.body.items[0]).toMatchObject({ type: 'BOOKING_CANCELLED_BY_ADMIN' });
    expect(inbox.body.items[0].message).toContain('обслуговування');
  });

  it('адміністратор створює користувача, який може увійти (FR-13)', async () => {
    const newUser = {
      fullName: 'Нова Співробітниця',
      email: 'new.user@company.com',
      password: 'Welcome12345',
      department: 'QA',
      position: 'QA Engineer',
    };
    await request(app).post('/api/v1/users').send(newUser).set(as(employee)).expect(403);
    const created = await request(app).post('/api/v1/users').send(newUser).set(as(admin));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ email: newUser.email, role: 'EMPLOYEE' });
    await request(app).post('/api/v1/users').send(newUser).set(as(admin)).expect(409);

    await login(newUser.email, newUser.password);
    const list = await request(app).get('/api/v1/users').set(as(admin));
    expect(list.body.map((u: { email: string }) => u.email)).toContain(newUser.email);
  });

  it('дозволяє адмін-маршрути лише адміністратору (FR-06, FR-07)', async () => {
    const newDesk = { name: 'Стіл C-301', type: 'DESK', floor: 3 };
    await request(app).post('/api/v1/resources').send(newDesk).set(as(employee)).expect(403);
    await request(app).post('/api/v1/resources').send(newDesk).set(as(admin)).expect(201);

    const csv = await request(app)
      .get('/api/v1/analytics/utilization.csv')
      .query({ from: '2026-12-01', to: '2026-12-08' })
      .set(as(admin));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('utilization_percent');
  });

  it('валідує тіло запиту', async () => {
    const res = await request(app).post('/api/v1/bookings').send({ resourceId: 'not-a-uuid' }).set(as(employee));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
