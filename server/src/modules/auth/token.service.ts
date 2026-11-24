import jwt from 'jsonwebtoken';
import { Role } from '../../domain/enums';
import { UnauthorizedError } from '../../shared/errors';

export interface TokenPayload {
  sub: string;
  role: Role;
}

export interface ITokenService {
  sign(payload: TokenPayload): string;
  /** Повертає payload або кидає UnauthorizedError. */
  verify(token: string): TokenPayload;
}

/** JWT-токени для авторизації запитів SPA → API (Лаб №2, компонент Auth Module). */
export class JwtTokenService implements ITokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresInSeconds: number,
  ) {}

  sign(payload: TokenPayload): string {
    return jwt.sign({ role: payload.role }, this.secret, {
      subject: payload.sub,
      expiresIn: this.expiresInSeconds,
      algorithm: 'HS256',
    });
  }

  verify(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
      if (typeof decoded === 'string' || !decoded.sub || !isRole(decoded.role)) {
        throw new UnauthorizedError('Недійсний токен');
      }
      return { sub: decoded.sub, role: decoded.role };
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      throw new UnauthorizedError('Недійсний або прострочений токен');
    }
  }
}

function isRole(value: unknown): value is Role {
  return Object.values(Role).includes(value as Role);
}
