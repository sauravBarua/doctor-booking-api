import { DateTime } from 'luxon';
import { APP_TIMEZONE } from '../common/constants';
import { addDays, formatHm, isoWeekday } from './time-utils';

export interface RuleInput {
  dayOfWeek: number; // ISO: Monday = 1 ... Sunday = 7
  startMinute: number; // minutes after local (Paris) midnight
  endMinute: number;
}

export interface TimeOffInput {
  date: string; // YYYY-MM-DD, Paris
  startMinute: number | null; // null + null = the whole day
  endMinute: number | null;
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface Slot {
  start: Date;
  end: Date;
  date: string;
  time: string; // local HH:mm
}

export interface GenerateSlotsInput {
  from: string; // inclusive, Paris date
  to: string; // inclusive, Paris date
  slotDurationMin: number;
  rules: readonly RuleInput[];
  timeOffs: readonly TimeOffInput[];
  busy: readonly Interval[]; // booked appointments (Phase 3)
  notBefore: Date;
  notAfter: Date;
}

function overlapsTimeOff(off: TimeOffInput, startMinute: number, endMinute: number): boolean {
  return (
    off.startMinute !== null &&
    off.endMinute !== null &&
    off.startMinute < endMinute &&
    off.endMinute > startMinute
  );
}

export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const rulesByDay = new Map<number, RuleInput[]>();
  for (const rule of input.rules) {
    rulesByDay.set(rule.dayOfWeek, [...(rulesByDay.get(rule.dayOfWeek) ?? []), rule]);
  }
  const offsByDate = new Map<string, TimeOffInput[]>();
  for (const off of input.timeOffs) {
    offsByDate.set(off.date, [...(offsByDate.get(off.date) ?? []), off]);
  }

  const duration = input.slotDurationMin;
  const slots: Slot[] = [];

  for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
    const rules = rulesByDay.get(isoWeekday(date));
    if (!rules) continue;

    const offs = offsByDate.get(date) ?? [];
    if (offs.some((off) => off.startMinute === null || off.endMinute === null)) continue;

    const [year, month, day] = date.split('-').map(Number);

    for (const rule of rules) {
      for (let minute = rule.startMinute; minute + duration <= rule.endMinute; minute += duration) {
        const local = DateTime.fromObject(
          { year, month, day, hour: Math.floor(minute / 60), minute: minute % 60 },
          { zone: APP_TIMEZONE },
        );
        // A wall time inside the spring-forward gap does not exist: Luxon shifts it, we skip it.
        if (local.hour * 60 + local.minute !== minute) continue;

        const start = local.toJSDate();
        const end = new Date(start.getTime() + duration * 60_000);

        if (start < input.notBefore || start > input.notAfter) continue;
        if (offs.some((off) => overlapsTimeOff(off, minute, minute + duration))) continue;
        if (input.busy.some((busy) => busy.start < end && busy.end > start)) continue;

        slots.push({ start, end, date, time: formatHm(minute) });
      }
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
