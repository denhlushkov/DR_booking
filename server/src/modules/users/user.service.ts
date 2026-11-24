import { randomUUID } from 'node:crypto';
import type { Role } from '../../domain/enums';
import { User } from '../../domain/user';
import type { IdGenerator } from '../../shared/actor';
import { ConflictError, NotFoundError } from '../../shared/errors';
import type { IPasswordHasher } from '../auth/password-hasher';
import type { IUserRepository } from './user.repository';

export interface CreateUserInput {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  department: string;
  position: string;
}

/** FR-02 (профіль) та FR-13 (реєстрація користувачів адміністратором). */
export class UserService {
  constructor(
    private readonly users: IUserRepository,
    private readonly hasher: IPasswordHasher,
    private readonly newId: IdGenerator = randomUUID,
  ) {}

  async getById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('Користувача не знайдено');
    return user;
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const email = input.email.toLowerCase();
    if (await this.users.findByEmail(email)) {
      throw new ConflictError('Користувач з такою електронною поштою вже існує');
    }
    const user = new User({
      id: this.newId(),
      fullName: input.fullName,
      email,
      passwordHash: await this.hasher.hash(input.password),
      role: input.role,
      department: input.department,
      position: input.position,
    });
    await this.users.insert(user);
    return user;
  }
}
