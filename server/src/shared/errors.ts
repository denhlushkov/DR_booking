/**
 * Ієрархія прикладних помилок. Кожна помилка знає свій HTTP-статус,
 * тому сервіси не залежать від Express, а обробник помилок не знає бізнес-логіки.
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 — некоректні вхідні дані. */
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';
}

/** 401 — користувач не автентифікований. */
export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';

  constructor(message = 'Потрібна авторизація') {
    super(message);
  }
}

/** 403 — недостатньо прав для дії. */
export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';

  constructor(message = 'Недостатньо прав для виконання дії') {
    super(message);
  }
}

/** 404 — сутність не знайдено. */
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
}

/** 409 — конфлікт стану (колізія бронювань, дублікат email). */
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
}

/** 503 — тимчасова недоступність залежності (наприклад, БД). Клієнт може повторити запит. */
export class ServiceUnavailableError extends AppError {
  readonly statusCode = 503;
  readonly code = 'SERVICE_UNAVAILABLE';

  constructor(message = 'Сервіс тимчасово недоступний, спробуйте за кілька секунд') {
    super(message);
  }
}

/**
 * Помилки з'єднання з БД/мережею: відмова, розрив, тайм-аут підключення,
 * коди PostgreSQL класу 08 (connection exception) та 57P0x (сервер зупиняється).
 */
export function isTransientConnectionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === 'string' && (/^(ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT)$/.test(code) || /^(08|57P0)/.test(code))) {
    return true;
  }
  return typeof message === 'string' && /Connection terminated|timeout exceeded when trying to connect/i.test(message);
}

/** 422 — порушення бізнес-правила (наприклад, пізнє скасування). */
export class BusinessRuleError extends AppError {
  readonly statusCode = 422;
  readonly code = 'BUSINESS_RULE_VIOLATION';
}
