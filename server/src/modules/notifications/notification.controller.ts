import { type Request, type RequestHandler, type Response, Router } from 'express';
import { z } from 'zod';
import { parse, parseId } from '../../shared/http/validation';
import { currentActor } from '../auth/auth.middleware';
import type { NotificationInboxService } from './notification-inbox.service';

const listSchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export class NotificationController {
  constructor(private readonly inbox: NotificationInboxService) {}

  /** GET /api/v1/notifications/me — FR-11 */
  list = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.inbox.list(currentActor(req).id, parse(listSchema, req.query)));
  };

  /** POST /api/v1/notifications/:id/read */
  markRead = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.inbox.markRead(parseId(req.params.id), currentActor(req).id));
  };

  /** POST /api/v1/notifications/read-all */
  markAllRead = async (req: Request, res: Response): Promise<void> => {
    res.json({ updated: await this.inbox.markAllRead(currentActor(req).id) });
  };

  router(authenticate: RequestHandler): Router {
    return Router()
      .use(authenticate)
      .get('/me', this.list)
      .post('/read-all', this.markAllRead)
      .post('/:id/read', this.markRead);
  }
}
