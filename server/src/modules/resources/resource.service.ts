import { randomUUID } from 'node:crypto';
import { ResourceStatus, ResourceType } from '../../domain/enums';
import { Resource, type ResourceAttributes } from '../../domain/resource';
import type { IdGenerator } from '../../shared/actor';
import { NotFoundError, ValidationError } from '../../shared/errors';
import type { TimeRange } from '../../shared/time-range';
import type { IBookingRepository } from '../bookings/booking.repository';
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

/** Каталог і керування ресурсами: FR-06, FR-08, FR-09, FR-10, FR-12. */
export class ResourceService {
  constructor(
    private readonly resources: IResourceRepository,
    private readonly bookings: IBookingRepository,
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
        result.map((r) => r.id),
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

  async getSchedule(resourceId: string, period: TimeRange): Promise<BusySlot[]> {
    await this.getById(resourceId);
    const bookings = await this.bookings.findActiveOverlapping(period, [resourceId]);
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
   * FR-06: тимчасове зняття з публікації (обслуговування / блокування).
   * TODO (Спринт 2): обробка майбутніх бронювань заблокованого ресурсу
   * з примусовим скасуванням і сповіщенням користувачів.
   */
  async changeStatus(id: string, status: ResourceStatus): Promise<Resource> {
    const resource = await this.getById(id);
    resource.status = status;
    await this.resources.update(resource);
    return resource;
  }
}
