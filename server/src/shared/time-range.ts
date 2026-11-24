/** Часовий інтервал у форматі [start, end) — кінець не включається. */
export interface TimeRange {
  start: Date;
  end: Date;
}

const MS_IN_MINUTE = 60_000;

/**
 * Перевірка перетину напіввідкритих інтервалів.
 * 10:00–11:00 та 11:00–12:00 НЕ перетинаються, тож слоти можна ставити впритул.
 */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function durationMinutes(range: TimeRange): number {
  return (range.end.getTime() - range.start.getTime()) / MS_IN_MINUTE;
}

/** Тривалість перетину двох інтервалів у хвилинах (0, якщо не перетинаються). */
export function overlapMinutes(a: TimeRange, b: TimeRange): number {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  return end > start ? (end - start) / MS_IN_MINUTE : 0;
}
