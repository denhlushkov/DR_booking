import type { Pool } from 'pg';
import { Booking } from '../../domain/booking';
import type { BookingStatus, NotificationType, ResourceStatus, ResourceType, Role } from '../../domain/enums';
import { Notification } from '../../domain/notification';
import { Resource, type ResourceAttributes } from '../../domain/resource';
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
import { ConflictError } from '../../shared/errors';
import type { TimeRange } from '../../shared/time-range';
import { PG_EXCLUSION_VIOLATION, PG_UNIQUE_VIOLATION, type Queryable, isPgError } from './pool';

// ---------- Users ----------

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: Role;
  department: string;
  position: string;
}

const toUser = (r: UserRow) =>
  new User({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    department: r.department,
    position: r.position,
  });

export class PgUserRepository implements IUserRepository {
  constructor(private readonly db: Queryable) {}

  async findById(id: string) {
    const { rows } = await this.db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findByEmail(email: string) {
    const { rows } = await this.db.query<UserRow>('SELECT * FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findAll() {
    const { rows } = await this.db.query<UserRow>('SELECT * FROM users ORDER BY full_name');
    return rows.map(toUser);
  }

  async insert(u: User) {
    try {
      await this.db.query(
        `INSERT INTO users (id, full_name, email, password_hash, role, department, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [u.id, u.fullName, u.email, u.passwordHash, u.role, u.department, u.position],
      );
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ConflictError('Користувач з такою електронною поштою вже існує');
      }
      throw error;
    }
  }
}

// ---------- Resources ----------

interface ResourceRow {
  id: string;
  name: string;
  type: ResourceType;
  floor: number;
  status: ResourceStatus;
  attributes: ResourceAttributes;
}

const toResource = (r: ResourceRow) => new Resource({ ...r });

export class PgResourceRepository implements IResourceRepository {
  constructor(private readonly db: Queryable) {}

  async findById(id: string) {
    const { rows } = await this.db.query<ResourceRow>('SELECT * FROM resources WHERE id = $1', [id]);
    return rows[0] ? toResource(rows[0]) : null;
  }

  async findByIdForUpdate(id: string) {
    const { rows } = await this.db.query<ResourceRow>(
      'SELECT * FROM resources WHERE id = $1 FOR UPDATE',
      [id],
    );
    return rows[0] ? toResource(rows[0]) : null;
  }

  async findAll(query: ResourceQuery = {}) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (query.type !== undefined) add('type = ?', query.type);
    if (query.floor !== undefined) add('floor = ?', query.floor);
    if (query.status !== undefined) add('status = ?', query.status);
    if (query.zone !== undefined) add(`attributes->>'zone' = ?`, query.zone);

    const sql = `SELECT * FROM resources ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY name`;
    const { rows } = await this.db.query<ResourceRow>(sql, params);
    return rows.map(toResource);
  }

  async insert(r: Resource) {
    await this.db.query(
      `INSERT INTO resources (id, name, type, floor, status, attributes) VALUES ($1, $2, $3, $4, $5, $6)`,
      [r.id, r.name, r.type, r.floor, r.status, JSON.stringify(r.attributes)],
    );
  }

  async update(r: Resource) {
    await this.db.query(
      `UPDATE resources SET name = $2, floor = $3, status = $4, attributes = $5 WHERE id = $1`,
      [r.id, r.name, r.floor, r.status, JSON.stringify(r.attributes)],
    );
  }
}

// ---------- Resource status history ----------

interface DowntimeRow {
  resource_id: string;
  status: ResourceStatus;
  started_at: Date;
  ended_at: Date | null;
}

export class PgResourceStatusHistoryRepository implements IResourceStatusHistoryRepository {
  constructor(private readonly db: Queryable) {}

  async closeOpen(resourceId: string, at: Date) {
    await this.db.query(
      'UPDATE resource_status_history SET ended_at = $2 WHERE resource_id = $1 AND ended_at IS NULL',
      [resourceId, at],
    );
  }

  async open(id: string, resourceId: string, status: ResourceStatus, at: Date) {
    await this.db.query(
      'INSERT INTO resource_status_history (id, resource_id, status, started_at) VALUES ($1, $2, $3, $4)',
      [id, resourceId, status, at],
    );
  }

  async findOverlapping(period: TimeRange): Promise<ResourceDowntime[]> {
    const { rows } = await this.db.query<DowntimeRow>(
      `SELECT resource_id, status, started_at, ended_at FROM resource_status_history
        WHERE started_at < $2 AND (ended_at IS NULL OR ended_at > $1)`,
      [period.start, period.end],
    );
    return rows.map((r) => ({
      resourceId: r.resource_id,
      status: r.status,
      startedAt: r.started_at,
      endedAt: r.ended_at,
    }));
  }
}

// ---------- Bookings ----------

interface BookingRow {
  id: string;
  user_id: string;
  resource_id: string;
  start_time: Date;
  end_time: Date;
  status: BookingStatus;
  created_at: Date;
  reminder_sent_at: Date | null;
}

const toBooking = (r: BookingRow) =>
  new Booking({
    id: r.id,
    userId: r.user_id,
    resourceId: r.resource_id,
    startTime: r.start_time,
    endTime: r.end_time,
    status: r.status,
    createdAt: r.created_at,
    reminderSentAt: r.reminder_sent_at,
  });

/** Друга лінія захисту від овербукінгу — exclusion constraint у схемі БД. */
function rethrowOverlap(error: unknown): never {
  if (isPgError(error, PG_EXCLUSION_VIOLATION)) throw new ConflictError('Обраний час уже зайнятий');
  throw error;
}

export class PgBookingRepository implements IBookingRepository {
  constructor(private readonly db: Queryable) {}

  async findById(id: string) {
    const { rows } = await this.db.query<BookingRow>('SELECT * FROM bookings WHERE id = $1', [id]);
    return rows[0] ? toBooking(rows[0]) : null;
  }

  async findByUser(userId: string) {
    const { rows } = await this.db.query<BookingRow>(
      'SELECT * FROM bookings WHERE user_id = $1 ORDER BY start_time DESC',
      [userId],
    );
    return rows.map(toBooking);
  }

  async findActiveOverlapping(range: TimeRange, query: OverlapQuery = {}) {
    const { rows } = await this.db.query<BookingRow>(
      `SELECT * FROM bookings
        WHERE status = 'CONFIRMED'
          AND start_time < $2 AND end_time > $1
          AND ($3::uuid[] IS NULL OR resource_id = ANY($3::uuid[]))
          AND ($4::uuid IS NULL OR id <> $4::uuid)`,
      [range.start, range.end, query.resourceIds ?? null, query.excludeBookingId ?? null],
    );
    return rows.map(toBooking);
  }

  async findUpcomingForResource(resourceId: string, now: Date) {
    const { rows } = await this.db.query<BookingRow>(
      `SELECT * FROM bookings WHERE resource_id = $1 AND status = 'CONFIRMED' AND end_time > $2
        ORDER BY start_time`,
      [resourceId, now],
    );
    return rows.map(toBooking);
  }

  async findForReport(period: TimeRange) {
    const { rows } = await this.db.query<BookingRow>(
      `SELECT * FROM bookings
        WHERE status IN ('CONFIRMED', 'COMPLETED') AND start_time < $2 AND end_time > $1`,
      [period.start, period.end],
    );
    return rows.map(toBooking);
  }

  async insert(b: Booking) {
    try {
      await this.db.query(
        `INSERT INTO bookings (id, user_id, resource_id, start_time, end_time, status, created_at, reminder_sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [b.id, b.userId, b.resourceId, b.startTime, b.endTime, b.status, b.createdAt, b.reminderSentAt],
      );
    } catch (error) {
      rethrowOverlap(error);
    }
  }

  async save(b: Booking) {
    try {
      await this.db.query(
        `UPDATE bookings SET status = $2, start_time = $3, end_time = $4, reminder_sent_at = $5 WHERE id = $1`,
        [b.id, b.status, b.startTime, b.endTime, b.reminderSentAt],
      );
    } catch (error) {
      rethrowOverlap(error);
    }
  }

  async completeEndedBefore(now: Date) {
    const { rowCount } = await this.db.query(
      `UPDATE bookings SET status = 'COMPLETED' WHERE status = 'CONFIRMED' AND end_time <= $1`,
      [now],
    );
    return rowCount ?? 0;
  }

  async claimDueReminders(now: Date, windowEnd: Date) {
    const { rows } = await this.db.query<BookingRow>(
      `UPDATE bookings SET reminder_sent_at = $1
        WHERE status = 'CONFIRMED' AND reminder_sent_at IS NULL AND start_time > $1 AND start_time <= $2
        RETURNING *`,
      [now, windowEnd],
    );
    return rows.map(toBooking);
  }
}

// ---------- Notifications ----------

interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  booking_id: string | null;
  created_at: Date;
  read_at: Date | null;
}

const toNotification = (r: NotificationRow) =>
  new Notification({
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    message: r.message,
    bookingId: r.booking_id,
    createdAt: r.created_at,
    readAt: r.read_at,
  });

export class PgNotificationRepository implements INotificationRepository {
  constructor(private readonly db: Queryable) {}

  async insert(n: Notification) {
    await this.db.query(
      `INSERT INTO notifications (id, user_id, type, title, message, booking_id, created_at, read_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [n.id, n.userId, n.type, n.title, n.message, n.bookingId, n.createdAt, n.readAt],
    );
  }

  async findById(id: string) {
    const { rows } = await this.db.query<NotificationRow>('SELECT * FROM notifications WHERE id = $1', [id]);
    return rows[0] ? toNotification(rows[0]) : null;
  }

  async findByUser(userId: string, query: NotificationQuery = {}) {
    const { rows } = await this.db.query<NotificationRow>(
      `SELECT * FROM notifications
        WHERE user_id = $1 AND (NOT $2::boolean OR read_at IS NULL)
        ORDER BY created_at DESC LIMIT $3`,
      [userId, query.unreadOnly ?? false, query.limit ?? 50],
    );
    return rows.map(toNotification);
  }

  async countUnread(userId: string) {
    const { rows } = await this.db.query<{ count: string }>(
      'SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return Number(rows[0].count);
  }

  async save(n: Notification) {
    await this.db.query('UPDATE notifications SET read_at = $2 WHERE id = $1', [n.id, n.readAt]);
  }

  async markAllRead(userId: string, at: Date) {
    const { rowCount } = await this.db.query(
      'UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL',
      [userId, at],
    );
    return rowCount ?? 0;
  }
}

// ---------- Unit of Work ----------

/** BEGIN → робота → COMMIT, при помилці — ROLLBACK (діаграма послідовностей, Лаб №2). */
export class PgUnitOfWork implements IUnitOfWork {
  constructor(private readonly pool: Pool) {}

  async run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work({
        bookings: new PgBookingRepository(client),
        resources: new PgResourceRepository(client),
        statusHistory: new PgResourceStatusHistoryRepository(client),
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      // При розриві з'єднання ROLLBACK теж впаде — повертаємо початкову помилку.
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
