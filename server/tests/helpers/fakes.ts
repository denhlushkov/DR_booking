import { ResourceStatus, ResourceType } from '../../src/domain/enums';
import { Resource, type ResourceProps } from '../../src/domain/resource';
import type {
  BookingNotification,
  INotificationService,
} from '../../src/modules/notifications/notification.service';
import type { IClock } from '../../src/shared/clock';

/** Годинник, час якого контролює тест. */
export class FixedClock implements IClock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date): void {
    this.current = date;
  }
}

/** Збирає надіслані сповіщення замість реальної доставки. */
export class FakeNotifier implements INotificationService {
  readonly sent: BookingNotification[] = [];

  async send(notification: BookingNotification): Promise<void> {
    this.sent.push(notification);
  }
}

export const at = (iso: string) => new Date(iso);

let seq = 0;
export function makeResource(overrides: Partial<ResourceProps> = {}): Resource {
  seq += 1;
  return new Resource({
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    name: `Resource ${seq}`,
    type: ResourceType.DESK,
    floor: 1,
    status: ResourceStatus.AVAILABLE,
    attributes: {},
    ...overrides,
  });
}
