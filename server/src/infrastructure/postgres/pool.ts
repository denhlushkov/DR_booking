import { Pool, type PoolClient } from 'pg';

/** Спільний тип для Pool і PoolClient (клієнт усередині транзакції). */
export type Queryable = Pick<PoolClient, 'query'>;

/**
 * NFR-01: пул з'єднань замість нового з'єднання на кожен запит.
 * NFR-03: короткий тайм-аут підключення (запити не «висять», коли БД недоступна)
 * і обробник `error` — без нього розрив неактивного з'єднання завершує процес Node.
 */
export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
  });
  pool.on('error', (error) => {
    console.error(`[db] з'єднання з PostgreSQL розірвано: ${error.message}`);
  });
  return pool;
}

/** PostgreSQL: порушення exclusion constraint (перетин бронювань). */
export const PG_EXCLUSION_VIOLATION = '23P01';
/** PostgreSQL: порушення унікальності. */
export const PG_UNIQUE_VIOLATION = '23505';

export function isPgError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}
