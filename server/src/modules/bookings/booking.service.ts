import { randomUUID } from 'node:crypto';
import { Booking } from '../../domain/booking';
import { Role } from '../../domain/enums';
import type { Actor, IdGenerator } from '../../shared/actor';
import type { IClock } from '../../shared/clock';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors';
import type { TimeRange } from '../../shared/time-range';
import {
  type INotificationService,
  NotificationType,
} from '../notifications/notification.service';
import type { IResourceRepository } from '../resources/resource.repository';
import type { IBookingRepository } from './booking.repository';
import type { BookingPolicy } from './booking.policy';
import type { IUnitOfWork } from './unit-of-work';

export interface CreateBookingInput {
  userId: string;
  resourceId: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Сервіс бронювань: FR-03 (створення), FR-04 (контроль колізій),
 * FR-05 (скасування), FR-11 (сповіщення).
 */
export class BookingService {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly bookings: IBookingRepository,
    private readonly resources: IResourceRepository,
    private readonly policy: BookingPolicy,
    private readonly notifier: INotificationService,
    private readonly clock: IClock,
    private readonly newId: IdGenerator = randomUUID,
  ) {}

  /**
   * Сценарій з діаграми послідовностей (Лаб №2):
   * BEGIN → блокування ресурсу → пошук перетинів → INSERT → COMMIT (або ROLLBACK + 409).
   */
  async createBooking(input: CreateBookingInput): Promise<Booking> {
    const range: TimeRange = { start: input.startTime, end: input.endTime };
    this.policy.assertValidInterval(range);

    const { booking, resourceName } = await this.uow.run(async ({ bookings, resources }) => {
      const resource = await resources.findByIdForUpdate(input.resourceId);
      if (!resource) throw new NotFoundError('Ресурс не знайдено');
      if (!resource.isBookable()) {
        throw new BusinessRuleError('Ресурс тимчасово недоступний для бронювання');
      }

      const overlapping = await bookings.findActiveOverlapping(range, [resource.id]);
      if (!resource.isAvailable(range.start, range.end, overlapping)) {
        throw new ConflictError('Обраний час уже зайнятий');
      }

      const created = Booking.create(
        {
          id: this.newId(),
          userId: input.userId,
          resourceId: resource.id,
          startTime: input.startTime,
          endTime: input.endTime,
        },
        this.clock.now(),
      );
      await bookings.insert(created);
      return { booking: created, resourceName: resource.name };
    });

    await this.notify(NotificationType.BOOKING_CREATED, booking, resourceName);
    return booking;
  }

  /** FR-02, FR-05: бронювання поточного користувача. */
  listUserBookings(userId: string): Promise<Booking[]> {
    return this.bookings.findByUser(userId);
  }

  /**
   * FR-05: співробітник скасовує власне бронювання не пізніше ніж за 15 хв.
   * Адміністратор може примусово скасувати будь-яке бронювання (з сповіщенням власника).
   */
  async cancelBooking(bookingId: string, actor: Actor): Promise<Booking> {
    const booking = await this.bookings.findById(bookingId);
    if (!booking) throw new NotFoundError('Бронювання не знайдено');

    const isAdmin = actor.role === Role.ADMIN;
    const isOwner = booking.userId === actor.id;
    if (!isOwner && !isAdmin) throw new ForbiddenError('Можна скасовувати лише власні бронювання');
    if (!isAdmin) this.policy.assertCanCancel(booking);

    booking.cancel();
    await this.bookings.save(booking);

    const resource = await this.resources.findById(booking.resourceId);
    const type = isOwner
      ? NotificationType.BOOKING_CANCELLED
      : NotificationType.BOOKING_CANCELLED_BY_ADMIN;
    await this.notify(type, booking, resource?.name ?? booking.resourceId);
    return booking;
  }

  /** Сповіщення не повинні ламати основний сценарій: помилку лише логуємо. */
  private async notify(type: NotificationType, booking: Booking, resourceName: string): Promise<void> {
    try {
      await this.notifier.send({
        type,
        userId: booking.userId,
        resourceName,
        startTime: booking.startTime,
        endTime: booking.endTime,
      });
    } catch (error) {
      console.error('Не вдалося надіслати сповіщення', error);
    }
  }
}
