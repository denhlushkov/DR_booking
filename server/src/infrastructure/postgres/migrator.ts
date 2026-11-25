import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Pool } from 'pg';

/** Каталог SQL-міграцій: server/db/migrations (однаково для src/ під tsx і для dist/). */
export const MIGRATIONS_DIR = resolve(__dirname, '../../../db/migrations');

/** Довільний ключ advisory-блокування: міграції не виконуються паралельно кількома екземплярами. */
const MIGRATION_LOCK_KEY = 72_427_001;

/**
 * Застосовує нові файли `NNN_*.sql` у порядку імен, кожен — у власній транзакції.
 * Застосовані міграції записуються в таблицю schema_migrations.
 */
export async function runMigrations(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

    const newlyApplied: string[] = [];
    for (const file of files.filter((f) => !applied.has(f))) {
      const sql = await readFile(join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        newlyApplied.push(file);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Міграція ${file} не вдалася: ${(error as Error).message}`, { cause: error });
      }
    }
    return newlyApplied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}
