import type { AppNotification, Inbox } from '../types';
import { request } from './http';

/** FR-11: сповіщення користувача. */
export const notificationsApi = {
  inbox: (limit = 20) => request<Inbox>('/notifications/me', { query: { limit } }),
  markRead: (id: string) => request<AppNotification>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
};
