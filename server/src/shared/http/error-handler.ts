import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, isTransientConnectionError, NotFoundError, ServiceUnavailableError } from '../errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Маршрут ${req.method} ${req.path} не знайдено`));
};

/** Єдиний формат помилок API: { error: { code, message, details? } }. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // NFR-03: недоступність БД — це 503 з підказкою повторити, а не «падіння» сервера.
  const error = isTransientConnectionError(err) ? new ServiceUnavailableError() : err;

  if (error instanceof AppError) {
    if (error instanceof ServiceUnavailableError) res.setHeader('Retry-After', '5');
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Некоректний JSON у тілі запиту' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутрішня помилка сервера' } });
};
