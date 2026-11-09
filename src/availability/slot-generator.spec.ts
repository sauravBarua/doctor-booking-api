import { describe, expect, it } from 'vitest';
import { generateSlots, type GenerateSlotsInput } from './slot-generator';
import { parseHm } from './time-utils';

const base = {
  slotDurationMin: 30,
  timeOffs: [],
  busy: [],
  notBefore: new Date('2000-01-01T00:00:00Z'),
  notAfter: new Date('2100-01-01T00:00:00Z'),
} satisfies Partial<GenerateSlotsInput>;

const rule = (dayOfWeek: number, start: string, end: string) => ({
  dayOfWeek,
  startMinute: parseHm(start),
  endMinute: parseHm(end),
});

const times = (slots: { time: string }[]) => slots.map((slot) => slot.time);
const starts = (slots: { start: Date }[]) => slots.map((slot) => slot.start.toISOString());

describe('generateSlots', () => {
  it('turns a Paris winter window into UTC instants (UTC+1)', () => {
    const slots = generateSlots({
      ...base,
      from: '2026-11-09',
      to: '2026-11-09',
      rules: [rule(1, '09:00', '11:00')],
    });
    expect(times(slots)).toEqual(['09:00', '09:30', '10:00', '10:30']);
    expect(slots[0].start.toISOString()).toBe('2026-11-09T08:00:00.000Z');
    expect(slots[3].end.toISOString()).toBe('2026-11-09T10:00:00.000Z');
  });

  it('keeps the same wall time in summer (UTC+2)', () => {
    const slots = generateSlots({
      ...base,
      from: '2026-07-13',
      to: '2026-07-13',
      rules: [rule(1, '09:00', '10:00')],
    });
    expect(slots[0].start.toISOString()).toBe('2026-07-13T07:00:00.000Z');
  });

  it('skips wall times that do not exist on the spring-forward day (29 March 2026)', () => {
    const slots = generateSlots({
      ...base,
      from: '2026-03-29',
      to: '2026-03-29',
      rules: [rule(7, '01:00', '04:00')],
    });
    expect(times(slots)).toEqual(['01:00', '01:30', '03:00', '03:30']);
    expect(starts(slots)).toEqual([
      '2026-03-29T00:00:00.000Z',
      '2026-03-29T00:30:00.000Z',
      '2026-03-29T01:00:00.000Z',
      '2026-03-29T01:30:00.000Z',
    ]);
  });

  it('stays consistent on the fall-back day (25 October 2026)', () => {
    const morning = generateSlots({
      ...base,
      from: '2026-10-25',
      to: '2026-10-25',
      rules: [rule(7, '08:00', '09:00')],
    });
    expect(starts(morning)).toEqual(['2026-10-25T07:00:00.000Z', '2026-10-25T07:30:00.000Z']);

    const night = generateSlots({
      ...base,
      from: '2026-10-25',
      to: '2026-10-25',
      rules: [rule(7, '00:00', '06:00')],
    });
    expect(night).toHaveLength(12);
    expect(new Set(starts(night)).size).toBe(12);
  });

  it('removes a whole day for a whole-day time off', () => {
    const slots = generateSlots({
      ...base,
      from: '2026-11-09',
      to: '2026-11-09',
      rules: [rule(1, '09:00', '11:00')],
      timeOffs: [{ date: '2026-11-09', startMinute: null, endMinute: null }],
    });
    expect(slots).toEqual([]);
  });

  it('removes only the overlapping slots for a partial time off', () => {
    const slots = generateSlots({
      ...base,
      from: '2026-11-09',
      to: '2026-11-09',
      rules: [rule(1, '09:00', '11:00')],
      timeOffs: [
        { date: '2026-11-09', startMinute: parseHm('09:30'), endMinute: parseHm('10:30') },
      ],
    });
    expect(times(slots)).toEqual(['09:00', '10:30']);
  });

  it('removes booked slots but keeps adjacent ones', () => {
    const slots = generateSlots({
      ...base,
      from: '2026-11-09',
      to: '2026-11-09',
      rules: [rule(1, '09:00', '11:00')],
      busy: [{ start: new Date('2026-11-09T08:00:00Z'), end: new Date('2026-11-09T08:30:00Z') }],
    });
    expect(times(slots)).toEqual(['09:30', '10:00', '10:30']);
  });

  it('respects the earliest and latest bookable instants', () => {
    const slots = generateSlots({
      ...base,
      from: '2026-11-09',
      to: '2026-11-09',
      rules: [rule(1, '09:00', '11:00')],
      notBefore: new Date('2026-11-09T08:45:00Z'),
      notAfter: new Date('2026-11-09T09:30:00Z'),
    });
    expect(times(slots)).toEqual(['10:00', '10:30']);
  });

  it('merges several windows in one day in time order', () => {
    const slots = generateSlots({
      ...base,
      from: '2026-11-09',
      to: '2026-11-09',
      rules: [rule(1, '14:00', '15:00'), rule(1, '09:00', '10:00')],
    });
    expect(times(slots)).toEqual(['09:00', '09:30', '14:00', '14:30']);
  });

  it('drops a slot that would run past the end of the window', () => {
    const slots = generateSlots({
      ...base,
      from: '2026-11-09',
      to: '2026-11-09',
      rules: [rule(1, '09:00', '10:15')],
    });
    expect(times(slots)).toEqual(['09:00', '09:30']);
  });

  it('skips days that have no rule', () => {
    const slots = generateSlots({
      ...base,
      from: '2026-11-09',
      to: '2026-11-11',
      rules: [rule(1, '09:00', '09:30'), rule(3, '09:00', '09:30')],
    });
    expect(slots.map((slot) => slot.date)).toEqual(['2026-11-09', '2026-11-11']);
  });
});
