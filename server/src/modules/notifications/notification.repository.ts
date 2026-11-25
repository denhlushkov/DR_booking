import type { Notification } from '../../domain/notification';

export interface NotificationQuery {
  unreadOnly?: boolean;
  limit?: number;
}

export interface INotificationRepository {
  insert(notification: Notification): Promise<void>;
  findById(id: string): Promise<Notification | null>;
  /** Сповіщення користувача, новіші — першими. */
  findByUser(userId: string, query?: NotificationQuery): Promise<Notification[]>;
  countUnread(userId: string): Promise<number>;
  save(notification: Notification): Promise<void>;
  markAllRead(userId: string, at: Date): Promise<number>;
}
