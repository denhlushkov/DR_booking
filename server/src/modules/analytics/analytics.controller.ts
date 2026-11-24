import { type Request, type RequestHandler, type Response, Router } from 'express';
import { z } from 'zod';
import { Role } from '../../domain/enums';
import { parse } from '../../shared/http/validation';
import { requireRole } from '../auth/auth.middleware';
import type { ReportGenerator } from './report-generator';

const periodSchema = z.object({ from: z.coerce.date(), to: z.coerce.date() });

export class AnalyticsController {
  constructor(private readonly reports: ReportGenerator) {}

  /** GET /api/v1/analytics/utilization?from&to — JSON-звіт */
  utilization = async (req: Request, res: Response): Promise<void> => {
    const { from, to } = parse(periodSchema, req.query);
    res.json(await this.reports.buildReport({ start: from, end: to }));
  };

  /** GET /api/v1/analytics/utilization.csv?from&to — FR-07 */
  utilizationCsv = async (req: Request, res: Response): Promise<void> => {
    const { from, to } = parse(periodSchema, req.query);
    const csv = await this.reports.generateCSVReport(from, to);
    const fileName = `utilization_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`;
    res
      .attachment(fileName)
      .type('text/csv; charset=utf-8')
      // BOM — щоб Excel коректно відкрив кирилицю.
      .send(`﻿${csv}`);
  };

  router(authenticate: RequestHandler): Router {
    return Router()
      .use(authenticate, requireRole(Role.ADMIN))
      .get('/utilization', this.utilization)
      .get('/utilization.csv', this.utilizationCsv);
  }
}
