import type { UserProfile } from '../../domain/user';
import { UnauthorizedError } from '../../shared/errors';
import type { IUserRepository } from '../users/user.repository';
import type { IPasswordHasher } from './password-hasher';
import type { ITokenService } from './token.service';

export interface LoginResult {
  token: string;
  user: UserProfile;
}

/** FR-01: вхід за корпоративною поштою та паролем. */
export class AuthService {
  constructor(
    private readonly users: IUserRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findByEmail(email.toLowerCase());
    const valid = user ? await this.hasher.verify(password, user.passwordHash) : false;
    // Однакове повідомлення для невідомого email і невірного пароля — не розкриваємо, що існує.
    if (!user || !valid) throw new UnauthorizedError('Невірна електронна пошта або пароль');

    return {
      token: this.tokens.sign({ sub: user.id, role: user.role }),
      user: user.toProfile(),
    };
  }
}
