import { beforeEach, describe, expect, it } from 'vitest';
import { Booking } from '../../src/domain/booking';
import { BookingStatus, NotificationType, ResourceStatus } from '../../src/domain/enums';
import { ResourceService } from '../../src/modules/resources/resource.service';
import { at, FakeNotifier, FixedClock, makeResource, memoryStore } from '../helpers/fakes';

describe('ResourceService.changeStatus (FR-06)', () => {
  const NOW = at('2026-12-01T09:00:00Z');
  let store: ReturnType<typeof memoryStore>;
  let notifier: FakeNotifier;
  let service: ResourceService;
  let resourceId: string;

  const addBooking = async (id: string, start: string, end: string) => {
    const b = Booking.create({ id, userId: `user-${id}`, resourceId, startTime: at(start), endTime: at(end) }, NOW);
    await store.bookings.insert(b);
  };

  beforeEach(async () => {
    store = memoryStore();
    notifier = new FakeNotifier();
    service = new ResourceService(store.resources, store.bookings, store.uow, notifier, new FixedClock(NOW));
    const resource = makeResource({ name: 'Переговорна «Київ»' });
    resourceId = resource.id;
    await store.resources.insert(resource);
    await addBooking('past', '2026-12-01T06:00:00Z', '2026-12-01T07:00:00Z');
    await addBooking('ongoing', '2026-12-01T08:30:00Z', '2026-12-01T09:30:00Z');
    await addBooking('future', '2026-12-02T10:00:00Z', '2026-12-02T11:00:00Z');
  });

  it('скасовує поточні й майбутні бронювання та сповіщає власників', async () => {
    const result = await service.changeStatus(resourceId, ResourceStatus.MAINTENANCE);

    expect(result.resource.status).toBe(ResourceStatus.MAINTENANCE);
    expect(result.cancelledBookings).toBe(2);
    expect((await store.bookings.findById('past'))!.status).toBe(BookingStatus.CONFIRMED);
    expect((await store.bookings.findById('future'))!.status).toBe(BookingStatus.CANCELLED);
    expect(notifier.sent.map((n) => [n.type, n.userId])).toEqual([
      [NotificationType.BOOKING_CANCELLED_BY_ADMIN, 'user-ongoing'],
      [NotificationType.BOOKING_CANCELLED_BY_ADMIN, 'user-future'],
    ]);
    expect(notifier.sent[0].reason).toMatch(/обслуговування/);
  });

  it('записує період простою і закриває його при поверненні в роботу (FR-07)', async () => {
    const day = { start: at('2026-12-01T00:00:00Z'), end: at('2026-12-02T00:00:00Z') };
    await service.changeStatus(resourceId, ResourceStatus.BLOCKED);
    expect(await store.statusHistory.findOverlapping(day)).toEqual([
      expect.objectContaining({ resourceId, status: ResourceStatus.BLOCKED, endedAt: null }),
    ]);

    await service.changeStatus(resourceId, ResourceStatus.AVAILABLE);
    const [period] = await store.statusHistory.findOverlapping(day);
    expect(period.endedAt).toEqual(NOW);
  });

  it('повторне встановлення того самого статусу нічого не змінює', async () => {
    const result = await service.changeStatus(resourceId, ResourceStatus.AVAILABLE);
    expect(result.cancelledBookings).toBe(0);
    expect(notifier.sent).toHaveLength(0);
  });
});
