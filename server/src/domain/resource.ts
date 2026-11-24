import type { Booking } from './booking';
import { ResourceStatus, ResourceType } from './enums';

/** Довільні атрибути ресурсу (JSON у БД): зона, місткість, обладнання. */
export interface ResourceAttributes {
  zone?: string;
  capacity?: number;
  equipment?: string[];
  [key: string]: unknown;
}

export interface ResourceProps {
  id: string;
  name: string;
  type: ResourceType;
  floor: number;
  status: ResourceStatus;
  attributes: ResourceAttributes;
}

/** Робоче місце або переговорна кімната (діаграма класів: Resource). */
export class Resource {
  readonly id: string;
  name: string;
  readonly type: ResourceType;
  floor: number;
  status: ResourceStatus;
  attributes: ResourceAttributes;

  constructor(props: ResourceProps) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.floor = props.floor;
    this.status = props.status;
    this.attributes = props.attributes;
  }

  /** Ресурс не заблокований адміністратором і не на обслуговуванні. */
  isBookable(): boolean {
    return this.status === ResourceStatus.AVAILABLE;
  }

  /**
   * Чи вільний ресурс на інтервал (FR-04, FR-09).
   * @param bookings наявні бронювання, серед яких шукаються активні перетини
   */
  isAvailable(startTime: Date, endTime: Date, bookings: readonly Booking[] = []): boolean {
    if (!this.isBookable()) return false;
    const range = { start: startTime, end: endTime };
    return !bookings.some((b) => b.resourceId === this.id && b.isActive() && b.overlaps(range));
  }

  /** FR-12: місткість перевіряється лише для переговорних кімнат. */
  fitsParticipants(participants: number): boolean {
    if (this.type !== ResourceType.MEETING_ROOM) return true;
    return (this.attributes.capacity ?? 0) >= participants;
  }

  /** FR-09: ресурс має все потрібне обладнання (без урахування регістру). */
  hasEquipment(required: readonly string[]): boolean {
    const available = new Set((this.attributes.equipment ?? []).map((e) => e.toLowerCase()));
    return required.every((item) => available.has(item.toLowerCase()));
  }
}
