import { Injectable, NotFoundException } from '@nestjs/common';
import { isRecordNotFound } from '../common/utils/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClinicDto, UpdateClinicDto } from './clinics.dto';

const select = { id: true, name: true, addressLine: true, city: true, phone: true } as const;

@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.clinic.findMany({ select, orderBy: [{ city: 'asc' }, { name: 'asc' }] });
  }

  async get(id: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id }, select });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return clinic;
  }

  create(dto: CreateClinicDto) {
    return this.prisma.clinic.create({ data: dto, select });
  }

  async update(id: string, dto: UpdateClinicDto) {
    try {
      return await this.prisma.clinic.update({ where: { id }, data: dto, select });
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('Clinic not found');
      throw error;
    }
  }
}
