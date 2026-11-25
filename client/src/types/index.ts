/** DTO, що повертає REST API (див. docs/api.md). */

export type Role = 'EMPLOYEE' | 'ADMIN';
export type ResourceType = 'DESK' | 'MEETING_ROOM';
export type ResourceStatus = 'AVAILABLE' | 'MAINTENANCE' | 'BLOCKED';
export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  department: string;
  position: string;
}

export interface ResourceAttributes {
  zone?: string;
  capacity?: number;
  equipment?: string[];
}

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  floor: number;
  status: ResourceStatus;
  attributes: ResourceAttributes;
}

export interface Booking {
  id: string;
  userId: string;
  resourceId: string;
  /** ISO 8601 */
  startTime: string;
  endTime: string;
  status: BookingStatus;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: UserProfile;
}

/** Параметри пошуку ресурсів (FR-09, FR-12). */
export interface ResourceSearchParams {
  type?: ResourceType;
  floor?: number;
  zone?: string;
  from?: string;
  to?: string;
  equipment?: string[];
  participants?: number;
}

export interface CreateResourceRequest {
  name: string;
  type: ResourceType;
  floor: number;
  attributes?: ResourceAttributes;
}

/** Відповідь на зміну статусу ресурсу (FR-06). */
export interface StatusChangeResult {
  resource: Resource;
  cancelledBookings: number;
}

/** Зайнятий інтервал у календарі ресурсу (FR-10). */
export interface BusySlot {
  bookingId: string;
  startTime: string;
  endTime: string;
}

export type NotificationType =
  | 'BOOKING_CREATED'
  | 'BOOKING_UPDATED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_CANCELLED_BY_ADMIN'
  | 'BOOKING_REMINDER';

/** Сповіщення користувача (FR-11). */
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  bookingId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface Inbox {
  items: AppNotification[];
  unreadCount: number;
}

/** FR-13: створення облікового запису адміністратором. */
export interface CreateUserRequest {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  department: string;
  position: string;
}
