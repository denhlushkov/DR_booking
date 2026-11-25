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
}

/**
 * Бронювання ресурсу на часовий слот (діаграма класів: Booking).
 * Інкапсулює переходи станів; правила офісу (мін. тривалість, дедлайн скасування)
 * винесені в BookingPolicy, щоб їх можна було змінювати без зміни сутності (OCP).
 */
export class Booking {
  readonly id: string;
  readonly userId: string;
  readonly resourceId: string;
  readonly startTime: Date;
  readonly endTime: Date;
  status: BookingStatus;
  readonly createdAt: Date;

  constructor(props: BookingProps) {
    if (props.endTime <= props.startTime) {
      throw new ValidationError('Час завершення має бути пізнішим за час початку');
    }
    this.id = props.id;
    this.userId = props.userId;
    this.resourceId = props.resourceId;
    this.startTime = props.startTime;
    this.endTime = props.endTime;
    this.status = props.status;
    this.createdAt = props.createdAt;
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

  cancel(): void {
    if (!this.isActive()) {
      throw new BusinessRuleError('Скасувати можна лише активне бронювання');
    }
    this.status = BookingStatus.CANCELLED;
  }

  complete(): void {
    if (!this.isActive()) {
      throw new BusinessRuleError('Завершити можна лише активне бронювання');
    }
    this.status = BookingStatus.COMPLETED;
  }
}
