import { type Request, type RequestHandler, type Response, Router } from 'express';
import { z } from 'zod';
import { parse, parseId } from '../../shared/http/validation';
import { currentActor } from '../auth/auth.middleware';
import type { BookingService } from './booking.service';

const slotSchema = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
});

const createSchema = slotSchema.extend({ resourceId: z.uuid() });

export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  /** POST /api/v1/bookings — FR-03, FR-04 (201 або 409 Conflict) */
  create = async (req: Request, res: Response): Promise<void> => {
    const input = parse(createSchema, req.body);
    const booking = await this.bookings.createBooking({ ...input, userId: currentActor(req).id });
    res.status(201).json(booking);
  };

  /** GET /api/v1/bookings/me — FR-02, FR-05 */
  listMine = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.bookings.listUserBookings(currentActor(req).id));
  };

  /** PATCH /api/v1/bookings/:id — зміна часу власного бронювання (FR-04, FR-11) */
  reschedule = async (req: Request, res: Response): Promise<void> => {
    const input = parse(slotSchema, req.body);
    res.json(await this.bookings.rescheduleBooking(parseId(req.params.id), input, currentActor(req)));
  };

  /** POST /api/v1/bookings/:id/cancel — FR-05 (власник) або примусове скасування (ADMIN) */
  cancel = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.bookings.cancelBooking(parseId(req.params.id), currentActor(req)));
  };

  router(authenticate: RequestHandler): Router {
    return Router()
      .use(authenticate)
      .post('/', this.create)
      .get('/me', this.listMine)
      .patch('/:id', this.reschedule)
      .post('/:id/cancel', this.cancel);
  }
}
