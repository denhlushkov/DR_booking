import type { BookingStatus, ResourceStatus, ResourceType } from '../types';

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  DESK: 'Робоче місце',
  MEETING_ROOM: 'Переговорна кімната',
};

/** FR-08: «Вільний», «Зайнятий», «На обслуговуванні». */
export const RESOURCE_STATUS_LABELS: Record<ResourceStatus, string> = {
  AVAILABLE: 'Вільний',
  MAINTENANCE: 'На обслуговуванні',
  BLOCKED: 'Заблоковано',
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  CONFIRMED: 'Активне',
  CANCELLED: 'Скасоване',
  COMPLETED: 'Завершене',
};

const dateFormat = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });

/** «25.11.2026, 10:00–11:00» */
export function formatSlot(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${dateFormat.format(start)}, ${timeFormat.format(start)}–${timeFormat.format(end)}`;
}
