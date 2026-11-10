import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ValidatedImage } from '../uploads/image-file.pipe';
import { ImageLifecycle } from '../uploads/image-lifecycle';
import type { UpdateMeDto } from './users.dto';

const profileSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageLifecycle,
  ) {}

  getProfile(id: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id }, select: profileSelect });
  }

  async updateProfile(id: string, dto: UpdateMeDto, image?: ValidatedImage) {
    const staged = await this.images.stage(image, 'avatar');
    const changesImage = staged !== undefined || dto.removeImage === true;

    const outcome = await this.prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM users WHERE id = ${id}::uuid FOR UPDATE`;
        const before = await tx.user.findUniqueOrThrow({
          where: { id },
          select: { avatarPublicId: true },
        });
        const row = await tx.user.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(changesImage
              ? { avatarUrl: staged?.url ?? null, avatarPublicId: staged?.publicId ?? null }
              : {}),
          },
          select: profileSelect,
        });
        return { row, previous: before.avatarPublicId };
      })
      .catch(async (error: unknown) => {
        await this.images.abandon(staged);
        throw error;
      });

    if (changesImage) await this.images.release(outcome.previous);
    return outcome.row;
  }
}
