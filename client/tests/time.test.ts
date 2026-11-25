import { describe, expect, it } from 'vitest';
import { canCancel, nextSlotDefaults, validateSlot } from '../src/utils/time';

const NOW = new Date('2026-12-01T09:00:00Z');
const plus = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

describe('validateSlot (FR-03)', () => {
  it('приймає коректний слот від 30 хв', () => {
    expect(validateSlot(plus(60), plus(90), NOW)).toBeNull();
  });

  it('відхиляє слот коротший за 30 хв', () => {
    expect(validateSlot(plus(60), plus(75), NOW)).toMatch(/30 хв/);
  });

  it('відхиляє слот у минулому та зворотний інтервал', () => {
    expect(validateSlot(plus(-60), plus(-30), NOW)).toMatch(/минулому/);
    expect(validateSlot(plus(90), plus(60), NOW)).toMatch(/пізнішим/);
  });
});

describe('canCancel (FR-05)', () => {
  it('дозволяє скасування рівно за 15 хв і раніше', () => {
    expect(canCancel({ status: 'CONFIRMED', startTime: plus(15) }, NOW)).toBe(true);
    expect(canCancel({ status: 'CONFIRMED', startTime: plus(14) }, NOW)).toBe(false);
  });

  it('не дозволяє скасувати неактивне бронювання', () => {
    expect(canCancel({ status: 'CANCELLED', startTime: plus(120) }, NOW)).toBe(false);
  });
});

describe('nextSlotDefaults', () => {
  it('округлює початок до найближчих :00 або :30', () => {
    expect(nextSlotDefaults(new Date(2026, 11, 1, 9, 10))).toEqual({
      date: '2026-12-01',
      startTime: '09:30',
      endTime: '10:30',
    });
    expect(nextSlotDefaults(new Date(2026, 11, 1, 9, 40))).toMatchObject({ startTime: '10:00' });
  });
});
