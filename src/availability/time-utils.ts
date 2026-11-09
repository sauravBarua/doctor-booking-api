import { DateTime } from 'luxon';
import { APP_TIMEZONE } from '../common/constants';

function isoDateOf(value: DateTime): string {
  const iso = value.toISODate();
  if (!iso) throw new Error('Invalid date');
  return iso;
}

/** "09:30" -> 570. "24:00" -> 1440 (valid as an end time). */
export function parseHm(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

/** 570 -> "09:30" */
export function formatHm(totalMinutes: number): string {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** Today's calendar date in Paris, as YYYY-MM-DD. */
export function parisToday(now: Date = new Date()): string {
  return isoDateOf(DateTime.fromJSDate(now, { zone: APP_TIMEZONE }));
}

/** Calendar arithmetic on YYYY-MM-DD strings. Done in UTC so DST can never shift a date. */
export function addDays(date: string, days: number): string {
  return isoDateOf(DateTime.fromISO(date, { zone: 'utc' }).plus({ days }));
}

export function daysBetween(from: string, to: string): number {
  const a = DateTime.fromISO(from, { zone: 'utc' });
  const b = DateTime.fromISO(to, { zone: 'utc' });
  return Math.round(b.diff(a, 'days').days);
}

/** ISO weekday: Monday = 1 ... Sunday = 7. */
export function isoWeekday(date: string): number {
  return DateTime.fromISO(date, { zone: 'utc' }).weekday;
}

/** The UTC instant at which a Paris calendar date starts (00:00 Paris). */
export function parisStartOfDay(date: string): Date {
  return DateTime.fromISO(date, { zone: APP_TIMEZONE }).startOf('day').toJSDate();
}
