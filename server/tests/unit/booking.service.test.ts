import { beforeEach, describe, expect, it } from 'vitest';
import { BookingStatus, ResourceStatus, Role } from '../../src/domain/enums';
import {
  InMemoryBookingRepository,
  InMemoryResourceRepository,
  InMemoryUnitOfWork,
} from '../../src/infrastructure/memory/in-memory.repositories';
import { BookingPolicy, DEFAULT_BOOKING_RULES } from '../../src/modules/bookings/booking.policy';
import { BookingService } from '../../src/modules/bookings/booking.service';
import { NotificationType } from '../../src/modules/notifications/notification.service';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../../src/shared/errors';
import { at, FakeNotifier, FixedClock, makeResource } from '../helpers/fakes';

describe('BookingService', () => {
  const NOW = at('2026-12-01T08:00:00Z');
  let clock: FixedClock;
  let notifier: FakeNotifier;
  let resources: InMemoryResourceRepository;
  let service: BookingService;
  let resourceId: string;

  beforeEach(async () => {
    clock = new FixedClock(NOW);
    notifier = new FakeNotifier();
    resources = new InMemoryResourceRepository();
    const bookings = new InMemoryBookingRepository();
    service = new BookingService(
      new InMemoryUnitOfWork({ resources, bookings }),
      bookings,
      resources,
      new BookingPolicy(DEFAULT_BOOKING_RULES, clock),
      notifier,
      clock,
    );
    const resource = makeResource({ name: 'Стіл A-101' });
    resourceId = resource.id;
    await resources.insert(resource);
  });

  const book = (userId: string, start: string, end: string) =>
    service.createBooking({ userId, resourceId, startTime: at(start), endTime: at(end) });

  it('створює бронювання та надсилає сповіщення (FR-03, FR-11)', async () => {
    const booking = await book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
    expect(booking.status).toBe(BookingStatus.CONFIRMED);
    expect(notifier.sent).toEqual([
      expect.objectContaining({ type: NotificationType.BOOKING_CREATED, resourceName: 'Стіл A-101' }),
    ]);
  });

  it('відхиляє слот коротший за 30 хвилин', async () => {
    await expect(book('u1', '2026-12-01T10:00:00Z', '2026-12-01T10:15:00Z')).rejects.toThrow(ValidationError);
  });

  it('відхиляє слот у минулому', async () => {
    await expect(book('u1', '2026-12-01T07:00:00Z', '2026-12-01T07:30:00Z')).rejects.toThrow(ValidationError);
  });

  it('повертає конфлікт при перетині з наявним бронюванням (FR-04)', async () => {
    await book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
    await expect(book('u2', '2026-12-01T10:30:00Z', '2026-12-01T11:30:00Z')).rejects.toThrow(ConflictError);
    await expect(book('u2', '2026-12-01T11:00:00Z', '2026-12-01T12:00:00Z')).resolves.toBeDefined();
  });

  it('при одночасних запитах на один слот успішний лише один (FR-04)', async () => {
    const results = await Promise.allSettled(
      ['u1', 'u2', 'u3', 'u4', 'u5'].map((u) => book(u, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z')),
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected.every((r) => r.reason instanceof ConflictError)).toBe(true);
  });

  it('не дозволяє бронювати ресурс на обслуговуванні (FR-06)', async () => {
    const resource = (await resources.findById(resourceId))!;
    resource.status = ResourceStatus.MAINTENANCE;
    await resources.update(resource);
    await expect(book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z')).rejects.toThrow(BusinessRuleError);
  });

  describe('скасування (FR-05)', () => {
    it('власник може скасувати не пізніше ніж за 15 хвилин до початку', async () => {
      const b = await book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
      clock.set(at('2026-12-01T09:45:00Z'));
      const cancelled = await service.cancelBooking(b.id, { id: 'u1', role: Role.EMPLOYEE });
      expect(cancelled.status).toBe(BookingStatus.CANCELLED);
    });

    it('власник не може скасувати менш ніж за 15 хвилин', async () => {
      const b = await book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
      clock.set(at('2026-12-01T09:50:00Z'));
      await expect(service.cancelBooking(b.id, { id: 'u1', role: Role.EMPLOYEE })).rejects.toThrow(
        BusinessRuleError,
      );
    });

    it('інший співробітник не може скасувати чуже бронювання', async () => {
      const b = await book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
      await expect(service.cancelBooking(b.id, { id: 'u2', role: Role.EMPLOYEE })).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('адміністратор скасовує примусово, власник отримує сповіщення', async () => {
      const b = await book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
      clock.set(at('2026-12-01T09:55:00Z'));
      await service.cancelBooking(b.id, { id: 'admin', role: Role.ADMIN });
      expect(notifier.sent.at(-1)).toMatchObject({
        type: NotificationType.BOOKING_CANCELLED_BY_ADMIN,
        userId: 'u1',
      });
    });
  });
});
