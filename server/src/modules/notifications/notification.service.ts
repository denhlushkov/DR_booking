export enum NotificationType {
  BOOKING_CREATED = 'BOOKING_CREATED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  BOOKING_CANCELLED_BY_ADMIN = 'BOOKING_CANCELLED_BY_ADMIN',
  BOOKING_REMINDER = 'BOOKING_REMINDER',
}

/** FR-11: сповіщення містить дату, час і назву ресурсу. */
export interface BookingNotification {
  type: NotificationType;
  userId: string;
  resourceName: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Канал доставки сповіщень. Нові канали (email, Slack, push) додаються
 * новими реалізаціями інтерфейсу без зміни BookingService (OCP + DIP).
 */
export interface INotificationService {
  send(notification: BookingNotification): Promise<void>;
}

/** Базова реалізація для MVP: пише сповіщення в лог сервера. */
export class ConsoleNotificationService implements INotificationService {
  async send(n: BookingNotification): Promise<void> {
    console.info(
      `[notification] ${n.type} user=${n.userId} resource="${n.resourceName}" ` +
        `${n.startTime.toISOString()} – ${n.endTime.toISOString()}`,
    );
  }
}
