import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImageStorage, type StoredImage } from '../storage/image-storage';
import type { ValidatedImage } from './image-file.pipe';

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ImageStorage,
  ) {}

  async replace(userId: string, image: ValidatedImage): Promise<{ avatarUrl: string }> {
    const stored = await this.storage.upload(image, 'avatar');
    let previous: string | null;
    try {
      previous = await this.swap(userId, stored);
    } catch (error) {
      await this.discard(stored.publicId); // do not leave an orphan behind
      throw error;
    }
    if (previous) await this.discard(previous);
    return { avatarUrl: stored.url };
  }

  async remove(userId: string): Promise<void> {
    const previous = await this.swap(userId, null);
    if (previous) await this.discard(previous);
  }

  /** Locks the user row so concurrent changes cannot orphan an asset. Returns the previous publicId. */
  private swap(userId: string, next: StoredImage | null): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: { avatarPublicId: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: { avatarUrl: next?.url ?? null, avatarPublicId: next?.publicId ?? null },
      });
      return before?.avatarPublicId ?? null;
    });
  }

  private async discard(publicId: string): Promise<void> {
    try {
      await this.storage.delete(publicId);
    } catch (error) {
      this.logger.warn(
        `could not delete image ${publicId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
