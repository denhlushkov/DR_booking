import { randomUUID } from 'node:crypto';
import type { Booking } from '../../domain/booking';
import { NotificationType, ResourceStatus, ResourceType } from '../../domain/enums';
import { Resource, type ResourceAttributes } from '../../domain/resource';
import type { IdGenerator } from '../../shared/actor';
import type { IClock } from '../../shared/clock';
import { NotFoundError, ValidationError } from '../../shared/errors';
import type { TimeRange } from '../../shared/time-range';
import type { IBookingRepository } from '../bookings/booking.repository';
import { type INotificationService, notifySafely } from '../notifications/notification.service';
import type { IUnitOfWork } from '../unit-of-work';
import type { IResourceRepository, ResourceQuery } from './resource.repository';

export interface ResourceSearchCriteria extends ResourceQuery {
  /** Інтервал, на який ресурс має бути вільним (FR-09). Задається лише разом із `to`. */
  from?: Date;
  to?: Date;
  equipment?: string[];
  /** FR-12: кількість учасників зустрічі. */
  participants?: number;
}

export interface CreateResourceInput {
  name: string;
  type: ResourceType;
  floor: number;
  attributes?: ResourceAttributes;
}

export type UpdateResourceInput = Partial<Pick<Resource, 'name' | 'floor' | 'attributes'>>;

/** Інтервал зайнятості без персональних даних — для календаря (FR-10). */
export interface BusySlot {
  bookingId: string;
  startTime: Date;
  endTime: Date;
}

export interface StatusChangeResult {
  resource: Resource;
  /** Кількість майбутніх бронювань, скасованих через недоступність ресурсу. */
  cancelledBookings: number;
}

const STATUS_REASON: Record<ResourceStatus, string> = {
  [ResourceStatus.AVAILABLE]: '',
  [ResourceStatus.MAINTENANCE]: 'Ресурс переведено на обслуговування',
  [ResourceStatus.BLOCKED]: 'Ресурс заблоковано адміністратором',
};

/** Каталог і керування ресурсами: FR-06, FR-08, FR-09, FR-10, FR-12. */
export class ResourceService {
  constructor(
    private readonly resources: IResourceRepository,
    private readonly bookings: IBookingRepository,
    private readonly uow: IUnitOfWork,
    private readonly notifier: INotificationService,
    private readonly clock: IClock,
    private readonly newId: IdGenerator = randomUUID,
  ) {}

  async search(criteria: ResourceSearchCriteria = {}): Promise<Resource[]> {
    const { from, to, equipment, participants, ...query } = criteria;
    let result = await this.resources.findAll(query);

    if (equipment?.length) result = result.filter((r) => r.hasEquipment(equipment));
    if (participants) result = result.filter((r) => r.fitsParticipants(participants));

    if (from || to) {
      if (!from || !to || to <= from) {
        throw new ValidationError('Для пошуку вільних ресурсів вкажіть коректний інтервал from < to');
      }
      const busy = await this.bookings.findActiveOverlapping(
        { start: from, end: to },
        { resourceIds: result.map((r) => r.id) },
      );
      result = result.filter((r) => r.isAvailable(from, to, busy));
    }
    return result;
  }

  async getById(id: string): Promise<Resource> {
    const resource = await this.resources.findById(id);
    if (!resource) throw new NotFoundError('Ресурс не знайдено');
    return resource;
  }

  /** FR-10: зайняті інтервали ресурсу на період (без даних про власників). */
  async getSchedule(resourceId: string, period: TimeRange): Promise<BusySlot[]> {
    if (period.end <= period.start) throw new ValidationError('Некоректний період');
    await this.getById(resourceId);
    const bookings = await this.bookings.findActiveOverlapping(period, { resourceIds: [resourceId] });
    return bookings
      .map((b) => ({ bookingId: b.id, startTime: b.startTime, endTime: b.endTime }))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  async create(input: CreateResourceInput): Promise<Resource> {
    const resource = new Resource({
      id: this.newId(),
      name: input.name,
      type: input.type,
      floor: input.floor,
      status: ResourceStatus.AVAILABLE,
      attributes: input.attributes ?? {},
    });
    await this.resources.insert(resource);
    return resource;
  }

  async update(id: string, patch: UpdateResourceInput): Promise<Resource> {
    const resource = await this.getById(id);
    if (patch.name !== undefined) resource.name = patch.name;
    if (patch.floor !== undefined) resource.floor = patch.floor;
    if (patch.attributes !== undefined) resource.attributes = patch.attributes;
    await this.resources.update(resource);
    return resource;
  }

  /**
   * FR-06: зміна статусу ресурсу (обслуговування / блокування / повернення в роботу).
   * В одній транзакції: блокування рядка ресурсу (паралельне бронювання не «проскочить»),
   * запис періоду простою для звітів (FR-07) і примусове скасування майбутніх бронювань.
   * Після COMMIT власники скасованих бронювань отримують сповіщення.
   */
  async changeStatus(id: string, status: ResourceStatus): Promise<StatusChangeResult> {
    const now = this.clock.now();
    const { resource, cancelled } = await this.uow.run(async (repos) => {
      const resource = await repos.resources.findByIdForUpdate(id);
      if (!resource) throw new NotFoundError('Ресурс не знайдено');
      if (resource.status === status) return { resource, cancelled: [] as Booking[] };

      resource.status = status;
      await repos.resources.update(resource);
      await repos.statusHistory.closeOpen(resource.id, now);

      const cancelled: Booking[] = [];
      if (status !== ResourceStatus.AVAILABLE) {
        await repos.statusHistory.open(this.newId(), resource.id, status, now);
        for (const booking of await repos.bookings.findUpcomingForResource(resource.id, now)) {
          booking.cancel();
          await repos.bookings.save(booking);
          cancelled.push(booking);
        }
      }
      return { resource, cancelled };
    });

    for (const booking of cancelled) {
      await notifySafely(this.notifier, {
        type: NotificationType.BOOKING_CANCELLED_BY_ADMIN,
        userId: booking.userId,
        bookingId: booking.id,
        resourceName: resource.name,
        startTime: booking.startTime,
        endTime: booking.endTime,
        reason: STATUS_REASON[status],
      });
    }
    return { resource, cancelledBookings: cancelled.length };
  }
}
