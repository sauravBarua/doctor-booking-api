import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BOOKING_MIN_NOTICE_MINUTES,
  MAX_BOOKING_HORIZON_DAYS,
  MAX_SLOT_RANGE_DAYS,
  APP_TIMEZONE,
} from '../common/constants';
import { isExclusionViolation } from '../common/utils/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTimeOffDto, ReplaceAvailabilityDto, SlotsQueryDto } from './availability.dto';
import { generateSlots, type Interval } from './slot-generator';
import { addDays, daysBetween, formatHm, parisToday, parseHm } from './time-utils';

const toDbDate = (isoDate: string): Date => new Date(`${isoDate}T00:00:00.000Z`);
const fromDbDate = (date: Date): string => date.toISOString().slice(0, 10);

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireProfile(userId: string) {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Doctor profile not found');
    return profile;
  }

  async getRules(userId: string) {
    const { id } = await this.requireProfile(userId);
    const rules = await this.prisma.availabilityRule.findMany({
      where: { doctorId: id },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    });
    return rules.map((rule) => ({
      id: rule.id,
      dayOfWeek: rule.dayOfWeek,
      start: formatHm(rule.startMinute),
      end: formatHm(rule.endMinute),
    }));
  }

  async replaceRules(userId: string, dto: ReplaceAvailabilityDto) {
    const { id } = await this.requireProfile(userId);
    try {
      await this.prisma.$transaction([
        this.prisma.availabilityRule.deleteMany({ where: { doctorId: id } }),
        this.prisma.availabilityRule.createMany({
          data: dto.rules.map((rule) => ({
            doctorId: id,
            dayOfWeek: rule.dayOfWeek,
            startMinute: parseHm(rule.start),
            endMinute: parseHm(rule.end),
          })),
        }),
      ]);
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictException('Availability rules must not overlap');
      }
      throw error;
    }
    return this.getRules(userId);
  }

  private toTimeOffView(row: {
    id: string;
    date: Date;
    startMinute: number | null;
    endMinute: number | null;
    reason: string | null;
  }) {
    return {
      id: row.id,
      date: fromDbDate(row.date),
      start: row.startMinute === null ? null : formatHm(row.startMinute),
      end: row.endMinute === null ? null : formatHm(row.endMinute),
      reason: row.reason,
    };
  }

  async listTimeOff(userId: string) {
    const { id } = await this.requireProfile(userId);
    const rows = await this.prisma.timeOff.findMany({
      where: { doctorId: id, date: { gte: toDbDate(parisToday()) } },
      orderBy: [{ date: 'asc' }, { startMinute: 'asc' }],
    });
    return rows.map((row) => this.toTimeOffView(row));
  }

  async addTimeOff(userId: string, dto: CreateTimeOffDto) {
    const { id } = await this.requireProfile(userId);
    if (dto.date < parisToday()) throw new BadRequestException('The date is in the past');

    const row = await this.prisma.timeOff.create({
      data: {
        doctorId: id,
        date: toDbDate(dto.date),
        startMinute: dto.start === undefined ? null : parseHm(dto.start),
        endMinute: dto.end === undefined ? null : parseHm(dto.end),
        reason: dto.reason,
      },
    });
    return this.toTimeOffView(row);
  }

  async removeTimeOff(userId: string, timeOffId: string): Promise<void> {
    const { id } = await this.requireProfile(userId);
    const { count } = await this.prisma.timeOff.deleteMany({
      where: { id: timeOffId, doctorId: id },
    });
    if (count === 0) throw new NotFoundException('Time off not found');
  }

  /** Booked intervals that block slots. Phase 3 replaces this with a query on appointments. */
  private loadBusy(_doctorId: string, _from: string, _to: string): Promise<Interval[]> {
    return Promise.resolve([]);
  }

  async getSlots(doctorId: string, query: SlotsQueryDto, now: Date = new Date()) {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id: doctorId, user: { isActive: true } },
      select: { id: true, slotDurationMin: true },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const from = query.from ?? parisToday(now);
    const to = query.to ?? addDays(from, 6);
    if (to < from) throw new BadRequestException('"to" must not be before "from"');
    if (daysBetween(from, to) + 1 > MAX_SLOT_RANGE_DAYS) {
      throw new BadRequestException(`The range may cover at most ${MAX_SLOT_RANGE_DAYS} days`);
    }

    const [rules, timeOffs, busy] = await Promise.all([
      this.prisma.availabilityRule.findMany({ where: { doctorId: doctor.id } }),
      this.prisma.timeOff.findMany({
        where: { doctorId: doctor.id, date: { gte: toDbDate(from), lte: toDbDate(to) } },
      }),
      this.loadBusy(doctor.id, from, to),
    ]);

    const slots = generateSlots({
      from,
      to,
      slotDurationMin: doctor.slotDurationMin,
      rules,
      timeOffs: timeOffs.map((row) => ({
        date: fromDbDate(row.date),
        startMinute: row.startMinute,
        endMinute: row.endMinute,
      })),
      busy,
      notBefore: new Date(now.getTime() + BOOKING_MIN_NOTICE_MINUTES * 60_000),
      notAfter: new Date(now.getTime() + MAX_BOOKING_HORIZON_DAYS * 24 * 60 * 60_000),
    });

    return {
      doctorId: doctor.id,
      timezone: APP_TIMEZONE,
      slotDurationMin: doctor.slotDurationMin,
      from,
      to,
      slots: slots.map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        date: slot.date,
        time: slot.time,
      })),
    };
  }
}
