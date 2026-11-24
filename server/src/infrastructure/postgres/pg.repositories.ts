import type { Pool } from 'pg';
import { Booking } from '../../domain/booking';
import type { BookingStatus, ResourceStatus, ResourceType, Role } from '../../domain/enums';
import { Resource, type ResourceAttributes } from '../../domain/resource';
import { User } from '../../domain/user';
import type { IBookingRepository } from '../../modules/bookings/booking.repository';
import type {
  IUnitOfWork,
  TransactionalRepositories,
} from '../../modules/bookings/unit-of-work';
import type { IResourceRepository, ResourceQuery } from '../../modules/resources/resource.repository';
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

// ---------- Bookings ----------

interface BookingRow {
  id: string;
  user_id: string;
  resource_id: string;
  start_time: Date;
  end_time: Date;
  status: BookingStatus;
  created_at: Date;
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
  });

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

  async findActiveOverlapping(range: TimeRange, resourceIds?: readonly string[]) {
    const { rows } = await this.db.query<BookingRow>(
      `SELECT * FROM bookings
        WHERE status = 'CONFIRMED'
          AND start_time < $2 AND end_time > $1
          AND ($3::uuid[] IS NULL OR resource_id = ANY($3::uuid[]))`,
      [range.start, range.end, resourceIds ?? null],
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
        `INSERT INTO bookings (id, user_id, resource_id, start_time, end_time, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [b.id, b.userId, b.resourceId, b.startTime, b.endTime, b.status, b.createdAt],
      );
    } catch (error) {
      // Друга лінія захисту від овербукінгу — exclusion constraint у схемі БД.
      if (isPgError(error, PG_EXCLUSION_VIOLATION)) throw new ConflictError('Обраний час уже зайнятий');
      throw error;
    }
  }

  async save(b: Booking) {
    await this.db.query('UPDATE bookings SET status = $2 WHERE id = $1', [b.id, b.status]);
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
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
