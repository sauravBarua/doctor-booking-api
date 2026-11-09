import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, formatHm, isoWeekday, parisToday, parseHm } from './time-utils';

describe('time utils', () => {
  it('converts between HH:mm and minutes', () => {
    expect(parseHm('09:30')).toBe(570);
    expect(parseHm('24:00')).toBe(1440);
    expect(formatHm(570)).toBe('09:30');
    expect(formatHm(0)).toBe('00:00');
  });

  it('knows the Paris date in winter (UTC+1)', () => {
    expect(parisToday(new Date('2026-11-08T23:30:00Z'))).toBe('2026-11-09');
  });

  it('knows the Paris date in summer (UTC+2)', () => {
    expect(parisToday(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15');
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('counts calendar days across a DST change', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('numbers weekdays Monday = 1 to Sunday = 7', () => {
    expect(isoWeekday('2026-11-09')).toBe(1);
    expect(isoWeekday('2026-03-29')).toBe(7);
  });
});
