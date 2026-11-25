import { NotificationType } from '../../domain/enums';
import type { IClock } from '../../shared/clock';
import { type INotificationService, notifySafely } from '../notifications/notification.service';
import type { IResourceRepository } from '../resources/resource.repository';
import type { IBookingRepository } from './booking.repository';

export interface LifecycleRunResult {
  completed: number;
  reminders: number;
}

/**
 * Фонова задача життєвого циклу бронювань (запускається планувальником щохвилини):
 * - FR-02: переводить завершені слоти в статус COMPLETED;
 * - FR-11: надсилає нагадування за N хвилин до початку.
 * Нагадування «захоплюються» атомарно в БД, тому дублікатів немає навіть при кількох екземплярах API.
 */
export class BookingLifecycleJob {
  constructor(
    private readonly bookings: IBookingRepository,
    private readonly resources: IResourceRepository,
    private readonly notifier: INotificationService,
    private readonly clock: IClock,
    private readonly reminderMinutesBefore: number,
  ) {}

  async run(): Promise<LifecycleRunResult> {
    const now = this.clock.now();
    const completed = await this.bookings.completeEndedBefore(now);

    const windowEnd = new Date(now.getTime() + this.reminderMinutesBefore * 60_000);
    const due = await this.bookings.claimDueReminders(now, windowEnd);
    for (const booking of due) {
      const resource = await this.resources.findById(booking.resourceId);
      await notifySafely(this.notifier, {
        type: NotificationType.BOOKING_REMINDER,
        userId: booking.userId,
        bookingId: booking.id,
        resourceName: resource?.name ?? booking.resourceId,
        startTime: booking.startTime,
        endTime: booking.endTime,
      });
    }
    return { completed, reminders: due.length };
  }
}
