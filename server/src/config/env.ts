import { type BookingRules, DEFAULT_BOOKING_RULES } from '../modules/bookings/booking.policy';
import { parseTimeOfDay, type WorkScheduleOptions } from '../shared/work-schedule';

export type DataStore = 'memory' | 'postgres';

export interface AppConfig {
  port: number;
  /** memory — без БД (розробка/демо), postgres — робочий режим. */
  dataStore: DataStore;
  databaseUrl?: string;
  /** Застосовувати SQL-міграції під час старту (лише для postgres). */
  migrateOnStart: boolean;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  /** Створити демо-користувачів і ресурси, якщо їх ще немає. */
  seedDemoData: boolean;
  bookingRules: BookingRules;
  /** Робочий графік офісу для звітів завантаженості та форматування дат у сповіщеннях. */
  workSchedule: WorkScheduleOptions;
  /** За скільки хвилин до початку надсилати нагадування (FR-11). */
  reminderMinutesBefore: number;
  /** Фонові задачі (нагадування, завершення бронювань). */
  backgroundJobs: { enabled: boolean; intervalSeconds: number };
}

const DEV_JWT_SECRET = 'dev-only-secret-change-me';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  const isTest = env.NODE_ENV === 'test';
  const dataStore: DataStore = env.DATA_STORE === 'postgres' ? 'postgres' : 'memory';

  if (dataStore === 'postgres' && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL є обовʼязковою при DATA_STORE=postgres');
  }
  if (isProduction && !env.JWT_SECRET) {
    throw new Error('JWT_SECRET є обовʼязковим у production');
  }

  return {
    port: toInt(env.PORT, 3000),
    dataStore,
    databaseUrl: env.DATABASE_URL,
    migrateOnStart: toBool(env.MIGRATE_ON_START, true),
    jwtSecret: env.JWT_SECRET ?? DEV_JWT_SECRET,
    jwtExpiresInSeconds: toInt(env.JWT_EXPIRES_IN_SECONDS, 8 * 60 * 60),
    seedDemoData: toBool(env.SEED_DEMO_DATA, !isProduction),
    bookingRules: {
      minDurationMinutes: toInt(env.BOOKING_MIN_MINUTES, DEFAULT_BOOKING_RULES.minDurationMinutes),
      maxDurationMinutes: toInt(env.BOOKING_MAX_MINUTES, DEFAULT_BOOKING_RULES.maxDurationMinutes),
      cancellationCutoffMinutes: toInt(
        env.BOOKING_CANCEL_CUTOFF_MINUTES,
        DEFAULT_BOOKING_RULES.cancellationCutoffMinutes,
      ),
    },
    workSchedule: {
      timeZone: env.OFFICE_TIMEZONE ?? 'Europe/Kyiv',
      dayStartMinutes: parseTimeOfDay(env.WORK_DAY_START ?? '08:00'),
      dayEndMinutes: parseTimeOfDay(env.WORK_DAY_END ?? '20:00'),
      workDays: (env.WORK_DAYS ?? '1,2,3,4,5').split(',').map((d) => toInt(d.trim(), -1)),
    },
    reminderMinutesBefore: toInt(env.REMINDER_MINUTES_BEFORE, 30),
    backgroundJobs: {
      enabled: toBool(env.BACKGROUND_JOBS, !isTest),
      intervalSeconds: toInt(env.JOB_INTERVAL_SECONDS, 60),
    },
  };
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`Очікується ціле число, отримано "${value}"`);
  return parsed;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}
