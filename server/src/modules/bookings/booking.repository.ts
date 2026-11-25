import type { Booking } from '../../domain/booking';
import type { TimeRange } from '../../shared/time-range';

export interface OverlapQuery {
  resourceIds?: readonly string[];
  /** Виключити бронювання (при перенесенні воно не конфліктує саме з собою). */
  excludeBookingId?: string;
}

export interface IBookingRepository {
  findById(id: string): Promise<Booking | null>;
  findByUser(userId: string): Promise<Booking[]>;
  /** Активні (CONFIRMED) бронювання, що перетинаються з інтервалом. */
  findActiveOverlapping(range: TimeRange, query?: OverlapQuery): Promise<Booking[]>;
  /** Активні бронювання ресурсу, які ще не завершились на момент `now` (FR-06). */
  findUpcomingForResource(resourceId: string, now: Date): Promise<Booking[]>;
  /** Бронювання (CONFIRMED + COMPLETED), що перетинаються з періодом, — для аналітики. */
  findForReport(period: TimeRange): Promise<Booking[]>;
  insert(booking: Booking): Promise<void>;
  /** Зберігає статус, час слота і позначку нагадування. */
  save(booking: Booking): Promise<void>;
  /** Переводить у COMPLETED активні бронювання, що закінчились до `now` (FR-02). Повертає кількість. */
  completeEndedBefore(now: Date): Promise<number>;
  /**
   * Атомарно позначає й повертає бронювання, яким пора надіслати нагадування (FR-11):
   * активні, ще без нагадування, з початком у (now, windowEnd].
   */
  claimDueReminders(now: Date, windowEnd: Date): Promise<Booking[]>;
}
