import type { Request, RequestHandler } from 'express';
import type { Role } from '../../domain/enums';
import type { Actor } from '../../shared/actor';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors';
import type { ITokenService } from './token.service';

declare global {
  namespace Express {
    interface Request {
      user?: Actor;
    }
  }
}

/** Перевіряє JWT із заголовка Authorization: Bearer <token>. */
export function authenticate(tokens: ITokenService): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(new UnauthorizedError());
      return;
    }
    const payload = tokens.verify(header.slice('Bearer '.length));
    req.user = { id: payload.sub, role: payload.role };
    next();
  };
}

/** Дозволяє доступ лише вказаним ролям (наприклад, ADMIN для FR-06, FR-07, FR-13). */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}

export function currentActor(req: Request): Actor {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
