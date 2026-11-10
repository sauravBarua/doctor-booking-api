import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ValidatedImage } from '../uploads/image-file.pipe';
import { ImageLifecycle } from '../uploads/image-lifecycle';
import type { CreateClinicDto, UpdateClinicDto } from './clinics.dto';

const select = {
  id: true,
  name: true,
  addressLine: true,
  city: true,
  phone: true,
  imageUrl: true,
} as const;

@Injectable()
export class ClinicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageLifecycle,
  ) {}

  list() {
    return this.prisma.clinic.findMany({ select, orderBy: [{ city: 'asc' }, { name: 'asc' }] });
  }

  async get(id: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id }, select });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return clinic;
  }

  async create(dto: CreateClinicDto, image?: ValidatedImage) {
    const staged = await this.images.stage(image, 'clinicImage');
    try {
      return await this.prisma.clinic.create({
        data: { ...dto, imageUrl: staged?.url, imagePublicId: staged?.publicId },
        select,
      });
    } catch (error) {
      await this.images.abandon(staged);
      throw error;
    }
  }

  async update(id: string, dto: UpdateClinicDto, image?: ValidatedImage) {
    const staged = await this.images.stage(image, 'clinicImage');
    const { removeImage, ...fields } = dto;
    const changesImage = staged !== undefined || removeImage === true;

    const outcome = await this.prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM clinics WHERE id = ${id}::uuid FOR UPDATE`;
        const before = await tx.clinic.findUnique({
          where: { id },
          select: { imagePublicId: true },
        });
        if (!before) throw new NotFoundException('Clinic not found');
        const row = await tx.clinic.update({
          where: { id },
          data: {
            ...fields,
            ...(changesImage
              ? { imageUrl: staged?.url ?? null, imagePublicId: staged?.publicId ?? null }
              : {}),
          },
          select,
        });
        return { row, previous: before.imagePublicId };
      })
      .catch(async (error: unknown) => {
        await this.images.abandon(staged);
        throw error;
      });

    if (changesImage) await this.images.release(outcome.previous);
    return outcome.row;
  }
}
