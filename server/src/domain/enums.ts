/** Ролі користувачів (Лаб №1, розд. 2.2; діаграма класів — «enumeration Role»). */
export enum Role {
  EMPLOYEE = 'EMPLOYEE',
  ADMIN = 'ADMIN',
}

/** Типи ресурсів офісу. */
export enum ResourceType {
  DESK = 'DESK',
  MEETING_ROOM = 'MEETING_ROOM',
}

/** Стан ресурсу, який встановлює адміністратор (FR-06). */
export enum ResourceStatus {
  AVAILABLE = 'AVAILABLE',
  MAINTENANCE = 'MAINTENANCE',
  BLOCKED = 'BLOCKED',
}

/** Життєвий цикл бронювання. */
export enum BookingStatus {
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

/** Типи сповіщень користувача (FR-11). */
export enum NotificationType {
  BOOKING_CREATED = 'BOOKING_CREATED',
  BOOKING_UPDATED = 'BOOKING_UPDATED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  BOOKING_CANCELLED_BY_ADMIN = 'BOOKING_CANCELLED_BY_ADMIN',
  BOOKING_REMINDER = 'BOOKING_REMINDER',
}
