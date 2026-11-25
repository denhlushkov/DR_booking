import type { AppConfig } from './config/env';
import {
  InMemoryBookingRepository,
  InMemoryNotificationRepository,
  InMemoryResourceRepository,
  InMemoryResourceStatusHistoryRepository,
  InMemoryUnitOfWork,
  InMemoryUserRepository,
} from './infrastructure/memory/in-memory.repositories';
import {
  PgBookingRepository,
  PgNotificationRepository,
  PgResourceRepository,
  PgResourceStatusHistoryRepository,
  PgUnitOfWork,
  PgUserRepository,
} from './infrastructure/postgres/pg.repositories';
import { runMigrations } from './infrastructure/postgres/migrator';
import { createPool } from './infrastructure/postgres/pool';
import { AnalyticsController } from './modules/analytics/analytics.controller';
import { ReportGenerator } from './modules/analytics/report-generator';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { BcryptPasswordHasher, type IPasswordHasher } from './modules/auth/password-hasher';
import { type ITokenService, JwtTokenService } from './modules/auth/token.service';
import { BookingLifecycleJob } from './modules/bookings/booking-lifecycle.job';
import { BookingController } from './modules/bookings/booking.controller';
import { BookingPolicy } from './modules/bookings/booking.policy';
import type { IBookingRepository } from './modules/bookings/booking.repository';
import { BookingService } from './modules/bookings/booking.service';
import { NotificationInboxService } from './modules/notifications/notification-inbox.service';
import { NotificationController } from './modules/notifications/notification.controller';
import type { INotificationRepository } from './modules/notifications/notification.repository';
import {
  CompositeNotificationService,
  ConsoleNotificationService,
  InAppNotificationService,
  type INotificationService,
} from './modules/notifications/notification.service';
import type { IResourceStatusHistoryRepository } from './modules/resources/resource-status-history.repository';
import { ResourceController } from './modules/resources/resource.controller';
import type { IResourceRepository } from './modules/resources/resource.repository';
import { ResourceService } from './modules/resources/resource.service';
import type { IUnitOfWork } from './modules/unit-of-work';
import { UserController } from './modules/users/user.controller';
import type { IUserRepository } from './modules/users/user.repository';
import { UserService } from './modules/users/user.service';
import { type IClock, SystemClock } from './shared/clock';
import { collectHealth, type HealthReport, type IHealthIndicator } from './shared/health';
import { WorkSchedule } from './shared/work-schedule';

export interface Repositories {
  users: IUserRepository;
  resources: IResourceRepository;
  bookings: IBookingRepository;
  statusHistory: IResourceStatusHistoryRepository;
  notifications: INotificationRepository;
  unitOfWork: IUnitOfWork;
}

/** Залежності, які можна підмінити (наприклад, у тестах). */
export interface ContainerOverrides {
  clock?: IClock;
  /** Додатковий канал сповіщень (окрім збереження в застосунку). */
  extraNotifier?: INotificationService;
  passwordHasher?: IPasswordHasher;
}

export interface Container {
  repositories: Repositories;
  passwordHasher: IPasswordHasher;
  tokenService: ITokenService;
  lifecycleJob: BookingLifecycleJob;
  controllers: {
    auth: AuthController;
    users: UserController;
    resources: ResourceController;
    bookings: BookingController;
    analytics: AnalyticsController;
    notifications: NotificationController;
  };
  /** Підготовка сховища до роботи (міграції БД). */
  init(): Promise<void>;
  health(): Promise<HealthReport>;
  close(): Promise<void>;
}

/**
 * Composition Root: єдине місце, де абстракції зв'язуються з конкретними реалізаціями (DIP).
 * Заміна PostgreSQL на інше сховище змінює лише цей файл та infrastructure/.
 */
export function buildContainer(config: AppConfig, overrides: ContainerOverrides = {}): Container {
  const storage = createStorage(config);
  const { repositories } = storage;
  const clock = overrides.clock ?? new SystemClock();
  const passwordHasher = overrides.passwordHasher ?? new BcryptPasswordHasher();
  const tokenService = new JwtTokenService(config.jwtSecret, config.jwtExpiresInSeconds);
  const schedule = new WorkSchedule(config.workSchedule);

  // OCP: канали сповіщень комбінуються без зміни сервісів, що їх надсилають.
  const notifier = new CompositeNotificationService([
    new InAppNotificationService(repositories.notifications, clock, schedule.timeZone),
    overrides.extraNotifier ?? new ConsoleNotificationService(),
  ]);

  const authService = new AuthService(repositories.users, passwordHasher, tokenService);
  const userService = new UserService(repositories.users, passwordHasher);
  const resourceService = new ResourceService(
    repositories.resources,
    repositories.bookings,
    repositories.unitOfWork,
    notifier,
    clock,
  );
  const bookingService = new BookingService(
    repositories.unitOfWork,
    repositories.bookings,
    repositories.resources,
    new BookingPolicy(config.bookingRules, clock),
    notifier,
    clock,
  );
  const reportGenerator = new ReportGenerator(
    repositories.resources,
    repositories.bookings,
    repositories.statusHistory,
    schedule,
  );
  const inbox = new NotificationInboxService(repositories.notifications, clock);

  return {
    repositories,
    passwordHasher,
    tokenService,
    lifecycleJob: new BookingLifecycleJob(
      repositories.bookings,
      repositories.resources,
      notifier,
      clock,
      config.reminderMinutesBefore,
    ),
    controllers: {
      auth: new AuthController(authService),
      users: new UserController(userService),
      resources: new ResourceController(resourceService),
      bookings: new BookingController(bookingService),
      analytics: new AnalyticsController(reportGenerator),
      notifications: new NotificationController(inbox),
    },
    init: storage.init,
    health: () => collectHealth(storage.healthIndicators),
    close: storage.close,
  };
}

interface Storage {
  repositories: Repositories;
  healthIndicators: IHealthIndicator[];
  init(): Promise<void>;
  close(): Promise<void>;
}

function createStorage(config: AppConfig): Storage {
  if (config.dataStore === 'postgres') {
    const pool = createPool(config.databaseUrl!);
    return {
      repositories: {
        users: new PgUserRepository(pool),
        resources: new PgResourceRepository(pool),
        bookings: new PgBookingRepository(pool),
        statusHistory: new PgResourceStatusHistoryRepository(pool),
        notifications: new PgNotificationRepository(pool),
        unitOfWork: new PgUnitOfWork(pool),
      },
      healthIndicators: [{ name: 'database', check: async () => void (await pool.query('SELECT 1')) }],
      init: async () => {
        if (!config.migrateOnStart) return;
        const applied = await runMigrations(pool);
        if (applied.length) console.info(`[db] Застосовано міграції: ${applied.join(', ')}`);
      },
      close: () => pool.end(),
    };
  }

  const resources = new InMemoryResourceRepository();
  const bookings = new InMemoryBookingRepository();
  const statusHistory = new InMemoryResourceStatusHistoryRepository();
  return {
    repositories: {
      users: new InMemoryUserRepository(),
      resources,
      bookings,
      statusHistory,
      notifications: new InMemoryNotificationRepository(),
      unitOfWork: new InMemoryUnitOfWork({ resources, bookings, statusHistory }),
    },
    healthIndicators: [],
    init: async () => {},
    close: async () => {},
  };
}
