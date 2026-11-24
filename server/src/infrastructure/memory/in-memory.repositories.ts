import { Booking } from '../../domain/booking';
import { BookingStatus } from '../../domain/enums';
import { Resource } from '../../domain/resource';
import { User } from '../../domain/user';
import type { IBookingRepository } from '../../modules/bookings/booking.repository';
import type {
  IUnitOfWork,
  TransactionalRepositories,
} from '../../modules/bookings/unit-of-work';
import type { IResourceRepository, ResourceQuery } from '../../modules/resources/resource.repository';
import type { IUserRepository } from '../../modules/users/user.repository';
import { rangesOverlap, type TimeRange } from '../../shared/time-range';

/*
 * In-memory реалізації репозиторіїв для локальної розробки без БД і для тестів.
 * Об'єкти копіюються при читанні/записі, щоб поведінка була схожа на справжнє сховище.
 */

const cloneUser = (u: User) => new User({ ...u });
const cloneResource = (r: Resource) => new Resource({ ...r, attributes: structuredClone(r.attributes) });
const cloneBooking = (b: Booking) => new Booking({ ...b });

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
    return [...this.items.values()]
      .filter((b) => b.userId === userId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .map(cloneBooking);
  }

  async findActiveOverlapping(range: TimeRange, resourceIds?: readonly string[]) {
    return this.filter(range, [BookingStatus.CONFIRMED], resourceIds);
  }

  async findForReport(period: TimeRange) {
    return this.filter(period, [BookingStatus.CONFIRMED, BookingStatus.COMPLETED]);
  }

  async insert(booking: Booking) {
    this.items.set(booking.id, cloneBooking(booking));
  }

  async save(booking: Booking) {
    this.items.set(booking.id, cloneBooking(booking));
  }

  private filter(range: TimeRange, statuses: BookingStatus[], resourceIds?: readonly string[]) {
    return [...this.items.values()]
      .filter((b) => statuses.includes(b.status))
      .filter((b) => !resourceIds || resourceIds.includes(b.resourceId))
      .filter((b) => rangesOverlap(b.range, range))
      .map(cloneBooking);
  }
}

/**
 * Послідовне виконання транзакцій через ланцюжок промісів (аналог блокування рядка).
 * Відкату змін немає — запис виконується останнім кроком роботи, тому для MVP цього достатньо.
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
