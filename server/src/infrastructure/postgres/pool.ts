import { Pool, type PoolClient } from 'pg';

/** Спільний тип для Pool і PoolClient (клієнт усередині транзакції). */
export type Queryable = Pick<PoolClient, 'query'>;

/** NFR-01: пул з'єднань замість нового з'єднання на кожен запит. */
export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 20, idleTimeoutMillis: 30_000 });
}

/** PostgreSQL: порушення exclusion constraint (перетин бронювань). */
export const PG_EXCLUSION_VIOLATION = '23P01';
/** PostgreSQL: порушення унікальності. */
export const PG_UNIQUE_VIOLATION = '23505';

export function isPgError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}
