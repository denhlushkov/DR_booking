import type { Booking } from '../../domain/booking';
import type { Resource } from '../../domain/resource';
import { ValidationError } from '../../shared/errors';
import { durationMinutes, overlapMinutes, type TimeRange } from '../../shared/time-range';
import type { WorkSchedule } from '../../shared/work-schedule';
import type { IBookingRepository } from '../bookings/booking.repository';
import type {
  IResourceStatusHistoryRepository,
  ResourceDowntime,
} from '../resources/resource-status-history.repository';
import type { IResourceRepository } from '../resources/resource.repository';

export interface UtilizationRow {
  resourceId: string;
  resourceName: string;
  type: Resource['type'];
  floor: number;
  bookedHours: number;
  availableHours: number;
  downtimeHours: number;
  utilizationPercent: number;
}

const MAX_PERIOD_DAYS = 93;

/**
 * FR-07: звіт завантаженості (діаграма класів: ReportGenerator).
 *
 *   завантаженість = Σ тривалості бронювань / Σ тривалості доступності × 100%
 *
 * Доступність рахується лише в робочих вікнах офісу (WorkSchedule, напр. Пн–Пт 08:00–20:00)
 * і за вирахуванням часу, коли ресурс був на обслуговуванні чи заблокований (історія статусів).
 */
export class ReportGenerator {
  constructor(
    private readonly resources: IResourceRepository,
    private readonly bookings: IBookingRepository,
    private readonly statusHistory: IResourceStatusHistoryRepository,
    private readonly schedule: WorkSchedule,
  ) {}

  async calculateUtilizationRate(resourceId: string, period: TimeRange): Promise<number> {
    const rows = await this.buildReport(period, resourceId);
    if (!rows.length) throw new ValidationError('Ресурс не знайдено');
    return rows[0].utilizationPercent;
  }

  async buildReport(period: TimeRange, onlyResourceId?: string): Promise<UtilizationRow[]> {
    assertPeriod(period);
    const [allResources, bookings, downtime] = await Promise.all([
      this.resources.findAll(),
      this.bookings.findForReport(period),
      this.statusHistory.findOverlapping(period),
    ]);
    const windows = this.schedule.windows(period);
    const resources = onlyResourceId ? allResources.filter((r) => r.id === onlyResourceId) : allResources;

    return resources.map((r) => ({
      resourceId: r.id,
      resourceName: r.name,
      type: r.type,
      floor: r.floor,
      ...utilization(r.id, windows, period, bookings, downtime),
    }));
  }

  async generateCSVReport(startDate: Date, endDate: Date): Promise<string> {
    const rows = await this.buildReport({ start: startDate, end: endDate });
    const header = [
      'resource_id',
      'resource_name',
      'type',
      'floor',
      'booked_hours',
      'available_hours',
      'downtime_hours',
      'utilization_percent',
    ];
    const lines = rows.map((r) =>
      [
        r.resourceId,
        r.resourceName,
        r.type,
        r.floor,
        r.bookedHours,
        r.availableHours,
        r.downtimeHours,
        r.utilizationPercent,
      ]
        .map(csvCell)
        .join(','),
    );
    return [header.join(','), ...lines].join('\r\n');
  }
}

function utilization(
  resourceId: string,
  windows: readonly TimeRange[],
  period: TimeRange,
  bookings: readonly Booking[],
  downtime: readonly ResourceDowntime[],
) {
  const downtimeRanges = downtime
    .filter((d) => d.resourceId === resourceId)
    .map((d) => ({ start: d.startedAt, end: d.endedAt ?? period.end }));
  const bookingRanges = bookings.filter((b) => b.resourceId === resourceId).map((b) => b.range);

  const sumIn = (ranges: TimeRange[]) =>
    windows.reduce((total, w) => total + ranges.reduce((s, r) => s + overlapMinutes(w, r), 0), 0);

  const workingMinutes = windows.reduce((total, w) => total + durationMinutes(w), 0);
  const downtimeMinutes = Math.min(workingMinutes, sumIn(downtimeRanges));
  const availableMinutes = workingMinutes - downtimeMinutes;
  const bookedMinutes = sumIn(bookingRanges);
  const percent = availableMinutes > 0 ? Math.min(100, (bookedMinutes / availableMinutes) * 100) : 0;

  return {
    bookedHours: round(bookedMinutes / 60),
    availableHours: round(availableMinutes / 60),
    downtimeHours: round(downtimeMinutes / 60),
    utilizationPercent: round(percent),
  };
}

function assertPeriod(period: TimeRange): void {
  const { start, end } = period;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new ValidationError('Некоректний період звіту');
  }
  if (end.getTime() - start.getTime() > MAX_PERIOD_DAYS * 86_400_000) {
    throw new ValidationError(`Період звіту не може перевищувати ${MAX_PERIOD_DAYS} днів`);
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Екранування за RFC 4180 + захист від CSV-ін'єкцій формул у Excel. */
function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
