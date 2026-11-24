import type { Booking } from '../../domain/booking';
import type { IClock } from '../../shared/clock';
import { BusinessRuleError, ValidationError } from '../../shared/errors';
import { durationMinutes, type TimeRange } from '../../shared/time-range';

/** Правила офісу, що задаються конфігурацією. */
export interface BookingRules {
  /** FR-03: мінімальна тривалість слота. */
  minDurationMinutes: number;
  /** FR-03: максимальна тривалість, визначена правилами офісу. */
  maxDurationMinutes: number;
  /** FR-05: скасування не пізніше ніж за N хвилин до початку. */
  cancellationCutoffMinutes: number;
}

export const DEFAULT_BOOKING_RULES: BookingRules = {
  minDurationMinutes: 30,
  maxDurationMinutes: 12 * 60,
  cancellationCutoffMinutes: 15,
};

/** Перевірка бізнес-правил бронювання (SRP: лише правила, без доступу до даних). */
export class BookingPolicy {
  constructor(
    private readonly rules: BookingRules,
    private readonly clock: IClock,
  ) {}

  assertValidInterval(range: TimeRange): void {
    if (range.end <= range.start) {
      throw new ValidationError('Час завершення має бути пізнішим за час початку');
    }
    if (range.start < this.clock.now()) {
      throw new ValidationError('Не можна бронювати слот у минулому');
    }
    const minutes = durationMinutes(range);
    if (minutes < this.rules.minDurationMinutes) {
      throw new ValidationError(`Мінімальна тривалість бронювання — ${this.rules.minDurationMinutes} хв`);
    }
    if (minutes > this.rules.maxDurationMinutes) {
      throw new ValidationError(`Максимальна тривалість бронювання — ${this.rules.maxDurationMinutes} хв`);
    }
  }

  assertCanCancel(booking: Booking): void {
    const minutesLeft = (booking.startTime.getTime() - this.clock.now().getTime()) / 60_000;
    if (minutesLeft < this.rules.cancellationCutoffMinutes) {
      throw new BusinessRuleError(
        `Скасування можливе не пізніше ніж за ${this.rules.cancellationCutoffMinutes} хв до початку`,
      );
    }
  }
}
