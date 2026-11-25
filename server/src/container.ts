import type { AppConfig } from './config/env';
import {
  InMemoryBookingRepository,
  InMemoryResourceRepository,
  InMemoryUnitOfWork,
  InMemoryUserRepository,
} from './infrastructure/memory/in-memory.repositories';
import {
  PgBookingRepository,
  PgResourceRepository,
  PgUnitOfWork,
  PgUserRepository,
} from './infrastructure/postgres/pg.repositories';
import { createPool } from './infrastructure/postgres/pool';
import { AnalyticsController } from './modules/analytics/analytics.controller';
import { ReportGenerator } from './modules/analytics/report-generator';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { BcryptPasswordHasher, type IPasswordHasher } from './modules/auth/password-hasher';
import { type ITokenService, JwtTokenService } from './modules/auth/token.service';
import { BookingController } from './modules/bookings/booking.controller';
import { BookingPolicy } from './modules/bookings/booking.policy';
import type { IBookingRepository } from './modules/bookings/booking.repository';
import { BookingService } from './modules/bookings/booking.service';
import type { IUnitOfWork } from './modules/bookings/unit-of-work';
import {
  ConsoleNotificationService,
  type INotificationService,
} from './modules/notifications/notification.service';
import { ResourceController } from './modules/resources/resource.controller';
import type { IResourceRepository } from './modules/resources/resource.repository';
import { ResourceService } from './modules/resources/resource.service';
import { UserController } from './modules/users/user.controller';
import type { IUserRepository } from './modules/users/user.repository';
import { UserService } from './modules/users/user.service';
import { type IClock, SystemClock } from './shared/clock';

export interface Repositories {
  users: IUserRepository;
  resources: IResourceRepository;
  bookings: IBookingRepository;
  unitOfWork: IUnitOfWork;
}

/** Залежності, які можна підмінити (наприклад, у тестах). */
export interface ContainerOverrides {
  clock?: IClock;
  notifier?: INotificationService;
  passwordHasher?: IPasswordHasher;
}

export interface Container {
  repositories: Repositories;
  passwordHasher: IPasswordHasher;
  tokenService: ITokenService;
  controllers: {
    auth: AuthController;
    users: UserController;
    resources: ResourceController;
    bookings: BookingController;
    analytics: AnalyticsController;
  };
  close(): Promise<void>;
}

/**
 * Composition Root: єдине місце, де абстракції зв'язуються з конкретними реалізаціями (DIP).
 * Заміна PostgreSQL на інше сховище змінює лише цей файл та infrastructure/.
 */
export function buildContainer(config: AppConfig, overrides: ContainerOverrides = {}): Container {
  const { repositories, close } = createRepositories(config);
  const clock = overrides.clock ?? new SystemClock();
  const notifier = overrides.notifier ?? new ConsoleNotificationService();
  const passwordHasher = overrides.passwordHasher ?? new BcryptPasswordHasher();
  const tokenService = new JwtTokenService(config.jwtSecret, config.jwtExpiresInSeconds);

  const authService = new AuthService(repositories.users, passwordHasher, tokenService);
  const userService = new UserService(repositories.users, passwordHasher);
  const resourceService = new ResourceService(repositories.resources, repositories.bookings);
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
    config.workingMinutesPerDay,
  );

  return {
    repositories,
    passwordHasher,
    tokenService,
    controllers: {
      auth: new AuthController(authService),
      users: new UserController(userService),
      resources: new ResourceController(resourceService),
      bookings: new BookingController(bookingService),
      analytics: new AnalyticsController(reportGenerator),
    },
    close,
  };
}

function createRepositories(config: AppConfig): { repositories: Repositories; close: () => Promise<void> } {
  if (config.dataStore === 'postgres') {
    const pool = createPool(config.databaseUrl!);
    return {
      repositories: {
        users: new PgUserRepository(pool),
        resources: new PgResourceRepository(pool),
        bookings: new PgBookingRepository(pool),
        unitOfWork: new PgUnitOfWork(pool),
      },
      close: () => pool.end(),
    };
  }

  const resources = new InMemoryResourceRepository();
  const bookings = new InMemoryBookingRepository();
  return {
    repositories: {
      users: new InMemoryUserRepository(),
      resources,
      bookings,
      unitOfWork: new InMemoryUnitOfWork({ resources, bookings }),
    },
    close: async () => {},
  };
}
