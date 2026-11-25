import type { Notification } from '../../domain/notification';
import type { IClock } from '../../shared/clock';
import { NotFoundError } from '../../shared/errors';
import type { INotificationRepository } from './notification.repository';

export interface Inbox {
  items: Notification[];
  unreadCount: number;
}

/** Перегляд і позначення прочитаними сповіщень користувача (FR-11). */
export class NotificationInboxService {
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly clock: IClock,
  ) {}

  async list(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}): Promise<Inbox> {
    const [items, unreadCount] = await Promise.all([
      this.notifications.findByUser(userId, { unreadOnly: options.unreadOnly, limit: options.limit ?? 50 }),
      this.notifications.countUnread(userId),
    ]);
    return { items, unreadCount };
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notifications.findById(id);
    // Чуже сповіщення не розкриваємо: для користувача його «не існує».
    if (!notification || notification.userId !== userId) throw new NotFoundError('Сповіщення не знайдено');
    notification.markRead(this.clock.now());
    await this.notifications.save(notification);
    return notification;
  }

  markAllRead(userId: string): Promise<number> {
    return this.notifications.markAllRead(userId, this.clock.now());
  }
}
