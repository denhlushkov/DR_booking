import { describe, expect, it } from 'vitest';
import { Booking } from '../../src/domain/booking';
import { ResourceStatus } from '../../src/domain/enums';
import { ReportGenerator } from '../../src/modules/analytics/report-generator';
import { ValidationError } from '../../src/shared/errors';
import { parseTimeOfDay, WorkSchedule } from '../../src/shared/work-schedule';
import { at, makeResource, memoryStore } from '../helpers/fakes';

/** Графік в UTC, щоб числа в тесті легко перевіряти: щодня 08:00–20:00. */
const schedule = new WorkSchedule({
  timeZone: 'UTC',
  dayStartMinutes: parseTimeOfDay('08:00'),
  dayEndMinutes: parseTimeOfDay('20:00'),
  workDays: [0, 1, 2, 3, 4, 5, 6],
});

// 2 доби = 2 робочі вікна по 12 год = 24 год доступності.
const period = { start: at('2026-12-01T00:00:00Z'), end: at('2026-12-03T00:00:00Z') };

async function setup() {
  const store = memoryStore();
  const desk = makeResource({ name: 'Стіл, "A"' });
  await store.resources.insert(desk);

  const add = async (id: string, start: string, end: string) => {
    const b = Booking.create(
      { id, userId: 'u1', resourceId: desk.id, startTime: at(start), endTime: at(end) },
      at('2026-11-01T00:00:00Z'),
    );
    await store.bookings.insert(b);
    return b;
  };
  await add('b1', '2026-12-01T08:00:00Z', '2026-12-01T14:00:00Z'); // 6 год у робочому вікні
  await add('b2', '2026-12-01T19:00:00Z', '2026-12-01T21:00:00Z'); // лише 1 год у вікні
  const cancelled = await add('b3', '2026-12-02T08:00:00Z', '2026-12-02T10:00:00Z');
  cancelled.cancel();
  await store.bookings.save(cancelled); // скасоване не враховується

  return { store, desk, report: new ReportGenerator(store.resources, store.bookings, store.statusHistory, schedule) };
}

describe('ReportGenerator (FR-07)', () => {
  it('рахує завантаженість у робочих вікнах: бронювання / доступність × 100%', async () => {
    const { report, desk } = await setup();
    // 7 / 24 × 100 = 29.17%
    await expect(report.calculateUtilizationRate(desk.id, period)).resolves.toBe(29.17);
  });

  it('не враховує час обслуговування/блокування в доступності', async () => {
    const { report, desk, store } = await setup();
    // Ресурс на обслуговуванні 02.12 з 08:00 до 14:00 → доступність 24 − 6 = 18 год.
    await store.statusHistory.open('h1', desk.id, ResourceStatus.MAINTENANCE, at('2026-12-02T08:00:00Z'));
    await store.statusHistory.closeOpen(desk.id, at('2026-12-02T14:00:00Z'));

    const [row] = await report.buildReport(period);
    expect(row).toMatchObject({ bookedHours: 7, availableHours: 18, downtimeHours: 6, utilizationPercent: 38.89 });
  });

  it('формує CSV з екрануванням значень', async () => {
    const { report, desk } = await setup();
    const csv = await report.generateCSVReport(period.start, period.end);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe(
      'resource_id,resource_name,type,floor,booked_hours,available_hours,downtime_hours,utilization_percent',
    );
    expect(row).toBe(`${desk.id},"Стіл, ""A""",DESK,1,7,24,0,29.17`);
  });

  it('відхиляє некоректний або завеликий період', async () => {
    const { report } = await setup();
    await expect(report.generateCSVReport(period.end, period.start)).rejects.toThrow(ValidationError);
    await expect(report.generateCSVReport(at('2026-01-01T00:00:00Z'), at('2026-12-01T00:00:00Z'))).rejects.toThrow(
      ValidationError,
    );
  });
});
