import { describe, expect, it } from 'vitest';
import { parseTimeOfDay, WorkSchedule } from '../../src/shared/work-schedule';
import { at } from '../helpers/fakes';

const kyiv = new WorkSchedule({
  timeZone: 'Europe/Kyiv',
  dayStartMinutes: parseTimeOfDay('08:00'),
  dayEndMinutes: parseTimeOfDay('20:00'),
  workDays: [1, 2, 3, 4, 5],
});

const iso = (ranges: { start: Date; end: Date }[]) =>
  ranges.map((r) => `${r.start.toISOString()} – ${r.end.toISOString()}`);

describe('WorkSchedule (NFR-03: 08:00–20:00 за київським часом)', () => {
  it('переводить робочі години Києва в UTC взимку (UTC+2)', () => {
    // 01.12.2026 — вівторок
    expect(iso(kyiv.windows({ start: at('2026-11-30T22:00:00Z'), end: at('2026-12-01T22:00:00Z') }))).toEqual([
      '2026-12-01T06:00:00.000Z – 2026-12-01T18:00:00.000Z',
    ]);
  });

  it('враховує літній час (UTC+3)', () => {
    // 01.07.2026 — середа
    expect(iso(kyiv.windows({ start: at('2026-06-30T21:00:00Z'), end: at('2026-07-01T21:00:00Z') }))).toEqual([
      '2026-07-01T05:00:00.000Z – 2026-07-01T17:00:00.000Z',
    ]);
  });

  it('пропускає вихідні та обрізає вікна межами періоду', () => {
    // 04.12.2026 (пт) 15:00 Києва … 07.12.2026 (пн) 10:00 Києва
    expect(iso(kyiv.windows({ start: at('2026-12-04T13:00:00Z'), end: at('2026-12-07T08:00:00Z') }))).toEqual([
      '2026-12-04T13:00:00.000Z – 2026-12-04T18:00:00.000Z',
      '2026-12-07T06:00:00.000Z – 2026-12-07T08:00:00.000Z',
    ]);
  });

  it('валідує формат часу', () => {
    expect(parseTimeOfDay('09:30')).toBe(570);
    expect(() => parseTimeOfDay('25:00')).toThrow();
  });
});
