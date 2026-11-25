import { describe, expect, it } from 'vitest';
import { Booking } from '../../src/domain/booking';
import {
  InMemoryBookingRepository,
  InMemoryResourceRepository,
} from '../../src/infrastructure/memory/in-memory.repositories';
import { ReportGenerator } from '../../src/modules/analytics/report-generator';
import { ValidationError } from '../../src/shared/errors';
import { at, makeResource } from '../helpers/fakes';

async function setup() {
  const resources = new InMemoryResourceRepository();
  const bookings = new InMemoryBookingRepository();
  const desk = makeResource({ name: 'Стіл, "A"' });
  await resources.insert(desk);

  const add = async (id: string, start: string, end: string) => {
    const b = Booking.create(
      { id, userId: 'u1', resourceId: desk.id, startTime: at(start), endTime: at(end) },
      at('2026-11-01T00:00:00Z'),
    );
    await bookings.insert(b);
    return b;
  };
  // 2 доби по 12 робочих годин = 24 год доступності.
  await add('b1', '2026-12-01T08:00:00Z', '2026-12-01T14:00:00Z'); // 6 год
  const cancelled = await add('b2', '2026-12-02T08:00:00Z', '2026-12-02T20:00:00Z');
  cancelled.cancel();
  await bookings.save(cancelled); // скасоване не враховується
  await add('b3', '2026-11-30T22:00:00Z', '2026-12-01T02:00:00Z'); // у періоді лише 2 год

  return { report: new ReportGenerator(resources, bookings, 12 * 60), desk };
}

const period = { start: at('2026-12-01T00:00:00Z'), end: at('2026-12-03T00:00:00Z') };

describe('ReportGenerator (FR-07)', () => {
  it('рахує завантаженість як бронювання / доступність × 100%', async () => {
    const { report, desk } = await setup();
    // (6 + 2) / 24 × 100 = 33.33%
    await expect(report.calculateUtilizationRate(desk.id, period)).resolves.toBe(33.33);
  });

  it('формує CSV з екрануванням значень', async () => {
    const { report, desk } = await setup();
    const csv = await report.generateCSVReport(period.start, period.end);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('resource_id,resource_name,type,floor,booked_hours,available_hours,utilization_percent');
    expect(row).toBe(`${desk.id},"Стіл, ""A""",DESK,1,8,24,33.33`);
  });

  it('відхиляє некоректний період', async () => {
    const { report } = await setup();
    await expect(report.generateCSVReport(period.end, period.start)).rejects.toThrow(ValidationError);
  });
});
