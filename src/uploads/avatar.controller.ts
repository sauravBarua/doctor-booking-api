import { Controller, Delete, HttpCode, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
// ↓ ADJUST: same import paths as in your other controllers
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { RATE_LIMITS, RateLimit } from '../rate-limit/rate-limit.decorator';
import { AvatarService } from './avatar.service';
import { RequiredImagePipe, type ValidatedImage } from './image-file.pipe';
import { imageUploadOptions } from './image-upload.options';

@Controller('me/avatar')
@RateLimit(RATE_LIMITS.upload)
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Put()
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  replace(@CurrentUser() user: AuthUser, @UploadedFile(RequiredImagePipe) image: ValidatedImage) {
    return this.avatars.replace(user.id, image);
  }

  @Delete()
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser): Promise<void> {
    await this.avatars.remove(user.id);
  }
}
