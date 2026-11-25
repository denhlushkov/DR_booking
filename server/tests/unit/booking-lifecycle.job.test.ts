import { describe, expect, it } from 'vitest';
import { Booking } from '../../src/domain/booking';
import { BookingStatus, NotificationType } from '../../src/domain/enums';
import { BookingLifecycleJob } from '../../src/modules/bookings/booking-lifecycle.job';
import { at, FakeNotifier, FixedClock, makeResource, memoryStore } from '../helpers/fakes';

describe('BookingLifecycleJob (FR-02, FR-11)', () => {
  it('завершує минулі бронювання і надсилає нагадування один раз', async () => {
    const store = memoryStore();
    const notifier = new FakeNotifier();
    const clock = new FixedClock(at('2026-12-01T09:00:00Z'));
    const job = new BookingLifecycleJob(store.bookings, store.resources, notifier, clock, 30);

    const resource = makeResource({ name: 'Стіл A-101' });
    await store.resources.insert(resource);
    const add = (id: string, start: string, end: string) =>
      store.bookings.insert(
        Booking.create({ id, userId: 'u1', resourceId: resource.id, startTime: at(start), endTime: at(end) }, at('2026-11-30T00:00:00Z')),
      );
    await add('ended', '2026-12-01T07:00:00Z', '2026-12-01T08:00:00Z');
    await add('soon', '2026-12-01T09:20:00Z', '2026-12-01T10:00:00Z');
    await add('later', '2026-12-01T12:00:00Z', '2026-12-01T13:00:00Z');

    await expect(job.run()).resolves.toEqual({ completed: 1, reminders: 1 });
    expect((await store.bookings.findById('ended'))!.status).toBe(BookingStatus.COMPLETED);
    expect(notifier.sent).toEqual([
      expect.objectContaining({ type: NotificationType.BOOKING_REMINDER, bookingId: 'soon', resourceName: 'Стіл A-101' }),
    ]);

    // Повторний запуск не дублює нагадування.
    await expect(job.run()).resolves.toEqual({ completed: 0, reminders: 0 });

    // Коли настає час наступного бронювання — нагадування для нього.
    clock.set(at('2026-12-01T11:35:00Z'));
    await expect(job.run()).resolves.toEqual({ completed: 1, reminders: 1 });
    expect(notifier.sent.at(-1)?.bookingId).toBe('later');
  });
});
