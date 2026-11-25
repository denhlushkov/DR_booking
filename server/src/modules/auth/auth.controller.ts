import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { parse } from '../../shared/http/validation';
import type { AuthService } from './auth.service';

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/v1/auth/login */
  login = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = parse(loginSchema, req.body);
    res.json(await this.auth.login(email, password));
  };

  router(): Router {
    return Router().post('/login', this.login);
  }
}
