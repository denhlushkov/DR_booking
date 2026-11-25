import type { User } from '../../domain/user';

/** Порт доступу до користувачів. Реалізації: InMemory (dev/тести) і PostgreSQL. */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  insert(user: User): Promise<void>;
}
