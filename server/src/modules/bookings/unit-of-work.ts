import type { IResourceRepository } from '../resources/resource.repository';
import type { IBookingRepository } from './booking.repository';

/** Репозиторії, прив'язані до однієї транзакції. */
export interface TransactionalRepositories {
  bookings: IBookingRepository;
  resources: IResourceRepository;
}

/**
 * Unit of Work: виконує роботу атомарно (BEGIN … COMMIT / ROLLBACK).
 * BookingService залежить від цієї абстракції, а не від PostgreSQL (DIP),
 * що відповідає діаграмі послідовностей з Лаб №2.
 */
export interface IUnitOfWork {
  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
}
