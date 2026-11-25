import { describe, expect, it } from 'vitest';
import { buildDaySlots } from '../src/utils/slots';

const hhmm = (d: Date) => d.toTimeString().slice(0, 5);

describe('buildDaySlots (FR-10)', () => {
  const date = '2026-12-01';
  const local = (time: string) => new Date(`${date}T${time}`).toISOString();
  const now = new Date(`${date}T07:00`);

  it('будує слоти робочого дня з кроком 30 хв', () => {
    const slots = buildDaySlots(date, [], { durationMinutes: 60, now });
    expect(slots).toHaveLength(23); // 08:00 … 19:00
    expect(hhmm(slots[0].start)).toBe('08:00');
    expect(hhmm(slots.at(-1)!.end)).toBe('20:00');
    expect(slots.every((s) => s.free)).toBe(true);
  });

  it('позначає зайнятими слоти, що перетинаються з бронюваннями', () => {
    const busy = [{ bookingId: 'b1', startTime: local('10:00'), endTime: local('11:00') }];
    const slots = buildDaySlots(date, busy, { durationMinutes: 60, now });
    const state = Object.fromEntries(slots.map((s) => [hhmm(s.start), s.free]));
    expect(state['09:00']).toBe(true); // 09:00–10:00 суміжний
    expect(state['09:30']).toBe(false);
    expect(state['10:30']).toBe(false);
    expect(state['11:00']).toBe(true);
  });

  it('слоти в минулому недоступні', () => {
    const slots = buildDaySlots(date, [], { durationMinutes: 30, now: new Date(`${date}T12:10`) });
    expect(slots.find((s) => hhmm(s.start) === '12:00')!.free).toBe(false);
    expect(slots.find((s) => hhmm(s.start) === '12:30')!.free).toBe(true);
  });
});
