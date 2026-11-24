import type { Booking } from '../../domain/booking';
import type { TimeRange } from '../../shared/time-range';

export interface IBookingRepository {
  findById(id: string): Promise<Booking | null>;
  findByUser(userId: string): Promise<Booking[]>;
  /** Активні (CONFIRMED) бронювання, що перетинаються з інтервалом. */
  findActiveOverlapping(range: TimeRange, resourceIds?: readonly string[]): Promise<Booking[]>;
  /** Бронювання (CONFIRMED + COMPLETED), що перетинаються з періодом, — для аналітики. */
  findForReport(period: TimeRange): Promise<Booking[]>;
  insert(booking: Booking): Promise<void>;
  save(booking: Booking): Promise<void>;
}
