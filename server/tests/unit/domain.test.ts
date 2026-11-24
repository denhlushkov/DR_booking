import { describe, expect, it } from 'vitest';
import { Booking } from '../../src/domain/booking';
import { BookingStatus, ResourceStatus, ResourceType } from '../../src/domain/enums';
import { BusinessRuleError, ValidationError } from '../../src/shared/errors';
import { at, makeResource } from '../helpers/fakes';

const booking = (start: string, end: string, resourceId = 'r1') =>
  Booking.create({ id: 'b1', userId: 'u1', resourceId, startTime: at(start), endTime: at(end) }, at('2026-01-01T00:00:00Z'));

describe('Booking', () => {
  it('створюється у стані CONFIRMED', () => {
    expect(booking('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z').status).toBe(BookingStatus.CONFIRMED);
  });

  it('відхиляє інтервал, де кінець не пізніше за початок', () => {
    expect(() => booking('2026-12-01T11:00:00Z', '2026-12-01T11:00:00Z')).toThrow(ValidationError);
  });

  it('суміжні слоти не перетинаються (інтервал [start, end))', () => {
    const b = booking('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
    expect(b.overlaps({ start: at('2026-12-01T11:00:00Z'), end: at('2026-12-01T12:00:00Z') })).toBe(false);
    expect(b.overlaps({ start: at('2026-12-01T10:30:00Z'), end: at('2026-12-01T11:30:00Z') })).toBe(true);
  });

  it('не дозволяє скасувати вже скасоване бронювання', () => {
    const b = booking('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z');
    b.cancel();
    expect(b.status).toBe(BookingStatus.CANCELLED);
    expect(() => b.cancel()).toThrow(BusinessRuleError);
  });
});

describe('Resource', () => {
  it('недоступний, якщо перебуває на обслуговуванні', () => {
    const r = makeResource({ status: ResourceStatus.MAINTENANCE });
    expect(r.isAvailable(at('2026-12-01T10:00:00Z'), at('2026-12-01T11:00:00Z'))).toBe(false);
  });

  it('недоступний при перетині з активним бронюванням і доступний після його скасування', () => {
    const r = makeResource();
    const b = booking('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z', r.id);
    const start = at('2026-12-01T10:30:00Z');
    const end = at('2026-12-01T11:30:00Z');
    expect(r.isAvailable(start, end, [b])).toBe(false);
    b.cancel();
    expect(r.isAvailable(start, end, [b])).toBe(true);
  });

  it('перевіряє місткість лише для переговорних кімнат (FR-12)', () => {
    const room = makeResource({ type: ResourceType.MEETING_ROOM, attributes: { capacity: 4 } });
    const desk = makeResource({ type: ResourceType.DESK });
    expect(room.fitsParticipants(4)).toBe(true);
    expect(room.fitsParticipants(5)).toBe(false);
    expect(desk.fitsParticipants(10)).toBe(true);
  });

  it('фільтрує за обладнанням без урахування регістру', () => {
    const r = makeResource({ attributes: { equipment: ['Monitor', 'docking'] } });
    expect(r.hasEquipment(['monitor'])).toBe(true);
    expect(r.hasEquipment(['monitor', 'tv'])).toBe(false);
  });
});
