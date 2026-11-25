import type { NotificationType } from './enums';

export interface NotificationProps {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  /** Містить назву ресурсу, дату й час (FR-11). */
  message: string;
  bookingId: string | null;
  createdAt: Date;
  readAt: Date | null;
}

/** Сповіщення в особистому кабінеті користувача (FR-11). */
export class Notification {
  readonly id: string;
  readonly userId: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly bookingId: string | null;
  readonly createdAt: Date;
  readAt: Date | null;

  constructor(props: NotificationProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.type = props.type;
    this.title = props.title;
    this.message = props.message;
    this.bookingId = props.bookingId;
    this.createdAt = props.createdAt;
    this.readAt = props.readAt;
  }

  isRead(): boolean {
    return this.readAt !== null;
  }

  markRead(at: Date): void {
    if (!this.readAt) this.readAt = at;
  }
}
