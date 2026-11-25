import { type Request, type RequestHandler, type Response, Router } from 'express';
import { z } from 'zod';
import { Role } from '../../domain/enums';
import { parse } from '../../shared/http/validation';
import { currentActor, requireRole } from '../auth/auth.middleware';
import type { UserService } from './user.service';

const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  email: z.email(),
  password: z.string().min(8).max(128),
  role: z.enum(Role).default(Role.EMPLOYEE),
  department: z.string().trim().min(1).max(200),
  position: z.string().trim().min(1).max(200),
});

export class UserController {
  constructor(private readonly users: UserService) {}

  /** GET /api/v1/users/me — FR-02 */
  me = async (req: Request, res: Response): Promise<void> => {
    const user = await this.users.getById(currentActor(req).id);
    res.json(user.toProfile());
  };

  /** GET /api/v1/users — список користувачів (лише ADMIN) */
  list = async (_req: Request, res: Response): Promise<void> => {
    res.json((await this.users.listUsers()).map((u) => u.toProfile()));
  };

  /** POST /api/v1/users — FR-13 (лише ADMIN) */
  create = async (req: Request, res: Response): Promise<void> => {
    const user = await this.users.createUser(parse(createUserSchema, req.body));
    res.status(201).json(user.toProfile());
  };

  router(authenticate: RequestHandler): Router {
    return Router()
      .use(authenticate)
      .get('/me', this.me)
      .get('/', requireRole(Role.ADMIN), this.list)
      .post('/', requireRole(Role.ADMIN), this.create);
  }
}
