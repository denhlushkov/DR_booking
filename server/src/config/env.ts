import { type BookingRules, DEFAULT_BOOKING_RULES } from '../modules/bookings/booking.policy';

export type DataStore = 'memory' | 'postgres';

export interface AppConfig {
  port: number;
  /** memory — без БД (розробка/демо), postgres — робочий режим. */
  dataStore: DataStore;
  databaseUrl?: string;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  /** Створити демо-користувачів і ресурси, якщо їх ще немає. */
  seedDemoData: boolean;
  bookingRules: BookingRules;
  /** Робочі хвилини на день для розрахунку завантаженості (08:00–20:00, NFR-03). */
  workingMinutesPerDay: number;
}

const DEV_JWT_SECRET = 'dev-only-secret-change-me';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
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
    jwtSecret: env.JWT_SECRET ?? DEV_JWT_SECRET,
    jwtExpiresInSeconds: toInt(env.JWT_EXPIRES_IN_SECONDS, 8 * 60 * 60),
    seedDemoData: env.SEED_DEMO_DATA ? env.SEED_DEMO_DATA === 'true' : !isProduction,
    bookingRules: {
      minDurationMinutes: toInt(env.BOOKING_MIN_MINUTES, DEFAULT_BOOKING_RULES.minDurationMinutes),
      maxDurationMinutes: toInt(env.BOOKING_MAX_MINUTES, DEFAULT_BOOKING_RULES.maxDurationMinutes),
      cancellationCutoffMinutes: toInt(
        env.BOOKING_CANCEL_CUTOFF_MINUTES,
        DEFAULT_BOOKING_RULES.cancellationCutoffMinutes,
      ),
    },
    workingMinutesPerDay: toInt(env.WORKING_MINUTES_PER_DAY, 12 * 60),
  };
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) throw new Error(`Очікується ціле число, отримано "${value}"`);
  return parsed;
}
