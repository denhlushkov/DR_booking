import type { Booking } from '../../domain/booking';
import type { Resource } from '../../domain/resource';
import { ValidationError } from '../../shared/errors';
import { overlapMinutes, type TimeRange } from '../../shared/time-range';
import type { IBookingRepository } from '../bookings/booking.repository';
import type { IResourceRepository } from '../resources/resource.repository';

export interface UtilizationRow {
  resourceId: string;
  resourceName: string;
  type: Resource['type'];
  floor: number;
  bookedHours: number;
  availableHours: number;
  utilizationPercent: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * FR-07: звіт завантаженості (діаграма класів: ReportGenerator).
 * Завантаженість = Σ тривалості бронювань / Σ тривалості доступності × 100%.
 *
 * Спрощення MVP: доступність = кількість днів періоду × робочі хвилини на день.
 * TODO (Спринт 2): віднімати періоди MAINTENANCE/BLOCKED з історії статусів ресурсу.
 */
export class ReportGenerator {
  constructor(
    private readonly resources: IResourceRepository,
    private readonly bookings: IBookingRepository,
    private readonly workingMinutesPerDay: number,
  ) {}

  async calculateUtilizationRate(resourceId: string, period: TimeRange): Promise<number> {
    assertPeriod(period);
    const bookings = await this.bookings.findForReport(period);
    return this.utilization(resourceId, period, bookings).utilizationPercent;
  }

  async buildReport(period: TimeRange): Promise<UtilizationRow[]> {
    assertPeriod(period);
    const [resources, bookings] = await Promise.all([
      this.resources.findAll(),
      this.bookings.findForReport(period),
    ]);
    return resources.map((r) => ({
      resourceId: r.id,
      resourceName: r.name,
      type: r.type,
      floor: r.floor,
      ...this.utilization(r.id, period, bookings),
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
      'utilization_percent',
    ];
    const lines = rows.map((r) =>
      [r.resourceId, r.resourceName, r.type, r.floor, r.bookedHours, r.availableHours, r.utilizationPercent]
        .map(csvCell)
        .join(','),
    );
    return [header.join(','), ...lines].join('\r\n');
  }

  private utilization(resourceId: string, period: TimeRange, bookings: readonly Booking[]) {
    const bookedMinutes = bookings
      .filter((b) => b.resourceId === resourceId)
      .reduce((sum, b) => sum + overlapMinutes(b.range, period), 0);
    const days = Math.ceil((period.end.getTime() - period.start.getTime()) / DAY_MS);
    const availableMinutes = days * this.workingMinutesPerDay;
    const percent = availableMinutes > 0 ? Math.min(100, (bookedMinutes / availableMinutes) * 100) : 0;
    return {
      bookedHours: round(bookedMinutes / 60),
      availableHours: round(availableMinutes / 60),
      utilizationPercent: round(percent),
    };
  }
}

function assertPeriod(period: TimeRange): void {
  if (Number.isNaN(period.start.getTime()) || Number.isNaN(period.end.getTime()) || period.end <= period.start) {
    throw new ValidationError('Некоректний період звіту');
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
