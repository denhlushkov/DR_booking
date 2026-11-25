import type { IBookingRepository } from './bookings/booking.repository';
import type { IResourceStatusHistoryRepository } from './resources/resource-status-history.repository';
import type { IResourceRepository } from './resources/resource.repository';

/** Репозиторії, прив'язані до однієї транзакції. */
export interface TransactionalRepositories {
  bookings: IBookingRepository;
  resources: IResourceRepository;
  statusHistory: IResourceStatusHistoryRepository;
}

/**
 * Unit of Work: виконує роботу атомарно (BEGIN … COMMIT / ROLLBACK).
 * Сервіси залежать від цієї абстракції, а не від PostgreSQL (DIP),
 * що відповідає діаграмі послідовностей з Лаб №2.
 */
export interface IUnitOfWork {
  run<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
}
