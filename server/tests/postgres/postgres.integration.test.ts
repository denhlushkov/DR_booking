import { Client, type Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Booking } from '../../src/domain/booking';
import { BookingStatus, ResourceStatus, Role } from '../../src/domain/enums';
import { Notification } from '../../src/domain/notification';
import { User } from '../../src/domain/user';
import { runMigrations } from '../../src/infrastructure/postgres/migrator';
import {
  PgBookingRepository,
  PgNotificationRepository,
  PgResourceRepository,
  PgResourceStatusHistoryRepository,
  PgUnitOfWork,
  PgUserRepository,
} from '../../src/infrastructure/postgres/pg.repositories';
import { createPool } from '../../src/infrastructure/postgres/pool';
import { ReportGenerator } from '../../src/modules/analytics/report-generator';
import { BookingPolicy, DEFAULT_BOOKING_RULES } from '../../src/modules/bookings/booking.policy';
import { BookingService } from '../../src/modules/bookings/booking.service';
import { ResourceService } from '../../src/modules/resources/resource.service';
import { ConflictError } from '../../src/shared/errors';
import { parseTimeOfDay, WorkSchedule } from '../../src/shared/work-schedule';
import { at, FakeNotifier, FixedClock, makeResource } from '../helpers/fakes';

/**
 * Інтеграційні тести на справжньому PostgreSQL (ті самі сервіси, що й у робочому режимі).
 * Запуск: TEST_DATABASE_URL=postgres://dr_booking:dr_booking@localhost:5432/dr_booking_test npm test
 * Без змінної тести пропускаються. З міркувань безпеки назва БД має закінчуватись на `_test`.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PostgreSQL: репозиторії, транзакції та обмеження', () => {
  let pool: Pool;
  const NOW = at('2026-12-01T08:00:00Z');
  const clock = new FixedClock(NOW);
  let userId: string;

  beforeAll(async () => {
    await recreateTestDatabase(url!);
    pool = createPool(url!);
    expect(await runMigrations(pool)).toEqual([
      '001_init.sql',
      '002_notifications_reminders_downtime.sql',
    ]);
    const user = new User({
      id: crypto.randomUUID(),
      fullName: 'Test User',
      email: 'pg.user@company.com',
      passwordHash: '$2b$04$hash',
      role: Role.EMPLOYEE,
      department: 'QA',
      position: 'Tester',
    });
    await new PgUserRepository(pool).insert(user);
    userId = user.id;
  });

  afterAll(async () => {
    await pool?.end();
  });

  const newResource = async () => {
    const r = makeResource({ id: crypto.randomUUID() });
    await new PgResourceRepository(pool).insert(r);
    return r;
  };

  it('повторний запуск міграцій нічого не застосовує', async () => {
    await expect(runMigrations(pool)).resolves.toEqual([]);
  });

  it('унікальність email → ConflictError', async () => {
    const users = new PgUserRepository(pool);
    const dup = new User({ ...(await users.findById(userId))!, id: crypto.randomUUID() });
    await expect(users.insert(dup)).rejects.toThrow(ConflictError);
  });

  it('20 паралельних транзакцій на один слот: успішна рівно одна (FR-04, SELECT … FOR UPDATE)', async () => {
    const resource = await newResource();
    const service = new BookingService(
      new PgUnitOfWork(pool),
      new PgBookingRepository(pool),
      new PgResourceRepository(pool),
      new BookingPolicy(DEFAULT_BOOKING_RULES, clock),
      new FakeNotifier(),
      clock,
    );
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        service.createBooking({
          userId,
          resourceId: resource.id,
          startTime: at('2026-12-01T10:00:00Z'),
          endTime: at('2026-12-01T11:00:00Z'),
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const errors = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
    expect(errors.every((e) => e instanceof ConflictError)).toBe(true);
  });

  it('exclusion constraint БД відхиляє перетин навіть в обхід сервісу', async () => {
    const resource = await newResource();
    const repo = new PgBookingRepository(pool);
    const make = (start: string, end: string) =>
      Booking.create(
        { id: crypto.randomUUID(), userId, resourceId: resource.id, startTime: at(start), endTime: at(end) },
        NOW,
      );
    await repo.insert(make('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z'));
    await expect(repo.insert(make('2026-12-01T10:30:00Z', '2026-12-01T11:30:00Z'))).rejects.toThrow(ConflictError);
    // Суміжний слот — дозволено.
    await expect(repo.insert(make('2026-12-01T11:00:00Z', '2026-12-01T12:00:00Z'))).resolves.toBeUndefined();
  });

  it('пошук перетинів, завершення та нагадування (FR-02, FR-11)', async () => {
    const resource = await newResource();
    const repo = new PgBookingRepository(pool);
    const add = async (start: string, end: string) => {
      const b = Booking.create(
        { id: crypto.randomUUID(), userId, resourceId: resource.id, startTime: at(start), endTime: at(end) },
        NOW,
      );
      await repo.insert(b);
      return b;
    };
    const ended = await add('2026-12-01T06:00:00Z', '2026-12-01T07:00:00Z');
    const soon = await add('2026-12-01T08:20:00Z', '2026-12-01T09:00:00Z');

    const overlap = await repo.findActiveOverlapping(
      { start: at('2026-12-01T06:30:00Z'), end: at('2026-12-01T08:30:00Z') },
      { resourceIds: [resource.id], excludeBookingId: ended.id },
    );
    expect(overlap.map((b) => b.id)).toEqual([soon.id]);

    expect(await repo.completeEndedBefore(NOW)).toBeGreaterThanOrEqual(1);
    expect((await repo.findById(ended.id))!.status).toBe(BookingStatus.COMPLETED);

    // Два паралельні «захоплення» нагадувань: кожне бронювання повертається лише один раз.
    const windowEnd = at('2026-12-01T08:30:00Z');
    const [a, b] = await Promise.all([repo.claimDueReminders(NOW, windowEnd), repo.claimDueReminders(NOW, windowEnd)]);
    const claimed = [...a, ...b].filter((x) => x.resourceId === resource.id);
    expect(claimed.map((x) => x.id)).toEqual([soon.id]);
  });

  it('блокування ресурсу: транзакція скасовує бронювання і пише історію; звіт її враховує (FR-06, FR-07)', async () => {
    const resource = await newResource();
    const bookings = new PgBookingRepository(pool);
    const history = new PgResourceStatusHistoryRepository(pool);
    const future = Booking.create(
      {
        id: crypto.randomUUID(),
        userId,
        resourceId: resource.id,
        startTime: at('2026-12-01T12:00:00Z'),
        endTime: at('2026-12-01T13:00:00Z'),
      },
      NOW,
    );
    await bookings.insert(future);

    const service = new ResourceService(
      new PgResourceRepository(pool),
      bookings,
      new PgUnitOfWork(pool),
      new FakeNotifier(),
      clock,
    );
    const result = await service.changeStatus(resource.id, ResourceStatus.BLOCKED);
    expect(result.cancelledBookings).toBe(1);
    expect((await bookings.findById(future.id))!.status).toBe(BookingStatus.CANCELLED);

    clock.set(at('2026-12-01T14:00:00Z'));
    await service.changeStatus(resource.id, ResourceStatus.AVAILABLE);
    clock.set(NOW);

    const report = new ReportGenerator(
      new PgResourceRepository(pool),
      bookings,
      history,
      new WorkSchedule({ timeZone: 'UTC', dayStartMinutes: parseTimeOfDay('08:00'), dayEndMinutes: parseTimeOfDay('20:00'), workDays: [0, 1, 2, 3, 4, 5, 6] }),
    );
    const rows = await report.buildReport({ start: at('2026-12-01T00:00:00Z'), end: at('2026-12-02T00:00:00Z') });
    // Простій 08:00–14:00 → доступно 12 − 6 = 6 год.
    expect(rows.find((r) => r.resourceId === resource.id)).toMatchObject({ downtimeHours: 6, availableHours: 6 });
  });

  it('сповіщення: збереження, непрочитані, позначення прочитаними (FR-11)', async () => {
    const repo = new PgNotificationRepository(pool);
    for (const [i, type] of ['BOOKING_CREATED', 'BOOKING_REMINDER'].entries()) {
      await repo.insert(
        new Notification({
          id: crypto.randomUUID(),
          userId,
          type: type as Notification['type'],
          title: 't',
          message: 'm',
          bookingId: null,
          createdAt: new Date(NOW.getTime() + i * 1000),
          readAt: null,
        }),
      );
    }
    expect(await repo.countUnread(userId)).toBe(2);
    expect((await repo.findByUser(userId, { limit: 1 }))[0].type).toBe('BOOKING_REMINDER');
    expect(await repo.markAllRead(userId, NOW)).toBe(2);
    expect(await repo.findByUser(userId, { unreadOnly: true })).toEqual([]);
  });
});

/** Створює (або перестворює) тестову БД. Відмовляється працювати з БД без суфікса `_test`. */
async function recreateTestDatabase(connectionString: string): Promise<void> {
  const target = new URL(connectionString);
  const dbName = target.pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(dbName)) {
    throw new Error(`TEST_DATABASE_URL має вказувати на БД з суфіксом _test, отримано "${dbName}"`);
  }
  const admin = new URL(connectionString);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await client.end();
  }
}
