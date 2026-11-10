import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isUniqueViolation } from '../common/utils/prisma-errors';
import { slugify } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import type { ValidatedImage } from '../uploads/image-file.pipe';
import { ImageLifecycle } from '../uploads/image-lifecycle';
import type { CreateSpecialtyDto, UpdateSpecialtyDto } from './specialties.dto';

const select = { id: true, name: true, slug: true, description: true, iconUrl: true } as const;

@Injectable()
export class SpecialtiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageLifecycle,
  ) {}

  list() {
    return this.prisma.specialty.findMany({ select, orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const specialty = await this.prisma.specialty.findUnique({ where: { id }, select });
    if (!specialty) throw new NotFoundException('Specialty not found');
    return specialty;
  }

  async create(dto: CreateSpecialtyDto, image?: ValidatedImage) {
    const staged = await this.images.stage(image, 'specialtyIcon');
    try {
      return await this.prisma.specialty.create({
        data: {
          name: dto.name,
          slug: slugify(dto.name),
          description: dto.description,
          iconUrl: staged?.url,
          iconPublicId: staged?.publicId,
        },
        select,
      });
    } catch (error) {
      await this.images.abandon(staged);
      if (isUniqueViolation(error)) {
        throw new ConflictException('A specialty with this name already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateSpecialtyDto, image?: ValidatedImage) {
    const staged = await this.images.stage(image, 'specialtyIcon');
    const { removeImage, ...fields } = dto;
    const changesImage = staged !== undefined || removeImage === true;

    const outcome = await this.prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM specialties WHERE id = ${id}::uuid FOR UPDATE`;
        const before = await tx.specialty.findUnique({
          where: { id },
          select: { iconPublicId: true },
        });
        if (!before) throw new NotFoundException('Specialty not found');
        const row = await tx.specialty.update({
          where: { id },
          data: {
            ...fields,
            ...(fields.name ? { slug: slugify(fields.name) } : {}),
            ...(changesImage
              ? { iconUrl: staged?.url ?? null, iconPublicId: staged?.publicId ?? null }
              : {}),
          },
          select,
        });
        return { row, previous: before.iconPublicId };
      })
      .catch(async (error: unknown) => {
        await this.images.abandon(staged);
        if (isUniqueViolation(error)) {
          throw new ConflictException('A specialty with this name already exists');
        }
        throw error;
      });

    if (changesImage) await this.images.release(outcome.previous);
    return outcome.row;
  }
}
