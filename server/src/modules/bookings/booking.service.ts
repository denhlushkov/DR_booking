import { randomUUID } from 'node:crypto';
import { Booking } from '../../domain/booking';
import { NotificationType, Role } from '../../domain/enums';
import type { Resource } from '../../domain/resource';
import type { Actor, IdGenerator } from '../../shared/actor';
import type { IClock } from '../../shared/clock';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors';
import type { TimeRange } from '../../shared/time-range';
import { type INotificationService, notifySafely } from '../notifications/notification.service';
import type { IResourceRepository } from '../resources/resource.repository';
import type { TransactionalRepositories, IUnitOfWork } from '../unit-of-work';
import type { IBookingRepository } from './booking.repository';
import type { BookingPolicy } from './booking.policy';

export interface CreateBookingInput {
  userId: string;
  resourceId: string;
  startTime: Date;
  endTime: Date;
}

export interface RescheduleInput {
  startTime: Date;
  endTime: Date;
}

/**
 * Сервіс бронювань: FR-03 (створення), FR-04 (контроль колізій),
 * FR-05 (скасування), FR-11 (сповіщення про створення, зміну, скасування).
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

    const { booking, resource } = await this.uow.run(async (repos) => {
      const resource = await lockFreeResource(repos, input.resourceId, range);
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
      await repos.bookings.insert(created);
      return { booking: created, resource };
    });

    await this.notify(NotificationType.BOOKING_CREATED, booking, resource.name);
    return booking;
  }

  /** Зміна часу власного бронювання з тією самою транзакційною перевіркою колізій. */
  async rescheduleBooking(bookingId: string, input: RescheduleInput, actor: Actor): Promise<Booking> {
    const range: TimeRange = { start: input.startTime, end: input.endTime };
    this.policy.assertValidInterval(range);

    const { booking, resource } = await this.uow.run(async (repos) => {
      const booking = await repos.bookings.findById(bookingId);
      if (!booking) throw new NotFoundError('Бронювання не знайдено');
      if (booking.userId !== actor.id) throw new ForbiddenError('Змінювати можна лише власні бронювання');
      this.policy.assertCanReschedule(booking);

      const resource = await lockFreeResource(repos, booking.resourceId, range, booking.id);
      booking.reschedule(input.startTime, input.endTime);
      await repos.bookings.save(booking);
      return { booking, resource };
    });

    await this.notify(NotificationType.BOOKING_UPDATED, booking, resource.name);
    return booking;
  }

  /** FR-02, FR-05: бронювання поточного користувача. */
  listUserBookings(userId: string): Promise<Booking[]> {
    return this.bookings.findByUser(userId);
  }

  /**
   * FR-05: співробітник скасовує власне бронювання не пізніше ніж за 15 хв.
   * Адміністратор може примусово скасувати будь-яке бронювання (зі сповіщенням власника).
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
    const type = isOwner ? NotificationType.BOOKING_CANCELLED : NotificationType.BOOKING_CANCELLED_BY_ADMIN;
    await this.notify(type, booking, resource?.name ?? booking.resourceId);
    return booking;
  }

  private notify(type: NotificationType, booking: Booking, resourceName: string): Promise<void> {
    return notifySafely(this.notifier, {
      type,
      userId: booking.userId,
      bookingId: booking.id,
      resourceName,
      startTime: booking.startTime,
      endTime: booking.endTime,
    });
  }
}

/**
 * Блокує рядок ресурсу (SELECT … FOR UPDATE) і перевіряє, що він доступний та вільний на інтервал.
 * Усі транзакції бронювання одного ресурсу через це блокування виконуються послідовно (FR-04).
 */
async function lockFreeResource(
  repos: TransactionalRepositories,
  resourceId: string,
  range: TimeRange,
  excludeBookingId?: string,
): Promise<Resource> {
  const resource = await repos.resources.findByIdForUpdate(resourceId);
  if (!resource) throw new NotFoundError('Ресурс не знайдено');
  if (!resource.isBookable()) throw new BusinessRuleError('Ресурс тимчасово недоступний для бронювання');

  const overlapping = await repos.bookings.findActiveOverlapping(range, {
    resourceIds: [resource.id],
    excludeBookingId,
  });
  if (!resource.isAvailable(range.start, range.end, overlapping)) {
    throw new ConflictError('Обраний час уже зайнятий');
  }
  return resource;
}
