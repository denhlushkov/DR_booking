import express, { type Express } from 'express';
import type { Container } from './container';
import { authenticate } from './modules/auth/auth.middleware';
import { errorHandler, notFoundHandler } from './shared/http/error-handler';

/** Збирає Express-застосунок: middleware → маршрути модулів → обробка помилок. */
export function createApp(container: Container): Express {
  const app = express();
  const { controllers } = container;
  const auth = authenticate(container.tokenService);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/auth', controllers.auth.router());
  app.use('/api/v1/users', controllers.users.router(auth));
  app.use('/api/v1/resources', controllers.resources.router(auth));
  app.use('/api/v1/bookings', controllers.bookings.router(auth));
  app.use('/api/v1/analytics', controllers.analytics.router(auth));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
