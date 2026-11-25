/**
 * Абстракція поточного часу (DIP): бізнес-правила на кшталт «скасування за 15 хв»
 * залежать від інтерфейсу, тому в тестах час можна зафіксувати.
 */
export interface IClock {
  now(): Date;
}

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
