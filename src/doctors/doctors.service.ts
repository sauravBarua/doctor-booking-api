import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isForeignKeyViolation,
  isRecordNotFound,
  isUniqueViolation,
} from '../common/utils/prisma-errors';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { doctorSelect, toPrivateDoctor, toPublicDoctor } from './doctor-view';
import type {
  AdminUpdateDoctorDto,
  CreateDoctorDto,
  SearchDoctorsQueryDto,
  UpdateMyProfileDto,
} from './doctors.dto';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchDoctorsQueryDto) {
    const rows = await this.prisma.doctorProfile.findMany({
      where: {
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        ...(query.specialtyId ? { specialtyId: query.specialtyId } : {}),
        ...(query.clinicId ? { clinicId: query.clinicId } : {}),
        user: {
          isActive: true,
          ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
        },
      },
      select: doctorSelect,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map(toPublicDoctor),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getPublic(id: string) {
    const row = await this.prisma.doctorProfile.findFirst({
      where: { id, user: { isActive: true } },
      select: doctorSelect,
    });
    if (!row) throw new NotFoundException('Doctor not found');
    return toPublicDoctor(row);
  }

  async getForAdmin(id: string) {
    const row = await this.prisma.doctorProfile.findUnique({ where: { id }, select: doctorSelect });
    if (!row) throw new NotFoundException('Doctor not found');
    return toPrivateDoctor(row);
  }

  async getMine(userId: string) {
    const row = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: doctorSelect,
    });
    if (!row) throw new NotFoundException('Doctor profile not found');
    return toPrivateDoctor(row);
  }

  async updateMine(userId: string, dto: UpdateMyProfileDto) {
    try {
      const row = await this.prisma.doctorProfile.update({
        where: { userId },
        data: dto,
        select: doctorSelect,
      });
      return toPrivateDoctor(row);
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('Doctor profile not found');
      throw error;
    }
  }

  async adminCreate(dto: CreateDoctorDto) {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: dto.email, name: dto.name, role: Role.DOCTOR },
        });
        return tx.doctorProfile.create({
          data: {
            userId: user.id,
            specialtyId: dto.specialtyId,
            clinicId: dto.clinicId,
            bio: dto.bio,
            experienceYears: dto.experienceYears,
            slotDurationMin: dto.slotDurationMin,
          },
          select: doctorSelect,
        });
      });
      return toPrivateDoctor(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('This email is already in use');
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException('Unknown specialty or clinic');
      }
      throw error;
    }
  }

  async adminUpdate(id: string, dto: AdminUpdateDoctorDto) {
    const { name, isActive, ...profile } = dto;
    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.doctorProfile.update({
          where: { id },
          data: profile,
          select: { userId: true },
        });
        if (name !== undefined || isActive !== undefined) {
          await tx.user.update({ where: { id: updated.userId }, data: { name, isActive } });
        }
      });
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('Doctor not found');
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException('Unknown specialty or clinic');
      }
      throw error;
    }
    return this.getForAdmin(id);
  }
}
