import type { Booking } from '../types';
import { request } from './http';

export const bookingsApi = {
  /** FR-03; 409 — слот уже зайнятий (FR-04) */
  create: (resourceId: string, startTime: string, endTime: string) =>
    request<Booking>('/bookings', {
      method: 'POST',
      body: JSON.stringify({ resourceId, startTime, endTime }),
    }),

  /** FR-02, FR-05 */
  mine: () => request<Booking[]>('/bookings/me'),

  /** FR-05 */
  cancel: (id: string) => request<Booking>(`/bookings/${id}/cancel`, { method: 'POST' }),
};
