import { randomUUID } from 'node:crypto';
import { NotificationType } from '../../domain/enums';
import { Notification } from '../../domain/notification';
import type { IdGenerator } from '../../shared/actor';
import type { IClock } from '../../shared/clock';
import { formatSlot } from '../../shared/time-format';
import type { INotificationRepository } from './notification.repository';

export { NotificationType };

/** FR-11: сповіщення містить дату, час і назву ресурсу. */
export interface BookingNotification {
  type: NotificationType;
  userId: string;
  bookingId: string;
  resourceName: string;
  startTime: Date;
  endTime: Date;
  /** Додаткове пояснення, напр. причина примусового скасування. */
  reason?: string;
}

/**
 * Канал доставки сповіщень. Нові канали (email, Slack, push) додаються
 * новими реалізаціями інтерфейсу без зміни сервісів бронювання (OCP + DIP).
 */
export interface INotificationService {
  send(notification: BookingNotification): Promise<void>;
}

const TITLES: Record<NotificationType, string> = {
  [NotificationType.BOOKING_CREATED]: 'Бронювання підтверджено',
  [NotificationType.BOOKING_UPDATED]: 'Бронювання змінено',
  [NotificationType.BOOKING_CANCELLED]: 'Бронювання скасовано',
  [NotificationType.BOOKING_CANCELLED_BY_ADMIN]: 'Бронювання скасовано адміністратором',
  [NotificationType.BOOKING_REMINDER]: 'Нагадування: бронювання скоро почнеться',
};

/** Сповіщення в особистому кабінеті: зберігаються в БД і показуються в інтерфейсі. */
export class InAppNotificationService implements INotificationService {
  constructor(
    private readonly repository: INotificationRepository,
    private readonly clock: IClock,
    private readonly timeZone: string,
    private readonly newId: IdGenerator = randomUUID,
  ) {}

  async send(n: BookingNotification): Promise<void> {
    const slot = formatSlot(n.startTime, n.endTime, this.timeZone);
    await this.repository.insert(
      new Notification({
        id: this.newId(),
        userId: n.userId,
        type: n.type,
        title: TITLES[n.type],
        message: `«${n.resourceName}», ${slot}${n.reason ? `. ${n.reason}` : ''}`,
        bookingId: n.bookingId,
        createdAt: this.clock.now(),
        readAt: null,
      }),
    );
  }
}

/** Пише сповіщення в лог сервера (аудит, налагодження). */
export class ConsoleNotificationService implements INotificationService {
  async send(n: BookingNotification): Promise<void> {
    console.info(
      `[notification] ${n.type} user=${n.userId} booking=${n.bookingId} resource="${n.resourceName}" ` +
        `${n.startTime.toISOString()} – ${n.endTime.toISOString()}`,
    );
  }
}

/** Розсилає сповіщення в усі канали; збій одного каналу не зупиняє інші. */
export class CompositeNotificationService implements INotificationService {
  constructor(private readonly channels: readonly INotificationService[]) {}

  async send(n: BookingNotification): Promise<void> {
    const results = await Promise.allSettled(this.channels.map((channel) => channel.send(n)));
    const errors = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
    if (errors.length) throw new AggregateError(errors, 'Не всі канали сповіщень спрацювали');
  }
}

/** Сповіщення не повинні ламати основний сценарій: помилку лише логуємо. */
export async function notifySafely(notifier: INotificationService, n: BookingNotification): Promise<void> {
  try {
    await notifier.send(n);
  } catch (error) {
    console.error('Не вдалося надіслати сповіщення', error);
  }
}
