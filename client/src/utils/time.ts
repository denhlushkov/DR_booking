import type { Booking } from '../types';

/** Правила офісу, що дублюють серверні для миттєвої підказки в UI (сервер — джерело істини). */
export const MIN_SLOT_MINUTES = 30;
export const CANCELLATION_CUTOFF_MINUTES = 15;

const MS_IN_MINUTE = 60_000;

/** Значення полів <input type="date"> і <input type="time"> (локальний час) → ISO UTC. */
export function toIsoString(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Дата у форматі YYYY-MM-DD за локальним часом. */
export function todayInputValue(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Найближчий слот, що починається на :00 або :30 (значення для форми пошуку). */
export function nextSlotDefaults(now = new Date(), durationMinutes = 60) {
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() < 30 ? 30 : 60);
  const end = new Date(start.getTime() + durationMinutes * MS_IN_MINUTE);
  const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date: todayInputValue(start), startTime: hhmm(start), endTime: hhmm(end) };
}

/** Повертає текст помилки або null, якщо слот коректний (FR-03). */
export function validateSlot(startIso: string, endIso: string, now = new Date()): string | null {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Вкажіть дату та час';
  if (end <= start) return 'Час завершення має бути пізнішим за час початку';
  if (start < now) return 'Не можна бронювати слот у минулому';
  if ((end.getTime() - start.getTime()) / MS_IN_MINUTE < MIN_SLOT_MINUTES) {
    return `Мінімальна тривалість — ${MIN_SLOT_MINUTES} хв`;
  }
  return null;
}

/** FR-05: скасувати можна активне бронювання не пізніше ніж за 15 хв до початку. */
export function canCancel(booking: Pick<Booking, 'status' | 'startTime'>, now = new Date()): boolean {
  const minutesLeft = (new Date(booking.startTime).getTime() - now.getTime()) / MS_IN_MINUTE;
  return booking.status === 'CONFIRMED' && minutesLeft >= CANCELLATION_CUTOFF_MINUTES;
}
