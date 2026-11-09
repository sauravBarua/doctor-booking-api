import { DateTime } from 'luxon';
import { APP_TIMEZONE } from '../../src/common/constants';

/** The first Paris date with the given ISO weekday that is at least `minDaysAhead` days away. */
export function nextDate(weekday: number, minDaysAhead = 2): string {
  let day = DateTime.now().setZone(APP_TIMEZONE).startOf('day').plus({ days: minDaysAhead });
  while (day.weekday !== weekday) day = day.plus({ days: 1 });
  const iso = day.toISODate();
  if (!iso) throw new Error('Invalid date');
  return iso;
}

/** The UTC instant (ISO string) of a Paris wall time, as the API formats it. */
export function parisInstant(date: string, time: string): string {
  const iso = DateTime.fromISO(`${date}T${time}`, { zone: APP_TIMEZONE }).toUTC().toISO();
  if (!iso) throw new Error('Invalid instant');
  return iso;
}
