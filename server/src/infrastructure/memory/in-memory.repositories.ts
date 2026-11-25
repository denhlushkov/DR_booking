import { Booking } from '../../domain/booking';
import { BookingStatus, type ResourceStatus } from '../../domain/enums';
import { Notification } from '../../domain/notification';
import { Resource } from '../../domain/resource';
import { User } from '../../domain/user';
import type { IBookingRepository, OverlapQuery } from '../../modules/bookings/booking.repository';
import type {
  INotificationRepository,
  NotificationQuery,
} from '../../modules/notifications/notification.repository';
import type {
  IResourceStatusHistoryRepository,
  ResourceDowntime,
} from '../../modules/resources/resource-status-history.repository';
import type { IResourceRepository, ResourceQuery } from '../../modules/resources/resource.repository';
import type { IUnitOfWork, TransactionalRepositories } from '../../modules/unit-of-work';
import type { IUserRepository } from '../../modules/users/user.repository';
import { rangesOverlap, type TimeRange } from '../../shared/time-range';

/*
 * In-memory реалізації репозиторіїв для локальної розробки без БД і для тестів.
 * Об'єкти копіюються при читанні/записі, щоб поведінка була схожа на справжнє сховище.
 */

const cloneUser = (u: User) => new User({ ...u });
const cloneResource = (r: Resource) => new Resource({ ...r, attributes: structuredClone(r.attributes) });
const cloneBooking = (b: Booking) => new Booking({ ...b });
const cloneNotification = (n: Notification) => new Notification({ ...n });

export class InMemoryUserRepository implements IUserRepository {
  private readonly items = new Map<string, User>();

  async findById(id: string) {
    const u = this.items.get(id);
    return u ? cloneUser(u) : null;
  }

  async findByEmail(email: string) {
    const normalized = email.toLowerCase();
    const u = [...this.items.values()].find((x) => x.email === normalized);
    return u ? cloneUser(u) : null;
  }

  async findAll() {
    return [...this.items.values()].map(cloneUser);
  }

  async insert(user: User) {
    this.items.set(user.id, cloneUser(user));
  }
}

export class InMemoryResourceRepository implements IResourceRepository {
  private readonly items = new Map<string, Resource>();

  async findById(id: string) {
    const r = this.items.get(id);
    return r ? cloneResource(r) : null;
  }

  /** Блокування забезпечує InMemoryUnitOfWork, який виконує транзакції послідовно. */
  findByIdForUpdate(id: string) {
    return this.findById(id);
  }

  async findAll(query: ResourceQuery = {}) {
    return [...this.items.values()]
      .filter((r) => query.type === undefined || r.type === query.type)
      .filter((r) => query.floor === undefined || r.floor === query.floor)
      .filter((r) => query.status === undefined || r.status === query.status)
      .filter((r) => query.zone === undefined || r.attributes.zone === query.zone)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(cloneResource);
  }

  async insert(resource: Resource) {
    this.items.set(resource.id, cloneResource(resource));
  }

  async update(resource: Resource) {
    this.items.set(resource.id, cloneResource(resource));
  }
}

export class InMemoryBookingRepository implements IBookingRepository {
  private readonly items = new Map<string, Booking>();

  async findById(id: string) {
    const b = this.items.get(id);
    return b ? cloneBooking(b) : null;
  }

  async findByUser(userId: string) {
    return this.all()
      .filter((b) => b.userId === userId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  async findActiveOverlapping(range: TimeRange, query: OverlapQuery = {}) {
    return this.all()
      .filter((b) => b.status === BookingStatus.CONFIRMED && rangesOverlap(b.range, range))
      .filter((b) => !query.resourceIds || query.resourceIds.includes(b.resourceId))
      .filter((b) => b.id !== query.excludeBookingId);
  }

  async findUpcomingForResource(resourceId: string, now: Date) {
    return this.all().filter(
      (b) => b.resourceId === resourceId && b.status === BookingStatus.CONFIRMED && b.endTime > now,
    );
  }

  async findForReport(period: TimeRange) {
    return this.all().filter(
      (b) =>
        (b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.COMPLETED) &&
        rangesOverlap(b.range, period),
    );
  }

  async insert(booking: Booking) {
    this.items.set(booking.id, cloneBooking(booking));
  }

  async save(booking: Booking) {
    this.items.set(booking.id, cloneBooking(booking));
  }

  async completeEndedBefore(now: Date) {
    let count = 0;
    for (const b of this.items.values()) {
      if (b.status === BookingStatus.CONFIRMED && b.endTime <= now) {
        b.complete();
        count += 1;
      }
    }
    return count;
  }

  async claimDueReminders(now: Date, windowEnd: Date) {
    const due: Booking[] = [];
    for (const b of this.items.values()) {
      if (b.status === BookingStatus.CONFIRMED && !b.reminderSentAt && b.startTime > now && b.startTime <= windowEnd) {
        b.reminderSentAt = now;
        due.push(cloneBooking(b));
      }
    }
    return due;
  }

  private all() {
    return [...this.items.values()].map(cloneBooking);
  }
}

export class InMemoryResourceStatusHistoryRepository implements IResourceStatusHistoryRepository {
  private readonly items: Array<ResourceDowntime & { id: string }> = [];

  async closeOpen(resourceId: string, at: Date) {
    for (const item of this.items) {
      if (item.resourceId === resourceId && item.endedAt === null) item.endedAt = at;
    }
  }

  async open(id: string, resourceId: string, status: ResourceStatus, at: Date) {
    this.items.push({ id, resourceId, status, startedAt: at, endedAt: null });
  }

  async findOverlapping(period: TimeRange) {
    return this.items
      .filter((d) => d.startedAt < period.end && (d.endedAt === null || d.endedAt > period.start))
      .map(({ id: _id, ...rest }) => ({ ...rest }));
  }
}

export class InMemoryNotificationRepository implements INotificationRepository {
  private readonly items = new Map<string, Notification>();

  async insert(n: Notification) {
    this.items.set(n.id, cloneNotification(n));
  }

  async findById(id: string) {
    const n = this.items.get(id);
    return n ? cloneNotification(n) : null;
  }

  async findByUser(userId: string, query: NotificationQuery = {}) {
    // reverse() + стабільне сортування: при однаковому часі новіше додане — першим.
    return [...this.items.values()]
      .reverse()
      .filter((n) => n.userId === userId && (!query.unreadOnly || !n.isRead()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, query.limit ?? Number.POSITIVE_INFINITY)
      .map(cloneNotification);
  }

  async countUnread(userId: string) {
    return [...this.items.values()].filter((n) => n.userId === userId && !n.isRead()).length;
  }

  async save(n: Notification) {
    this.items.set(n.id, cloneNotification(n));
  }

  async markAllRead(userId: string, at: Date) {
    let count = 0;
    for (const n of this.items.values()) {
      if (n.userId === userId && !n.isRead()) {
        n.markRead(at);
        count += 1;
      }
    }
    return count;
  }
}

/**
 * Послідовне виконання транзакцій через ланцюжок промісів (аналог блокування рядка).
 * Відкату змін немає — для розробки й тестів цього достатньо; у робочому режимі — PgUnitOfWork.
 */
export class InMemoryUnitOfWork implements IUnitOfWork {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly repos: TransactionalRepositories) {}

  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => work(this.repos));
    this.tail = result.catch(() => undefined);
    return result;
  }
}
