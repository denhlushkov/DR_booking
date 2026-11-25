import { BusinessRuleError, ValidationError } from '../shared/errors';
import { rangesOverlap, type TimeRange } from '../shared/time-range';
import { BookingStatus } from './enums';

export interface BookingProps {
  id: string;
  userId: string;
  resourceId: string;
  startTime: Date;
  endTime: Date;
  status: BookingStatus;
  createdAt: Date;
  /** Коли надіслано нагадування (FR-11); null — ще не надсилалось. */
  reminderSentAt?: Date | null;
}

/**
 * Бронювання ресурсу на часовий слот (діаграма класів: Booking).
 * Інкапсулює переходи станів; правила офісу (мін. тривалість, дедлайн скасування)
 * винесені в BookingPolicy, щоб їх можна було змінювати без зміни сутності (OCP).
 * Час слота змінюється лише через reschedule().
 */
export class Booking {
  readonly id: string;
  readonly userId: string;
  readonly resourceId: string;
  startTime: Date;
  endTime: Date;
  status: BookingStatus;
  readonly createdAt: Date;
  reminderSentAt: Date | null;

  constructor(props: BookingProps) {
    assertInterval(props.startTime, props.endTime);
    this.id = props.id;
    this.userId = props.userId;
    this.resourceId = props.resourceId;
    this.startTime = props.startTime;
    this.endTime = props.endTime;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.reminderSentAt = props.reminderSentAt ?? null;
  }

  /**
   * Фабрика нового бронювання. Відповідає методу confirm() з діаграми класів:
   * бронювання створюється одразу підтвердженим — після успішної перевірки колізій у транзакції.
   */
  static create(
    input: Pick<BookingProps, 'id' | 'userId' | 'resourceId' | 'startTime' | 'endTime'>,
    now: Date,
  ): Booking {
    return new Booking({ ...input, status: BookingStatus.CONFIRMED, createdAt: now });
  }

  get range(): TimeRange {
    return { start: this.startTime, end: this.endTime };
  }

  isActive(): boolean {
    return this.status === BookingStatus.CONFIRMED;
  }

  overlaps(range: TimeRange): boolean {
    return rangesOverlap(this.range, range);
  }

  /** Перенесення на інший час; нагадування буде надіслано повторно. */
  reschedule(startTime: Date, endTime: Date): void {
    this.assertActive('Змінити можна лише активне бронювання');
    assertInterval(startTime, endTime);
    this.startTime = startTime;
    this.endTime = endTime;
    this.reminderSentAt = null;
  }

  cancel(): void {
    this.assertActive('Скасувати можна лише активне бронювання');
    this.status = BookingStatus.CANCELLED;
  }

  complete(): void {
    this.assertActive('Завершити можна лише активне бронювання');
    this.status = BookingStatus.COMPLETED;
  }

  private assertActive(message: string): void {
    if (!this.isActive()) throw new BusinessRuleError(message);
  }
}

function assertInterval(startTime: Date, endTime: Date): void {
  if (endTime <= startTime) {
    throw new ValidationError('Час завершення має бути пізнішим за час початку');
  }
}
