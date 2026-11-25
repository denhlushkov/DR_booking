import type { BusySlot } from '../types';

export interface DaySlot {
  start: Date;
  end: Date;
  /** Слот у майбутньому і не перетинається з жодним зайнятим інтервалом. */
  free: boolean;
}

export interface DaySlotOptions {
  durationMinutes: number;
  dayStart?: string;
  dayEnd?: string;
  stepMinutes?: number;
  now?: Date;
}

const MS_IN_MINUTE = 60_000;

/**
 * FR-10: сітка можливих початків бронювання на день (крок 30 хв, робочий день 08:00–20:00).
 * Межі дня беруться в локальному часі браузера.
 */
export function buildDaySlots(date: string, busy: readonly BusySlot[], options: DaySlotOptions): DaySlot[] {
  const { durationMinutes, dayStart = '08:00', dayEnd = '20:00', stepMinutes = 30, now = new Date() } = options;
  const first = new Date(`${date}T${dayStart}`);
  const last = new Date(`${date}T${dayEnd}`);
  const busyRanges = busy.map((b) => ({ start: new Date(b.startTime), end: new Date(b.endTime) }));
  const slots: DaySlot[] = [];

  for (let t = first.getTime(); t + durationMinutes * MS_IN_MINUTE <= last.getTime(); t += stepMinutes * MS_IN_MINUTE) {
    const start = new Date(t);
    const end = new Date(t + durationMinutes * MS_IN_MINUTE);
    const overlaps = busyRanges.some((b) => start < b.end && b.start < end);
    slots.push({ start, end, free: start >= now && !overlaps });
  }
  return slots;
}

/** Межі локального дня у форматі ISO — для запиту розкладу на сервер. */
export function dayBounds(date: string): { from: string; to: string } {
  const start = new Date(`${date}T00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}
