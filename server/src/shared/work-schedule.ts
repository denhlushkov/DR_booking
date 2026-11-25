import type { TimeRange } from './time-range';

export interface WorkScheduleOptions {
  /** IANA-часовий пояс офісу, напр. Europe/Kyiv. */
  timeZone: string;
  /** Початок робочого дня, хвилини від півночі (08:00 → 480). */
  dayStartMinutes: number;
  /** Кінець робочого дня, хвилини від півночі (20:00 → 1200). */
  dayEndMinutes: number;
  /** Робочі дні тижня: 0 — неділя … 6 — субота. */
  workDays: readonly number[];
}

/**
 * Робочий графік офісу (NFR-03: 08:00–20:00 за київським часом).
 * Перетворює календарні дні у вікна доступності в UTC з урахуванням переходу на літній час.
 */
export class WorkSchedule {
  constructor(private readonly options: WorkScheduleOptions) {
    // Перевірка часового поясу: Intl кидає RangeError для невідомого поясу.
    new Intl.DateTimeFormat('en-US', { timeZone: options.timeZone });
    if (options.dayEndMinutes <= options.dayStartMinutes) {
      throw new Error('Кінець робочого дня має бути пізнішим за початок');
    }
  }

  get timeZone(): string {
    return this.options.timeZone;
  }

  /** Робочі вікна, що перетинаються з періодом (обрізані за його межами). */
  windows(period: TimeRange): TimeRange[] {
    const { timeZone, dayStartMinutes, dayEndMinutes, workDays } = this.options;
    const first = localDate(period.start, timeZone);
    const last = localDate(period.end, timeZone);
    const result: TimeRange[] = [];

    for (let day = Date.UTC(first.y, first.m - 1, first.d); day <= Date.UTC(last.y, last.m - 1, last.d); day += 86_400_000) {
      const date = new Date(day);
      if (!workDays.includes(date.getUTCDay())) continue;
      const parts = { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
      const start = new Date(Math.max(zonedToUtc(parts, dayStartMinutes, timeZone), period.start.getTime()));
      const end = new Date(Math.min(zonedToUtc(parts, dayEndMinutes, timeZone), period.end.getTime()));
      if (end > start) result.push({ start, end });
    }
    return result;
  }
}

/** Парсинг "HH:MM" у хвилини від півночі. */
export function parseTimeOfDay(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Очікується час у форматі HH:MM, отримано "${value}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

interface LocalDate {
  y: number;
  m: number;
  d: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(date: Date, timeZone: string) {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') };
}

function localDate(date: Date, timeZone: string): LocalDate {
  const { y, m, d } = partsIn(date, timeZone);
  return { y, m, d };
}

/** Зсув часового поясу (мс) у заданий момент: локальний час − UTC. */
function offsetAt(instant: number, timeZone: string): number {
  const p = partsIn(new Date(instant), timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(instant / 1000) * 1000;
}

/** Локальна дата + хвилини від півночі в поясі → момент часу UTC (мс). */
function zonedToUtc(date: LocalDate, minutes: number, timeZone: string): number {
  const asUtc = Date.UTC(date.y, date.m - 1, date.d, 0, minutes);
  const guess = asUtc - offsetAt(asUtc, timeZone);
  // Повторне уточнення для дат переходу на літній/зимовий час.
  return asUtc - offsetAt(guess, timeZone);
}
