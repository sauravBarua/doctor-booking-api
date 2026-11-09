import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isRecordNotFound, isUniqueViolation } from '../common/utils/prisma-errors';
import { slugify } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSpecialtyDto, UpdateSpecialtyDto } from './specialties.dto';

const select = { id: true, name: true, slug: true, description: true } as const;

@Injectable()
export class SpecialtiesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.specialty.findMany({ select, orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const specialty = await this.prisma.specialty.findUnique({ where: { id }, select });
    if (!specialty) throw new NotFoundException('Specialty not found');
    return specialty;
  }

  async create(dto: CreateSpecialtyDto) {
    try {
      return await this.prisma.specialty.create({
        data: { name: dto.name, slug: slugify(dto.name), description: dto.description },
        select,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A specialty with this name already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateSpecialtyDto) {
    try {
      return await this.prisma.specialty.update({
        where: { id },
        data: { ...dto, ...(dto.name ? { slug: slugify(dto.name) } : {}) },
        select,
      });
    } catch (error) {
      if (isRecordNotFound(error)) throw new NotFoundException('Specialty not found');
      if (isUniqueViolation(error)) {
        throw new ConflictException('A specialty with this name already exists');
      }
      throw error;
    }
  }
}
