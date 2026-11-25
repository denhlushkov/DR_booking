import { beforeEach, describe, expect, it } from 'vitest';
import { BookingStatus, NotificationType, ResourceStatus, Role } from '../../src/domain/enums';
import { BookingPolicy, DEFAULT_BOOKING_RULES } from '../../src/modules/bookings/booking.policy';
import { BookingService } from '../../src/modules/bookings/booking.service';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../../src/shared/errors';
import { at, FakeNotifier, FixedClock, makeResource, memoryStore } from '../helpers/fakes';

describe('BookingService', () => {
  const NOW = at('2026-12-01T08:00:00Z');
  let clock: FixedClock;
  let notifier: FakeNotifier;
  let store: ReturnType<typeof memoryStore>;
  let service: BookingService;
  let resourceId: string;

  beforeEach(async () => {
    clock = new FixedClock(NOW);
    notifier = new FakeNotifier();
    store = memoryStore();
    service = new BookingService(
      store.uow,
      store.bookings,
      store.resources,
      new BookingPolicy(DEFAULT_BOOKING_RULES, clock),
      notifier,
      clock,
    );
    const resource = makeResource({ name: 'Стіл A-101' });
    resourceId = resource.id;
    await store.resources.insert(resource);
  });

  const book = (userId: string, start: string, end: string, id = resourceId) =>
    service.createBooking({ userId, resourceId: id, startTime: at(start), endTime: at(end) });

  it('створює бронювання та надсилає сповіщення (FR-03, FR-11)', async () => {
    const booking = await book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
    expect(booking.status).toBe(BookingStatus.CONFIRMED);
    expect(notifier.sent).toEqual([
      expect.objectContaining({
        type: NotificationType.BOOKING_CREATED,
        bookingId: booking.id,
        resourceName: 'Стіл A-101',
      }),
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
    const resource = (await store.resources.findById(resourceId))!;
    resource.status = ResourceStatus.MAINTENANCE;
    await store.resources.update(resource);
    await expect(book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z')).rejects.toThrow(BusinessRuleError);
  });

  describe('зміна часу бронювання', () => {
    it('переносить бронювання і надсилає сповіщення про зміну (FR-11)', async () => {
      const b = await book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
      const moved = await service.rescheduleBooking(
        b.id,
        { startTime: at('2026-12-01T10:30:00Z'), endTime: at('2026-12-01T12:00:00Z') },
        { id: 'u1', role: Role.EMPLOYEE },
      );
      expect(moved.startTime.toISOString()).toBe('2026-12-01T10:30:00.000Z');
      expect(notifier.sent.at(-1)?.type).toBe(NotificationType.BOOKING_UPDATED);
    });

    it('не дозволяє перенести на зайнятий час (FR-04)', async () => {
      const b = await book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
      await book('u2', '2026-12-01T12:00:00Z', '2026-12-01T13:00:00Z');
      await expect(
        service.rescheduleBooking(
          b.id,
          { startTime: at('2026-12-01T11:30:00Z'), endTime: at('2026-12-01T12:30:00Z') },
          { id: 'u1', role: Role.EMPLOYEE },
        ),
      ).rejects.toThrow(ConflictError);
    });

    it('не дозволяє змінювати чуже бронювання', async () => {
      const b = await book('u1', '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
      await expect(
        service.rescheduleBooking(
          b.id,
          { startTime: at('2026-12-01T14:00:00Z'), endTime: at('2026-12-01T15:00:00Z') },
          { id: 'u2', role: Role.EMPLOYEE },
        ),
      ).rejects.toThrow(ForbiddenError);
    });
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
