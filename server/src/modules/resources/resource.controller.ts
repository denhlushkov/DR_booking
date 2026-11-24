import { type Request, type RequestHandler, type Response, Router } from 'express';
import { z } from 'zod';
import { ResourceStatus, ResourceType, Role } from '../../domain/enums';
import { parse, parseId } from '../../shared/http/validation';
import { requireRole } from '../auth/auth.middleware';
import type { ResourceService } from './resource.service';

const searchSchema = z.object({
  type: z.enum(ResourceType).optional(),
  floor: z.coerce.number().int().optional(),
  zone: z.string().trim().min(1).optional(),
  status: z.enum(ResourceStatus).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Обладнання через кому: `equipment=monitor,docking` */
  equipment: z
    .string()
    .optional()
    .transform((v) => v?.split(',').map((s) => s.trim()).filter(Boolean)),
  participants: z.coerce.number().int().positive().optional(),
});

const attributesSchema = z.object({
  zone: z.string().trim().min(1).optional(),
  capacity: z.number().int().positive().optional(),
  equipment: z.array(z.string().trim().min(1)).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(ResourceType),
  floor: z.number().int(),
  attributes: attributesSchema.optional(),
});

const updateSchema = createSchema.omit({ type: true }).partial();
const statusSchema = z.object({ status: z.enum(ResourceStatus) });
const periodSchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });

export class ResourceController {
  constructor(private readonly resources: ResourceService) {}

  /** GET /api/v1/resources — FR-08, FR-09, FR-12 */
  search = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.resources.search(parse(searchSchema, req.query)));
  };

  /** GET /api/v1/resources/:id */
  getById = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.resources.getById(parseId(req.params.id)));
  };

  /** GET /api/v1/resources/:id/schedule?from&to — FR-10 */
  schedule = async (req: Request, res: Response): Promise<void> => {
    const { from, to } = parse(periodSchema, req.query);
    res.json(await this.resources.getSchedule(parseId(req.params.id), { start: from, end: to }));
  };

  /** POST /api/v1/resources — FR-06 */
  create = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.resources.create(parse(createSchema, req.body)));
  };

  /** PATCH /api/v1/resources/:id — FR-06 */
  update = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.resources.update(parseId(req.params.id), parse(updateSchema, req.body)));
  };

  /** PATCH /api/v1/resources/:id/status — FR-06 (обслуговування / блокування) */
  changeStatus = async (req: Request, res: Response): Promise<void> => {
    const { status } = parse(statusSchema, req.body);
    res.json(await this.resources.changeStatus(parseId(req.params.id), status));
  };

  router(authenticate: RequestHandler): Router {
    const adminOnly = requireRole(Role.ADMIN);
    return Router()
      .use(authenticate)
      .get('/', this.search)
      .get('/:id', this.getById)
      .get('/:id/schedule', this.schedule)
      .post('/', adminOnly, this.create)
      .patch('/:id', adminOnly, this.update)
      .patch('/:id/status', adminOnly, this.changeStatus);
  }
}
